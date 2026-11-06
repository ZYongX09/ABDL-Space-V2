import { useEffect, useId, useRef, useState } from 'react';
import { formatTime } from './adminModel.js';
import { ALIPAY_MERCHANT_LABELS, ALIPAY_MERCHANT_STATUSES, ALIPAY_MONTHLY_LABELS, ALIPAY_MONTHLY_MODES, adoptAlipayPolicyLatest, alipayMoney, alipayPolicyAvailability, alipayPolicyDraft, alipayPolicyError, alipayPolicyReason, alipayPolicySampleFresh, alipayPolicyUpdate, alipayRemaining, receiveAlipayPolicyRead, verifyAlipayPolicySave } from './alipayPolicyModel.js';
import './alipayPolicy.css';

const emptyEditor = owner => ({ owner, snapshot: null, latest: null, draft: null, reason: '', blocked: false, loading: true, error: '', notice: '' });
function applyRead(editor, data) {
  try { return { ...receiveAlipayPolicyRead(editor, data), loading: false }; }
  catch (error) { return { ...editor, loading: false, blocked: !!editor.snapshot, error: alipayPolicyError(error) }; }
}

export default function AlipayPolicyPanel({ api, actions, controls }) {
  const { busy, run, confirm } = actions;
  const { Input, Select, Check, Reason, Button, Summary } = controls;
  const titleId = useId();
  const [editor, setEditor] = useState(() => emptyEditor(api));
  const [clock, setClock] = useState(() => Date.now());
  const active = useRef(null);
  const localLock = useRef(false);
  useEffect(() => {
    const scope = { api, alive: true };
    active.current = scope;
    setEditor(emptyEditor(api));
    api.alipayPolicy().then(data => {
      if (scope.alive) setEditor(current => applyRead(current, data));
    }, error => { if (scope.alive) setEditor(current => ({ ...current, loading: false, error: alipayPolicyError(error) })); });
    return () => { scope.alive = false; };
  }, [api]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const current = editor.owner === api ? editor : emptyEditor(api);
  const snapshot = current.snapshot;
  const displayed = current.latest || snapshot;
  const pending = busy || current.loading;
  const stillHere = scope => scope?.alive && active.current === scope;
  const patch = (key, value) => setEditor(valueBefore => ({ ...valueBefore, draft: { ...valueBefore.draft, [key]: value } }));

  async function readLatest() {
    if (localLock.current || pending) return;
    localLock.current = true;
    const scope = active.current;
    setEditor(value => ({ ...value, loading: true, error: '' }));
    try {
      const data = await api.alipayPolicy();
      if (stillHere(scope)) setEditor(value => applyRead(value, data));
    } catch (error) {
      if (stillHere(scope)) setEditor(value => ({ ...value, loading: false, blocked: !!value.snapshot, error: alipayPolicyError(error) }));
    } finally { localLock.current = false; }
  }
  function save(event) {
    event.preventDefault();
    if (localLock.current || pending || !snapshot || current.blocked) return;
    const scope = active.current;
    // run 继续承担整个管理页的 busy / 防重复提交 / 错误反馈；这里不添加 operation_id。
    void run(async () => {
      localLock.current = true;
      try {
        const body = alipayPolicyUpdate(current.draft, snapshot.version, current.reason);
        if (!snapshot.settings.purchase_enabled && body.settings.purchase_enabled
          && !await confirm('确认登记开启支付宝新购开关？这不等于当前可购，也不会绕过部署许可、审核、额度核实及事务内预算门禁；最终以服务器返回为准。')) return false;
        if (!stillHere(scope)) return false;
        setEditor(value => ({ ...value, error: '', notice: '' }));
        let receipt;
        try {
          receipt = await api.saveAlipayPolicy(body);
          const latest = await api.alipayPolicy();
          const result = verifyAlipayPolicySave(snapshot, body.settings, receipt, latest);
          if (!stillHere(scope)) return false;
          if (result === 'concurrent') {
            setEditor(value => ({ ...value, latest, blocked: true, error: '', notice: `本次 PUT 由服务器 v${receipt.version} 确认，但随后已变更为 v${latest.version}。草稿与理由保留；请比较最新设置，不会把本次草稿冒充当前生效值。` }));
            return false;
          }
          setEditor(value => ({ ...value, snapshot: latest, latest: null, draft: alipayPolicyDraft(latest.settings), reason: '', blocked: false, error: '', notice: `已保存并重读确认服务器 v${latest.version}。下方为该次采样，不是持续实时状态。` }));
        } catch (error) {
          if (stillHere(scope)) setEditor(value => ({ ...value, blocked: true, error: alipayPolicyError(error, true), notice: '' }));
          throw error;
        }
      } finally { localLock.current = false; }
    }, '支付宝门禁已保存并由服务器重读确认；可购状态仍以样本时间和最终下单门禁为准');
  }
  const freshSample = displayed && alipayPolicySampleFresh(displayed.usage.as_of, clock);
  const available = displayed && alipayPolicyAvailability(displayed);

  return <section className="sa-panel sa-alipay" aria-labelledby={titleId} data-testid="alipay-policy-panel" aria-busy={pending}>
    <header className="sa-alipay-heading"><div><h2 id={titleId}>支付宝新购门禁</h2><p className="sa-muted">独立保存，不改套餐、爱发电或其他权益设置。新购开关默认关闭。</p></div><Button onClick={readLatest} disabled={pending}>读取最新门禁（保留草稿）</Button></header>
    <p className="sa-message">单笔平台硬上限 ¥50.00 / 5000 分、上海日硬上限 ¥1000.00 / 100000 分。管理设置只能更保守，不能关闭额度检查或提高硬上限。审核通过也不会自动开启购买或放宽额度。</p>
    <p className="sa-muted">审核状态、额度核实和月模式均为人工登记，不是支付宝官方自动审核结果或实时证明。开关开启也不能绕过部署级许可、私有支付配置及服务器事务门禁；月额度未知或额度未核实仍不可购。这里不接收任何支付密钥或原始配置。</p>
    {current.loading && <p role="status" className="sa-message">正在读取支付宝门禁服务器数据…</p>}
    {current.error && <p role="alert" className="sa-message sa-error">{current.error}</p>}
    {current.notice && <p role="status" className="sa-message">{current.notice}</p>}
    {displayed && <>
      <div className="sa-alipay-state" data-available={available && freshSample && !current.error && !current.loading ? 'true' : 'false'}>
        <h3>{current.error || current.loading ? '当前可购状态未获新确认' : !freshSample ? '旧样本 / 时间异常：当前可购状态待重读' : available ? '本次服务器样本允许新购（非持续实时保证）' : '本次服务器样本暂不可新购'}</h3>
        <p>{available ? '该次采样显示可用；并发订单、后续配置或周期变化仍可能阻断，创建订单时服务器再次权威校验。' : alipayPolicyReason(displayed.effective.reason)}</p>
        <Summary entries={[
          ['服务器设置版本', `v${displayed.version}`], ['服务器新购开关', displayed.settings.purchase_enabled ? '已开启（不等于可购）' : '关闭'],
          ['商家状态（人工）', ALIPAY_MERCHANT_LABELS[displayed.settings.merchant_status]], ['适用额度人工核实', displayed.settings.limits_verified ? '已登记核实' : '尚未核实'],
          ['部署级策略（仅状态）', displayed.effective.master_configured ? '已配置' : '未配置'], ['支付配置（仅状态）', displayed.effective.payment_configured ? '已配置' : '未配置'],
          ['环境', displayed.effective.environment === 'production' ? '生产' : displayed.effective.environment === 'sandbox' ? '沙箱' : '未知 / 未配置'],
          ['有效单笔上限', displayed.effective.per_transaction_minor === null ? '未知 / 未生效' : alipayMoney(displayed.effective.per_transaction_minor)],
          ['有效上海日上限', displayed.effective.daily_minor === null ? '未知 / 未生效' : alipayMoney(displayed.effective.daily_minor)],
          ['有效月上限', displayed.effective.monthly_unlimited_verified ? '已人工核实无月上限' : displayed.effective.monthly_minor === null ? '未知 / 未生效（不是无限额）' : alipayMoney(displayed.effective.monthly_minor)],
          ['设置更新时间（上海）', formatTime(displayed.updated_at)], ['最后修改者', displayed.updated_by ?? '未记录'],
        ]} />
      </div>
      <section className="sa-alipay-usage" aria-label="本系统账本占用">
        <h3>本系统账本占用</h3>
        <p className="sa-message">仅统计本系统账本，不是支付宝商户全部应用、站外收款或全部商户资金；剩余额度不是支付宝账户余额。缺少商家上下文时显示「不可获取」，绝不按 0 计算。未知支付结果仍占用预算，改策略不会清空预算。</p>
        <p className="sa-muted">采样时间 as_of（上海）：{formatTime(displayed.usage.as_of)} · Asia/Shanghai。{freshSample ? '这是读取时的样本，页面不自动刷新账本。' : '样本已过期或与设备时钟不符，不能宣称实时可购；请重新读取。'}</p>
        <div className="sa-alipay-cycles">{[['day', '上海日', false], ['month', '上海月', true]].map(([key, label, monthly]) => <article className="sa-subpanel" key={key}><h3>{label} · {displayed.usage[key].cycle_key}</h3><Summary entries={[
          ['已付', alipayMoney(displayed.usage[key].paid_minor)], ['待付 / 未决', alipayMoney(displayed.usage[key].pending_minor)], ['合计占用', alipayMoney(displayed.usage[key].occupied_minor)], ['剩余额度', alipayRemaining(displayed, monthly)], ['服务器返回重置时间（上海）', formatTime(displayed.usage[key].reset_at)],
        ]} /></article>)}</div>
        <p className="sa-muted">每日额度耗尽不会改写新购开关；按服务器返回的上海新日自然换桶。关门不阻止旧单查询、通知、关闭核查和合法履约，也不会虚称已撤销外部已签单。</p>
      </section>
    </>}
    {snapshot && current.draft && <form noValidate onSubmit={save} data-testid="alipay-policy-form"><fieldset disabled={pending}>
      <h3>编辑管理设置 · 草稿基于 v{snapshot.version}</h3><p className="sa-muted">以下均为待提交草稿，不能据此宣称已生效。人民币金额精确转分，最多两位小数。</p>
      <Check label="允许支付宝新购（独立开关，不绕过其他门禁）" checked={current.draft.purchase_enabled} onChange={value => patch('purchase_enabled', value)} />
      <div className="sa-grid">
        <Select label="商家审核 / 受限许可状态（人工确认）" hint="restricted_allowed 仅表示人工确认平台允许受限收款，不等于审核完全通过。" value={current.draft.merchant_status} onChange={value => patch('merchant_status', value)}>{ALIPAY_MERCHANT_STATUSES.map(value => <option key={value} value={value}>{ALIPAY_MERCHANT_LABELS[value]}</option>)}</Select>
        <Select label="月额度模式（人工核实）" hint="未知必须禁止新购；无月上限必须有人工核实依据，并满足部署级同语义许可。" value={current.draft.monthly_mode} onChange={value => patch('monthly_mode', value)}>{ALIPAY_MONTHLY_MODES.map(value => <option key={value} value={value}>{ALIPAY_MONTHLY_LABELS[value]}</option>)}</Select>
        <Input label="单笔管理上限（元 / CNY）" inputMode="decimal" value={current.draft.per_transaction} onChange={value => patch('per_transaction', value)} required hint="范围 ¥0.01–¥50.00；不能提高平台硬上限。" />
        <Input label="上海日管理上限（元 / CNY）" inputMode="decimal" value={current.draft.daily} onChange={value => patch('daily', value)} required hint="范围 ¥0.01–¥1000.00；按服务器上海日桶统计。" />
        {current.draft.monthly_mode === 'limited' && <Input label="月管理上限（元 / CNY）" inputMode="decimal" value={current.draft.monthly} onChange={value => patch('monthly', value)} required hint="范围 ¥0.01–¥1000000.00；不是从日额度推算。" />}
      </div>
      <Check label="已人工核实适用额度（不是关闭额度检查）" checked={current.draft.limits_verified} onChange={value => patch('limits_verified', value)} />
      <div className="sa-savebar"><Reason value={current.reason} onChange={reason => setEditor(value => ({ ...value, reason }))} />
        {current.blocked && <p role="alert" className="sa-message sa-error">保存已暂停：请先读取最新设置并核查。不会用新版本号自动重发，也不会覆盖其他管理员。</p>}
        {current.latest && <div className="sa-alipay-compare"><h3>服务器最新 v{current.latest.version} · 与草稿比较</h3><Summary entries={[
          ['最新新购开关', current.latest.settings.purchase_enabled ? '开启' : '关闭'], ['最新商家状态', ALIPAY_MERCHANT_LABELS[current.latest.settings.merchant_status]], ['最新额度核实', current.latest.settings.limits_verified ? '已核实' : '未核实'],
          ['最新单笔上限', alipayMoney(current.latest.settings.per_transaction_minor)], ['最新上海日上限', alipayMoney(current.latest.settings.daily_minor)], ['最新月模式', ALIPAY_MONTHLY_LABELS[current.latest.settings.monthly_mode]], ['最新月管理上限', current.latest.settings.monthly_minor === null ? '不适用（不代表有效无限额）' : alipayMoney(current.latest.settings.monthly_minor)],
        ]} /><Button onClick={async () => {
          if (await confirm(`确认以服务器 v${current.latest.version} 为新的 CAS 基准？原草稿与理由保留，不自动合并或保存；请逐项复核差异后再提交。`)) setEditor(value => adoptAlipayPolicyLatest(value));
        }}>已比较：采用最新基准，保留草稿</Button></div>}
        <div className="sa-actions"><Button type="submit" disabled={pending || current.blocked}>保存支付宝门禁</Button><Button onClick={async () => {
          if (await confirm('确认放弃支付宝门禁草稿及理由，采用页面已读到的最新服务器设置？此操作不写入服务器；需要更新状态请先读取最新门禁。')) setEditor(value => ({ ...value, snapshot: value.latest || value.snapshot, latest: null, draft: alipayPolicyDraft((value.latest || value.snapshot).settings), reason: '', notice: '已放弃草稿，采用已读取的服务器样本；未执行任何保存。' }));
        }}>放弃草稿，采用已读设置</Button></div>
      </div>
    </fieldset></form>}
  </section>;
}
