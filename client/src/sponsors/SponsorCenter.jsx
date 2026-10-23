import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { accountSessionKey } from '../notifications/scheduler';
import { clearRouteListCache } from '../utils/navigationState';
import { createSponsorAPI } from './userAPI.js';
import {
  validateCatalog, validateMe, validateHistory, isActiveSponsor, safeSponsorPurchaseURL,
  planDuration, formatBytes, formatSponsorTime, redemptionOperation, createForegroundReadTimer,
} from './userModel.js';
import './userSponsors.css';

const PAGE_SIZE = 20;
const MAX_TIMER = 2147483647;
const LOGIN_STATE = { from: '/sponsors' };
const BENEFIT_STATUS = { automatic: '自动生效', available: '可使用', coming_soon: '即将推出' };
const ANSWERS = ['订单详情按钮', '私信按钮', '再次付款按钮', '本站自动到账'];
const normalizeCode = value => value.replace(/\s+/gu, '').toUpperCase();
const price = plan => plan.currency === 'CNY' && Number.isSafeInteger(plan.price_minor)
  ? `¥${(plan.price_minor / 100).toFixed(2)}` : '价格暂不可用';
const sortItems = items => [...items].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const purchaseFingerprint = (config, plan) => JSON.stringify(canonical({ config, plan }));
const foregroundNow = () => document.visibilityState === 'visible' && document.hasFocus();

function Icon({ name, className = '' }) {
  return <i className={`fa-solid ${name} ${className}`} aria-hidden="true" />;
}
function Notice({ children, tone = 'info', alert = false }) {
  return <div className={`sc-notice sc-notice--${tone}`} role={alert ? 'alert' : 'status'}>{children}</div>;
}
function LoginLink({ children = '重新登录' }) {
  return <Link className="sc-link" to="/login" state={LOGIN_STATE}>{children}</Link>;
}
function Frame({ children }) {
  // 主站 PageLayout 带 page-container，移动站直接渲染 children；局部 CSS 同时兼容。
  return <div className="sponsor-page"><PageLayout><main className="sponsor-center" aria-label="赞助中心">{children}</main></PageLayout></div>;
}
function Intro({ title = '赞助中心', children }) {
  return <header className="sc-hero">
    <div className="sc-eyebrow"><Icon name="fa-heart" /> 与社区一起，走得更远</div>
    <h1>{title}</h1>
    <p>一份支持，让每一次相遇都更美好。</p>
    <div className="sc-journey" aria-label="赞助流程">
      <span><b>01</b> 爱发电购买</span><Icon name="fa-chevron-right" />
      <span><b>02</b> 私信取兑换码</span><Icon name="fa-chevron-right" />
      <span><b>03</b> 回到本站兑换</span>
    </div>
    {children}
  </header>;
}

export default function SponsorCenter() {
  const { user, loading, accounts, refreshUser } = useAuth();
  const sessionKey = accountSessionKey(user, accounts);
  const currentSession = useRef(sessionKey);
  // 渲染切号时立刻撤销旧请求，不等待旧组件的 effect cleanup。
  currentSession.current = sessionKey;
  if (loading) return <Frame><Intro /><Notice>正在确认当前登录账号…</Notice></Frame>;
  if (!user) return <Frame><Intro /><section className="sc-panel sc-empty">
    <Icon name="fa-user-lock" /><h2>登录后，查看你的赞助权益</h2>
    <p>赞助身份与兑换记录属于当前账号。购买前请先确认要使用的账号。</p>
    <LoginLink>登录并返回赞助中心</LoginLink>
  </section></Frame>;
  const token = accounts?.find(account => String(account.id) === String(user.id))?.token || '';
  return <SponsorSession key={sessionKey} {...{ user, token, sessionKey, currentSession, refreshUser }} />;
}

function SponsorSession({ user, token, sessionKey, currentSession, refreshUser }) {
  const alive = useRef(true);
  const controllers = useRef(new Set());
  const loadFlight = useRef(null);
  const mutationLock = useRef(false);
  const checkedBoundaries = useRef(new Set());
  const redeemInput = useRef(null);
  const purchaseButton = useRef(null);
  const [page, setPage] = useState({ catalog: null, me: null, phase: 'loading', error: '' });
  const latestPage = useRef(page);
  latestPage.current = page;
  const readGeneration = useRef(0);
  const [nowSeconds, setNowSeconds] = useState(() => Date.now() / 1000);
  const [action, setAction] = useState({ busy: '', tone: 'info', message: '' });
  const [code, setCode] = useState('');
  const [redemption, setRedemption] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [selectedColorKey, setSelectedColorKey] = useState('');
  const [guidePlanId, setGuidePlanId] = useState(null);
  const [guideNotice, setGuideNotice] = useState('');
  const [externalVisited, setExternalVisited] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const claimOperations = useRef(new Map());
  const isCurrent = useCallback(() => alive.current && currentSession.current === sessionKey, [currentSession, sessionKey]);
  const api = useMemo(() => createSponsorAPI({
    base: import.meta.env.VITE_API_BASE ?? '', getToken: () => token, isCurrentSession: isCurrent,
  }), [token, isCurrent]);

  const request = useCallback(async task => {
    const controller = new AbortController();
    const check = () => {
      if (!isCurrent() || controller.signal.aborted) throw new DOMException('会话已失效', 'AbortError');
    };
    controllers.current.add(controller);
    try {
      check();
      const result = await task(controller.signal, check);
      check();
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new DOMException('请求已取消', 'AbortError');
      throw error;
    } finally { controllers.current.delete(controller); }
  }, [isCurrent]);

  const load = useCallback(() => {
    if (!isCurrent()) return Promise.resolve(null);
    if (loadFlight.current) return loadFlight.current;
    readGeneration.current += 1;
    setPage(previous => ({ ...previous, phase: 'loading', error: '' }));
    const flight = request(async (signal, check) => {
      const catalog = validateCatalog(await api.catalog({ signal }));
      check();
      const me = validateMe(await api.me({ signal }));
      check();
      return { catalog, me };
    }).then(result => {
      if (!isCurrent()) return null;
      const matches = result.catalog.config.version === result.me.config_version;
      setNowSeconds(Date.now() / 1000);
      setPage({ ...result, phase: matches ? 'ready' : 'stale', error: matches ? '' : '目录与身份配置版本不一致，请手动刷新后再操作。' });
      return matches ? result : null;
    }).catch(error => {
      if (!isCurrent() || error.name === 'AbortError') return null;
      setPage(previous => ({ ...previous,
        phase: error.status === 401 ? 'unauthorized' : previous.me ? 'stale' : 'error',
        error: error.status === 401 ? '登录已过期，尚未确认任何新操作，请重新登录。'
          : `${error.message || '读取赞助信息失败'}。保留的资料可能已经过期，请手动刷新后再操作。`,
      }));
      return null;
    }).finally(() => { if (loadFlight.current === flight) loadFlight.current = null; });
    loadFlight.current = flight;
    return flight;
  }, [api, isCurrent, request]);

  useEffect(() => {
    alive.current = true;
    void load();
    const activeControllers = controllers.current;
    return () => {
      alive.current = false;
      activeControllers.forEach(controller => controller.abort());
      activeControllers.clear();
      loadFlight.current = null;
    };
  }, [load]);

  // 只在真正离开、再回到前台且超过 30 秒时读取；focus/visibility 共用一个预算。
  useEffect(() => {
    let awayAt = foregroundNow() ? null : performance.now();
    let lastReturnRead = -Infinity;
    const activity = () => {
      if (!foregroundNow()) {
        if (awayAt === null) awayAt = performance.now();
        return;
      }
      setNowSeconds(Date.now() / 1000);
      if (awayAt === null) return;
      const now = performance.now();
      const elapsed = now - awayAt;
      awayAt = null;
      if (elapsed > 30000 && now - lastReturnRead > 30000 && !mutationLock.current) {
        lastReturnRead = now;
        void load();
      }
    };
    window.addEventListener('focus', activity);
    window.addEventListener('blur', activity);
    document.addEventListener('visibilitychange', activity);
    return () => {
      window.removeEventListener('focus', activity);
      window.removeEventListener('blur', activity);
      document.removeEventListener('visibilitychange', activity);
    };
  }, [load]);

  const config = page.catalog?.config;
  const me = page.me;
  const permanent = me?.sponsor.permanent === true;
  const active = isActiveSponsor(me?.sponsor, nowSeconds);
  const fresh = page.phase === 'ready' && config?.version === me?.config_version;
  const canOperate = fresh && config.enabled && !action.busy;
  const plans = useMemo(() => sortItems((page.catalog?.plans || []).filter(plan => plan.enabled)), [page.catalog]);
  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) || plans[0] || null;
  const guidePlan = plans.find(plan => plan.id === guidePlanId);
  const colors = useMemo(() => (config?.colors || []).filter(color => color.permanent_only === permanent), [config, permanent]);
  const selectedColor = colors.find(color => color.key === selectedColorKey)
    || colors.find(color => color.key === me?.sponsor.color_key) || colors[0];
  const benefits = useMemo(() => sortItems(config?.benefits || []), [config]);
  const colorAvailable = benefits.some(benefit => benefit.action === 'color' && benefit.status === 'available');

  // 只为到期/额度重置安排一次读取；旧响应仍给出同一边界时不会形成请求循环。
  useEffect(() => {
    if (!me) return undefined;
    const times = [me.quota.resets_at, !me.sponsor.permanent && me.sponsor.active ? me.sponsor.expires_at : null]
      .filter(value => typeof value === 'number' && !checkedBoundaries.current.has(value)).sort((a, b) => a - b);
    if (!times.length) return undefined;
    const boundary = times[0];
    let timer;
    const schedule = () => {
      const delay = boundary * 1000 - Date.now() + 250;
      if (delay > MAX_TIMER) { timer = setTimeout(schedule, MAX_TIMER); return; }
      timer = setTimeout(() => {
        if (!isCurrent()) return;
        checkedBoundaries.current.add(boundary);
        setNowSeconds(Date.now() / 1000);
        void load();
      }, Math.max(0, delay));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [me, load, isCurrent]);

  const refreshFresh = useCallback(async () => {
    // 写入完成后不能复用写入之前启动的读取快照。
    if (loadFlight.current) await loadFlight.current;
    if (!isCurrent()) return null;
    return load();
  }, [isCurrent, load]);
  const refreshIdentity = useCallback(async () => {
    if (!isCurrent()) return;
    await Promise.all([
      refreshFresh(),
      request(() => refreshUser()).catch(() => undefined),
    ]);
  }, [isCurrent, refreshFresh, refreshUser, request]);

  function handleOperationError(error, kind) {
    if (!isCurrent() || error.name === 'AbortError') return;
    if (error.status === 401) {
      setPage(previous => ({ ...previous, phase: 'unauthorized', error: '登录已过期，请重新登录后核查身份与记录。' }));
    } else if (error.status === 409 || error.code === 'CONFIG_VERSION_MISMATCH') {
      setPage(previous => ({ ...previous, phase: 'stale', error: '配置或权益状态已变化，请刷新后重试。' }));
    }
    setAction({ busy: '', tone: 'warning', message: error.unknownOutcome
      ? `${error.message || `${kind}结果尚未确认`}。请先刷新身份，不要重复购买；同一兑换码重试会沿用原操作标识。`
      : error.status === 401 ? '尚未确认操作成功，请重新登录并核查。'
        : `${error.message || `${kind}未完成`}。请刷新状态后重试；如仍不可用，请联系维护者核查。` });
  }

  async function redeem(event) {
    event.preventDefault();
    if (mutationLock.current || !canOperate || permanent || !code.trim()) return;
    mutationLock.current = true;
    const submitted = code;
    const preparedGeneration = readGeneration.current;
    let posted = false;
    setAction({ busy: 'redeem', tone: 'info', message: '正在安全准备兑换操作…' });
    setRedemption(null);
    try {
      // 模型只持久化摘要和 operation_id；原码不进地址、日志或明文存储。
      const body = await redemptionOperation(`${window.location.origin}:${user.id}`, submitted);
      if (!isCurrent()) return;
      const latest = latestPage.current;
      if (preparedGeneration !== readGeneration.current || loadFlight.current
        || latest.phase !== 'ready' || !latest.catalog?.config.enabled || !latest.me
        || latest.me.sponsor.permanent || latest.me.config_version !== latest.catalog.config.version) {
        setRedemption({ tone: 'warning', message: '准备兑换期间身份或配置发生变化，尚未提交兑换。输入已保留，请核查最新身份后重试。' });
        setAction({ busy: '', tone: 'info', message: '' });
        return;
      }
      posted = true;
      const result = validateMe(await request(signal => api.redeem(body, { signal })));
      if (!isCurrent()) return;
      setRedemption({ tone: 'success', message: result.message || '服务器已确认兑换，请以下方重新读取的身份为准。' });
      setCode(current => normalizeCode(current) === body.code ? '' : current);
      setAction({ busy: 'redeem', tone: 'info', message: '正在重新读取最新身份与额度…' });
      setHistoryRevision(value => value + 1);
      clearRouteListCache();
      window.__apiCache?.clear();
      // 幂等返回可能是旧快照，不将写入响应直接作为当前身份。
      await refreshIdentity();
      if (isCurrent()) setAction({ busy: '', tone: 'info', message: '已请求刷新身份，请核对当前身份和额度；如读取失败，可手动刷新。' });
    } catch (error) {
      if (!isCurrent() || error.name === 'AbortError') return;
      if (!posted) {
        setRedemption({ tone: 'warning', message: error.message || '无法安全准备或保存兑换操作，尚未提交。请确认浏览器存储及加密功能可用后重试。' });
        setAction({ busy: '', tone: 'info', message: '' });
      } else {
        handleOperationError(error, '兑换');
        setRedemption({ tone: 'warning', message: error.unknownOutcome
          ? '兑换结果尚未确认。输入已保留，请先刷新身份；使用同一码重试会沿用同一个操作标识。'
          : '兑换未确认成功，输入已保留。请检查兑换码或重新登录后核查，不要重复购买。' });
      }
    } finally {
      mutationLock.current = false;
      if (isCurrent()) setAction(previous => ({ ...previous, busy: '' }));
    }
  }

  async function updateBenefit(kind, benefit) {
    if (mutationLock.current || !canOperate || !isActiveSponsor(me?.sponsor, Date.now() / 1000)) return;
    if (kind === 'color' && (!selectedColor || !colorAvailable)) return;
    mutationLock.current = true;
    setAction({ busy: kind === 'color' ? 'color' : benefit.id, tone: 'info', message: '正在提交权益设置…' });
    try {
      await request(signal => {
        if (kind === 'color') return api.color(selectedColor.key, { signal });
        let operationId = claimOperations.current.get(benefit.id);
        if (!operationId) {
          operationId = crypto.randomUUID();
          claimOperations.current.set(benefit.id, operationId);
        }
        return api.claim({ benefit_id: benefit.id, operation_id: operationId }, { signal });
      });
      if (!isCurrent()) return;
      if (kind !== 'color') claimOperations.current.delete(benefit.id);
      clearRouteListCache();
      window.__apiCache?.clear();
      setAction(previous => ({ ...previous, tone: 'success', message: kind === 'color' ? '颜色已保存，正在刷新身份。' : '服务器已确认领取，正在刷新权益记录。' }));
      await refreshIdentity();
    } catch (error) { handleOperationError(error, kind === 'color' ? '颜色设置' : '权益领取'); }
    finally {
      mutationLock.current = false;
      if (isCurrent()) setAction(previous => ({ ...previous, busy: '' }));
    }
  }

  function closeGuide(toRedeem = false) {
    setGuidePlanId(null);
    setGuideNotice('');
    requestAnimationFrame(() => {
      if (!isCurrent()) return;
      (toRedeem ? redeemInput.current : purchaseButton.current)?.focus();
      if (toRedeem) redeemInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  const identity = permanent ? '永久赞助者' : active ? '当前赞助者'
    : me?.sponsor.expires_at !== null && me?.sponsor.expires_at <= nowSeconds ? '赞助已到期' : '普通用户';

  return <Frame>
    <Intro title={config?.center_title || '赞助中心'} />
    <div className="sc-toolbar">
      <p><Icon name="fa-shield-heart" /> 身份、额度与套餐均以服务器最新数据为准</p>
      <button type="button" className="sc-button sc-button--quiet" disabled={page.phase === 'loading' || Boolean(action.busy)} onClick={() => { void refreshIdentity(); }}>
        <Icon name="fa-rotate-right" /> {page.phase === 'loading' ? '正在刷新' : '刷新身份'}
      </button>
    </div>
    {page.phase === 'loading' && <Notice>正在依次读取套餐目录与当前账号身份，完成前暂停操作…</Notice>}
    {page.error && <Notice tone="warning" alert>{page.error} {page.phase === 'unauthorized' && <LoginLink />}</Notice>}
    {config && !config.enabled && <Notice tone="warning">赞助中心当前暂停开放。你仍可查看已读取的身份与历史，不会提交购买、兑换或权益变更。</Notice>}
    {externalVisited && <Notice tone="warning">从爱发电返回并不代表本站权益已生效。付款后请点击爱发电的「私信」取得兑换码，再回到下方兑换；本站不会自动验单。</Notice>}
    {action.message && <Notice tone={action.tone} alert={action.tone === 'warning'}>{action.message}</Notice>}

    <section className="sc-account sc-panel" aria-labelledby="sc-account-title">
      <div className="sc-account-main">
        <div className="sc-avatar" aria-hidden="true">{(user.nickname || user.display_name || user.username || '我').slice(0, 1)}</div>
        <div><p className="sc-kicker" id="sc-account-title">当前使用账号</p>
          <h2>{user.nickname || user.display_name || user.username || '当前账号'}</h2>
          <p className="sc-muted">@{user.username || user.id}</p>
        </div>
        <span className={`sc-status${active ? ' sc-status--active' : ''}`}><Icon name={permanent ? 'fa-crown' : active ? 'fa-heart' : 'fa-user'} /> {me ? identity : '身份待读取'}</span>
      </div>
      <div className="sc-account-detail"><span>{me?.sponsor.plan_name || '每一份支持，都值得被珍惜'}</span>
        <strong>{!me ? '等待服务器确认' : permanent ? '永久有效，无需重复购买' : me.sponsor.expires_at !== null ? `到期 ${formatSponsorTime(me.sponsor.expires_at)}（上海）` : '暂未开通赞助身份'}</strong>
      </div>
    </section>

    {me && <section className="sc-quota-grid" aria-label="当前账号额度">
      <article className="sc-panel sc-quota"><div className="sc-section-heading"><div><p className="sc-kicker">每日原图</p><h2>看见更多细节</h2></div><Icon name="fa-image" /></div>
        <div className="sc-quota-number"><strong>{me.quota.remaining}</strong><span>次剩余 / 今日上限 {me.quota.limit} 次</span></div>
        <progress className="sc-progress" max={Math.max(1, me.quota.limit)} value={Math.min(me.quota.used, me.quota.limit)} aria-label="今日原图额度已用" />
        <p>已使用 {me.quota.used} 次 · 剩余 {me.quota.remaining} 次</p>
        <p className="sc-muted">重置 {formatSponsorTime(me.quota.resets_at)}（上海）</p>
        <p className="sc-fine">原图按服务端每日额度使用，并非无限次。</p>
      </article>
      <article className="sc-panel sc-quota"><div className="sc-section-heading"><div><p className="sc-kicker">相册空间</p><h2>装下珍贵的瞬间</h2></div><Icon name="fa-cloud" /></div>
        {me.album_quota == null ? <div className="sc-quota-unavailable"><strong>暂不可用</strong><p className="sc-muted">服务器尚未提供相册额度，不以 0 代替。</p></div> : <>
          <div className="sc-quota-number"><strong>{formatBytes(me.album_quota.remaining_bytes)}</strong><span>剩余空间</span></div>
          <progress className="sc-progress" max={Math.max(1, me.album_quota.limit_bytes)} value={Math.min(me.album_quota.limit_bytes, me.album_quota.used_bytes + me.album_quota.reserved_bytes)} aria-label="相册空间已用及预留" />
          <p>已用 {formatBytes(me.album_quota.used_bytes)} / {formatBytes(me.album_quota.limit_bytes)}</p>
          <p className="sc-muted">预留 {formatBytes(me.album_quota.reserved_bytes)} · {me.album_quota.original_upload_allowed ? '支持原图上传' : '当前不可上传原图'}</p>
        </>}
      </article>
    </section>}

    {!permanent && config && <section className="sc-panel" aria-labelledby="sc-plans-title">
      <div className="sc-section-heading"><div><p className="sc-kicker">支持你喜欢的社区</p><h2 id="sc-plans-title">选择一份心意</h2></div><span className="sc-chip">CNY 人民币</span></div>
      <p className="sc-muted">在爱发电完成购买，再用私信中的兑换码激活本站权益。</p>
      {plans.length ? <>
        <fieldset className="sc-plans" disabled={!canOperate}><legend className="sc-sr-only">选择赞助套餐</legend>
          {plans.map(plan => <label key={plan.id} className={`sc-plan${selectedPlan?.id === plan.id ? ' is-selected' : ''}`}>
            <input type="radio" name="sponsor-plan" value={plan.id} checked={selectedPlan?.id === plan.id} onChange={() => { setSelectedPlanId(plan.id); setGuidePlanId(null); }} />
            <span className="sc-plan-name">{plan.name}<Icon name={selectedPlan?.id === plan.id ? 'fa-circle-check' : 'fa-circle'} /></span>
            <span className="sc-plan-price">{price(plan)}</span><span className="sc-plan-duration">{planDuration(plan)}</span>
            {plan.description && <span className="sc-plan-description">{plan.description}</span>}
          </label>)}
        </fieldset>
        <div className="sc-purchase-row"><div><strong>{selectedPlan?.name}</strong><p className="sc-muted">{selectedPlan && `${price(selectedPlan)} · ${planDuration(selectedPlan)}`}</p></div>
          <button ref={purchaseButton} type="button" className="sc-button sc-button--primary" disabled={!canOperate || !selectedPlan || !safeSponsorPurchaseURL(selectedPlan)} onClick={() => { setGuideNotice(''); setGuidePlanId(selectedPlan.id); }}><Icon name="fa-arrow-up-right-from-square" /> 阅读购买指引</button>
        </div>
        {selectedPlan && !safeSponsorPurchaseURL(selectedPlan) && <p className="sc-fine">此套餐暂未配置可核验的安全购买链接，暂不可外购；请联系维护者，不要使用陌生链接。</p>}
      </> : <div className="sc-empty"><Icon name="fa-box-open" /><h3>暂时没有上架的套餐</h3><p>请稍后手动刷新；已有兑换码仍可在中心开放时兑换。</p></div>}
    </section>}

    {!permanent && guidePlanId && config && <>
      {guideNotice && <Notice tone="warning" alert>{guideNotice}</Notice>}
      {guidePlan ? <PurchaseGuide key={purchaseFingerprint(config, guidePlan)} config={config} plan={guidePlan} user={user}
        ready={canOperate} isCurrent={isCurrent} refreshFresh={refreshFresh}
        onChanged={() => setGuideNotice('购买配置或套餐已变化，旧问答与链接已撤销。请按更新后的内容重新完整阅读。')}
        onClose={() => closeGuide()} onRedeem={() => closeGuide(true)} onExternal={() => setExternalVisited(true)} />
        : <Notice tone="warning">该套餐已下架，旧购买核验已失效。请重新选择套餐。 <button type="button" className="sc-text-button" onClick={() => closeGuide()}>关闭指引</button></Notice>}
    </>}

    {!permanent && <section className="sc-panel sc-redeem" aria-labelledby="sc-redeem-title">
      <div className="sc-section-heading"><div><p className="sc-kicker">最后一步，在这里生效</p><h2 id="sc-redeem-title">兑换赞助权益</h2></div><Icon name="fa-ticket" /></div>
      <p className="sc-muted">在爱发电付款后，点击「私信」查看兑换码。请确认当前账号，再粘贴兑换。</p>
      <form onSubmit={redeem} className="sc-redeem-form">
        <label htmlFor="sc-redemption-code">兑换码</label>
        <div className="sc-input-row"><input ref={redeemInput} id="sc-redemption-code" type="text" name="sponsor-redemption-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={160} placeholder="粘贴私信中的兑换码" aria-describedby="sc-code-help" disabled={Boolean(action.busy)} />
          <button type="submit" className="sc-button sc-button--primary" disabled={!canOperate || !code.trim()}>{action.busy === 'redeem' ? '正在兑换…' : '确认兑换'}</button>
        </div>
        <p id="sc-code-help" className="sc-fine">兑换至 @{user.username || user.id}。原码不会写入页面地址或明文持久存储。结果未知时请勿重复购买。</p>
      </form>
      {redemption && <Notice tone={redemption.tone} alert={redemption.tone !== 'success'}>{redemption.message}</Notice>}
      <div className="sc-inline-links"><button type="button" className="sc-text-button" disabled={page.phase === 'loading' || Boolean(action.busy)} onClick={() => { void refreshIdentity(); }}>刷新身份核查结果</button><LoginLink /></div>
    </section>}
    {permanent && <Notice tone="success"><Icon name="fa-crown" /> 你已拥有永久赞助身份，已隐藏购买与兑换入口，避免重复付款。你仍可管理颜色、权益并查看兑换记录。</Notice>}

    {config && <section className="sc-panel" aria-labelledby="sc-benefits-title">
      <div className="sc-section-heading"><div><p className="sc-kicker">让支持，看得见</p><h2 id="sc-benefits-title">你的赞助权益</h2></div><Icon name="fa-gift" /></div>
      {benefits.length ? <div className="sc-benefits">{benefits.map(benefit => {
        const claimed = me?.claimed_benefit_ids.includes(benefit.id);
        return <article key={benefit.id} className="sc-benefit">
          <div className="sc-benefit-icon"><Icon name={benefit.action === 'color' ? 'fa-palette' : benefit.action === 'original' ? 'fa-image' : benefit.action === 'claim' ? 'fa-gift' : 'fa-star'} /></div>
          <div className="sc-benefit-copy"><h3>{benefit.title}</h3>{benefit.description && <p>{benefit.description}</p>}
            {benefit.action === 'original' && <p className="sc-fine">按当前身份和每日原图额度自动生效，剩余次数见上方；不代表无限次使用。</p>}
            {benefit.action === 'color' && <p className="sc-fine">下方选择内置颜色并预览，保存后更新赞助标识。</p>}
            {benefit.action === 'claim' && claimed && <p className="sc-claimed"><Icon name="fa-check" /> 当前账号已领取此项权益</p>}
          </div>
          <div className="sc-benefit-action"><span className={`sc-chip${benefit.status === 'coming_soon' ? ' sc-chip--muted' : ''}`}>{BENEFIT_STATUS[benefit.status]}</span>
            {benefit.action === 'claim' && benefit.status === 'available' && <button type="button" className="sc-button sc-button--small" disabled={!canOperate || !active || claimed} onClick={() => { void updateBenefit('claim', benefit); }}>{claimed ? '已领取' : action.busy === benefit.id ? '领取中…' : '领取权益'}</button>}
          </div>
        </article>;
      })}</div> : <p className="sc-muted">暂未配置展示权益。</p>}
      {!active && <p className="sc-fine">可领取与颜色设置需当前有效的赞助身份；即将推出的权益暂不开放操作。</p>}
    </section>}

    {config && <section className="sc-panel" aria-labelledby="sc-color-title">
      <div className="sc-section-heading"><div><p className="sc-kicker">一点专属的色彩</p><h2 id="sc-color-title">赞助标识颜色</h2></div><Icon name="fa-palette" /></div>
      <p className="sc-muted">{permanent ? '永久赞助者仅展示永久专属内置颜色。' : '普通及限期账号仅展示非永久专属内置颜色。'}</p>
      {colors.length && selectedColor ? <>
        <fieldset className="sc-colors" disabled={!canOperate || !active || !colorAvailable}><legend className="sc-sr-only">选择赞助标识颜色</legend>{colors.map(color => <label key={color.key} className={`sc-color-option${selectedColor.key === color.key ? ' is-selected' : ''}`} style={{ '--sc-color-light': color.light, '--sc-color-dark': color.dark }}>
          <input type="radio" name="sponsor-color" value={color.key} checked={selectedColor.key === color.key} onChange={() => setSelectedColorKey(color.key)} /><span className="sc-color-dot" aria-hidden="true" /><span>{color.name}</span>{selectedColor.key === color.key && <Icon name="fa-check" />}
        </label>)}</fieldset>
        <div className="sc-color-preview" style={{ '--sc-color-light': selectedColor.light, '--sc-color-dark': selectedColor.dark }}><span className="sc-muted">标识预览</span><span className="sc-preview-badge"><Icon name={permanent ? 'fa-crown' : 'fa-heart'} /> {permanent ? '永久赞助者' : '赞助者'}</span><strong>{user.nickname || user.display_name || user.username}</strong></div>
        <div className="sc-purchase-row"><p className="sc-fine">仅预览不会保存。浅色、深色与多彩主题使用对应内置配色。</p><button type="button" className="sc-button" disabled={!canOperate || !active || !colorAvailable || selectedColor.key === me?.sponsor.color_key} onClick={() => { void updateBenefit('color'); }}>{action.busy === 'color' ? '正在保存…' : '保存颜色'}</button></div>
      </> : <p className="sc-muted">当前身份暂无可选内置颜色。</p>}
    </section>}

    <SponsorHistory api={api} request={request} isCurrent={isCurrent} revision={historyRevision} disabled={page.phase === 'unauthorized'} />
    <footer className="sc-footer"><Icon name="fa-shield-halved" /><p>本站没有订单或自动验单。外部付款后仍需私信取码、回到本站兑换。请勿向任何人提供登录令牌或完整兑换码。</p></footer>
  </Frame>;
}

function PurchaseGuide({ config, plan, user, ready, isCurrent, refreshFresh, onChanged, onClose, onRedeem, onExternal }) {
  const section = useRef(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const foregroundEpoch = useRef(0);
  const [stage, setStage] = useState('read');
  const [elapsed, setElapsed] = useState(0);
  const [foreground, setForeground] = useState(foregroundNow);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const timer = useMemo(() => createForegroundReadTimer({ requiredSeconds: config.minimum_read_seconds, now: () => performance.now() }), [config.minimum_read_seconds]);
  const fingerprint = purchaseFingerprint(config, plan);
  const safeURL = safeSponsorPurchaseURL(plan);
  const remaining = Math.max(0, Math.ceil(config.minimum_read_seconds - elapsed));

  useEffect(() => {
    mounted.current = true;
    section.current?.focus();
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    const activity = () => {
      const next = foregroundNow();
      if (!next) {
        foregroundEpoch.current += 1;
        timer.setActive(false);
        setStage('read');
        setAnswer('');
        setError('已离开前台，旧问答与外链已撤销。返回后请重新点击继续核验。');
      }
      setForeground(next);
      setElapsed(timer.elapsedSeconds());
    };
    window.addEventListener('focus', activity);
    window.addEventListener('blur', activity);
    document.addEventListener('visibilitychange', activity);
    return () => {
      timer.setActive(false);
      window.removeEventListener('focus', activity);
      window.removeEventListener('blur', activity);
      document.removeEventListener('visibilitychange', activity);
    };
  }, [timer]);
  useEffect(() => {
    timer.setActive(foreground && ready && stage === 'read');
    // 自己重新 GET 的 loading 阶段不重置新问答；其他失效仍撤销旧授权。
    if (!ready && !busy) { setStage('read'); setAnswer(''); }
    if (!foreground || !ready || stage !== 'read') return undefined;
    const interval = setInterval(() => setElapsed(timer.elapsedSeconds()), 250);
    return () => { clearInterval(interval); timer.setActive(false); };
  }, [timer, foreground, ready, stage, busy]);

  async function continueReading() {
    if (lock.current || !ready || !foregroundNow() || !timer.complete()) return;
    lock.current = true;
    const verificationEpoch = foregroundEpoch.current;
    setBusy(true);
    setError('');
    try {
      const latest = await refreshFresh();
      if (!mounted.current || !isCurrent()) return;
      if (verificationEpoch !== foregroundEpoch.current) {
        setStage('read'); setAnswer('');
        setError('核验期间曾离开前台，旧问答与链接已撤销。请重新点击继续核验。');
        return;
      }
      if (!latest) { setError('无法重新核验服务器配置，未打开外链。请恢复网络并刷新后重试。'); return; }
      const latestPlan = latest.catalog.plans.find(item => item.id === plan.id && item.enabled);
      if (!latest.catalog.config.enabled || latest.me.sponsor.permanent || !latestPlan
        || fingerprint !== purchaseFingerprint(latest.catalog.config, latestPlan)) {
        timer.reset(); setElapsed(0); setStage('read'); setAnswer(''); onChanged();
        return;
      }
      if (!foregroundNow()) { setError('请回到前台重新核验，未打开外链。'); return; }
      if (!safeSponsorPurchaseURL(latestPlan)) { setError('安全购买链接不可用，未打开外链。'); return; }
      setStage('quiz');
      setAnswer('');
    } catch {
      if (mounted.current && isCurrent()) setError('网络核验失败，未打开外链。请手动刷新后重试。');
    } finally {
      lock.current = false;
      if (mounted.current && isCurrent()) setBusy(false);
    }
  }
  function checkAnswer(event) {
    event.preventDefault();
    if (!ready || !foregroundNow() || !isCurrent()) return;
    if (answer !== '私信按钮') { setError('还差一步：付款后要点击「私信按钮」查看兑换码。请重新选择，当前指引不会关闭。'); return; }
    setError('');
    setStage('verified');
  }

  return <section ref={section} className="sc-panel sc-guide" tabIndex={-1} aria-labelledby="sc-guide-title" aria-describedby="sc-guide-summary">
    <div className="sc-section-heading"><div><p className="sc-kicker">购买前，请先读完</p><h2 id="sc-guide-title">{config.purchase_title}</h2></div><button type="button" className="sc-button sc-button--quiet" onClick={onClose} aria-label="关闭购买指引"><Icon name="fa-xmark" /> 关闭</button></div>
    <p id="sc-guide-summary">外部付款不会自动开通本站权益。你需要在爱发电的「私信」取得兑换码，再返回本站兑换。</p>
    <dl className="sc-guide-summary"><div><dt>选定套餐</dt><dd>{plan.name}</dd></div><div><dt>价格与期限</dt><dd>{price(plan)} · {planDuration(plan)}</dd></div><div><dt>适用本站账号</dt><dd>{user.nickname || user.display_name || user.username}（@{user.username || user.id}）</dd></div></dl>
    <ol className="sc-guide-steps">{config.purchase_steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
    <div className="sc-guide-images">{[1, 2].map(number => <figure key={number}><img src={`/sponsors/payment-guide-${number}.png`} alt={number === 1 ? '爱发电购买流程示意图' : '付款后点击私信按钮查看兑换码的操作示意图'} loading="eager" decoding="async" /><figcaption>指引 {number} · 付款后点击「私信」查看兑换码。截图中的套餐、价格仅为示意，实际以当前选定套餐和爱发电页面为准。</figcaption></figure>)}</div>
    <Notice>请勿重复付款。爱发电完成购买后，仍需手动复制兑换码并回到本站兑换；无需提供本站登录令牌。</Notice>
    {error && <Notice tone="warning" alert>{error}</Notice>}
    {stage === 'read' && <div className="sc-read-gate">
      <div><strong>{remaining > 0 ? `请继续阅读 ${remaining} 秒` : '阅读时长已满足，请继续核验'}</strong><p className="sc-muted">至少前台阅读 {config.minimum_read_seconds} 秒，仅页面可见且窗口有焦点时计时；后台或失焦会暂停。</p></div>
      <progress className="sc-progress" max={config.minimum_read_seconds} value={Math.min(config.minimum_read_seconds, elapsed)} aria-label="购买指引前台阅读进度" />
      <button type="button" className="sc-button sc-button--primary" disabled={!ready || busy || !foreground || remaining > 0} onClick={() => { void continueReading(); }}>{busy ? '正在重新核验配置…' : '已阅读，继续核验'}</button>
      <p className="sc-fine">继续时会重新读取完整配置与所选套餐；内容变化需重新阅读，网络失败不会打开外链。</p>
    </div>}
    {stage === 'quiz' && ready && <form className="sc-quiz" onSubmit={checkAnswer}>
      <fieldset><legend>爱发电付款成功后，点击什么查看兑换码？</legend><div className="sc-quiz-options">{ANSWERS.map(option => <label key={option}><input type="radio" name="sponsor-guide-answer" value={option} checked={answer === option} onChange={() => setAnswer(option)} />{option}</label>)}</div></fieldset>
      <div className="sc-inline-links"><button type="submit" className="sc-button sc-button--primary" disabled={!answer}>确认答案</button><button type="button" className="sc-button sc-button--quiet" onClick={onClose}>取消，不前往</button></div>
    </form>}
    {stage === 'verified' && ready && foreground && safeURL && <div className="sc-verified"><h3><Icon name="fa-circle-check" /> 指引与安全链接已核验</h3><p>下一步将前往爱发电购买。打开失败时可检查浏览器拦截或稍后重试；已付款请不要重复购买。</p>
      <a className="sc-button sc-button--primary" href={safeURL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" onClick={event => { if (!isCurrent() || !foregroundNow()) { event.preventDefault(); return; } onExternal(); }} onAuxClick={event => { if (event.button === 1) onExternal(); }}>打开爱发电购买 <Icon name="fa-arrow-up-right-from-square" /></a>
      <p className="sc-fine">外部购买链接不携带本站账号令牌；最终交易信息请在爱发电自行核对。</p>
    </div>}
    <div className="sc-guide-bottom"><button type="button" className="sc-text-button" onClick={onRedeem}>已有兑换码，返回本站兑换 <Icon name="fa-arrow-right" /></button><span className="sc-fine">离开前台或配置变化会撤销旧问答及链接。</span></div>
  </section>;
}

function SponsorHistory({ api, request, isCurrent, revision, disabled }) {
  const generation = useRef(0);
  const flight = useRef(null);
  const [state, setState] = useState({ items: [], total: 0, loaded: false, busy: false, stale: false, error: '' });
  useEffect(() => {
    generation.current += 1;
    flight.current = null;
    setState(previous => ({ ...previous, busy: false, stale: previous.loaded, error: '' }));
    return () => { generation.current += 1; };
  }, [revision]);
  async function readHistory(restart = false) {
    if (flight.current || disabled || !isCurrent()) return;
    const ticket = {};
    flight.current = ticket;
    const expectedGeneration = generation.current;
    const offset = restart ? 0 : state.items.length;
    setState(previous => ({ ...previous, busy: true, error: '' }));
    try {
      const result = validateHistory(await request(signal => api.history({ offset, limit: PAGE_SIZE, signal })));
      if (!isCurrent() || expectedGeneration !== generation.current) return;
      if (!restart && state.loaded && (result.total !== state.total || result.items.some(item => state.items.some(old => old.id === item.id)))) {
        setState(previous => ({ ...previous, busy: false, stale: true, error: '历史记录已变化，已保留旧列表。请重新读取，避免混合新旧分页。' }));
        return;
      }
      setState(previous => ({ items: restart ? result.items : [...previous.items, ...result.items], total: result.total, loaded: true, busy: false, stale: false, error: '' }));
    } catch (error) {
      if (isCurrent() && expectedGeneration === generation.current && error.name !== 'AbortError') {
        setState(previous => ({ ...previous, busy: false, error: error.status === 401 ? '登录已过期，请重新登录；原记录已保留。' : '历史读取失败，原记录已保留，请手动重试。' }));
      }
    } finally { if (flight.current === ticket) flight.current = null; }
  }
  return <section className="sc-panel" aria-labelledby="sc-history-title">
    <div className="sc-section-heading"><div><p className="sc-kicker">每一份支持都有记录</p><h2 id="sc-history-title">兑换历史</h2></div><button type="button" className="sc-button sc-button--quiet" disabled={state.busy || disabled} onClick={() => { void readHistory(true); }}>{state.busy ? '读取中…' : state.loaded ? '重新读取历史' : '查看兑换历史'}</button></div>
    {state.error && <Notice tone="warning" alert>{state.error}</Notice>}
    {state.stale && <Notice tone="warning">兑换状态已更新，下列为上次读取的记录。请重新读取后继续分页。</Notice>}
    {!state.loaded && <p className="sc-muted">按需读取，每页 {PAGE_SIZE} 条。仅展示当前账号的兑换记录，不是爱发电订单。</p>}
    {state.loaded && !state.items.length && <div className="sc-empty"><Icon name="fa-clock-rotate-left" /><h3>还没有兑换记录</h3><p>在本站成功兑换后，可在这里查看。</p></div>}
    {state.items.length > 0 && <ol className="sc-history">{state.items.map(item => <li key={item.id}><span className="sc-history-dot" aria-hidden="true"><Icon name="fa-ticket" /></span><div><h3>{item.plan_name}</h3><p>兑换 {formatSponsorTime(item.redeemed_at)}（上海）</p><p className="sc-muted">{item.permanent ? '永久有效' : `记录到期时间 ${formatSponsorTime(item.expires_at)}（上海）`}</p></div><span className="sc-chip">{item.permanent ? '永久' : '已兑换'}</span></li>)}</ol>}
    {state.loaded && <div className="sc-history-footer"><p className="sc-fine">已显示 {state.items.length} / {state.total} 条</p>{state.items.length < state.total && <button type="button" className="sc-button" disabled={state.busy || state.stale || disabled} onClick={() => { void readHistory(); }}>{state.busy ? '正在读取…' : `加载更多（${PAGE_SIZE} 条）`}</button>}</div>}
  </section>;
}
