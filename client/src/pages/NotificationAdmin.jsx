import { useCallback, useEffect, useState } from 'react';
import { adminPushAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Card, Empty, ErrorBox, FormField, Loading, StatCard } from './admin/ui';

export default function NotificationAdmin() {
  const { user } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [platforms, setPlatforms] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sendForm, setSendForm] = useState({
    platform: 'all',
    targetType: 'all',
    targetIds: '',
    title: '',
    body: '',
    url: '/notifications',
  });
  const [sending, setSending] = useState(false);
  const [jpushMsgId, setJpushMsgId] = useState('');
  const [jpushStats, setJpushStats] = useState(null);
  const [querying, setQuerying] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [statsResult, logsResult, platformsResult] = await Promise.all([
        adminPushAPI.stats(),
        adminPushAPI.logs(),
        adminPushAPI.platforms(),
      ]);
      setStats(statsResult);
      setLogs(logsResult.logs || []);
      setPlatforms(platformsResult);
    } catch (error) {
      console.error('[PushAdmin] load failed:', error);
      setLoadError(`推送管理数据加载失败：${error.message || '请稍后重试'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') void loadData();
  }, [user?.role, loadData]);

  const handleSend = async () => {
    if (!sendForm.title.trim() || !sendForm.body.trim()) {
      toast.error('请填写标题和内容');
      return;
    }
    setSending(true);
    try {
      const targetIds = sendForm.targetIds
        ? sendForm.targetIds.split(',').map(value => value.trim()).filter(Boolean).map(Number)
        : undefined;
      const result = await adminPushAPI.send({
        targetType: sendForm.targetType,
        targetIds,
        title: sendForm.title.trim(),
        body: sendForm.body.trim(),
        url: sendForm.url.trim() || '/notifications',
        platform: sendForm.platform,
      });
      toast.success(`推送已发送（Web ${result.webSent || 0}，JPush ${result.jpushSent || 0}）`);
      setSendForm(previous => ({ ...previous, title: '', body: '' }));
      await loadData();
    } catch (error) {
      toast.error(`发送失败：${error.message || '未知错误'}`);
    } finally {
      setSending(false);
    }
  };

  const handleTestSend = async () => {
    if (!sendForm.targetIds.trim()) {
      toast.error('请填写用户 ID');
      return;
    }
    setSending(true);
    try {
      const userId = Number(sendForm.targetIds.split(',')[0].trim());
      await adminPushAPI.test(userId);
      toast.success('测试推送已发送');
    } catch (error) {
      toast.error(`测试失败：${error.message || '未知错误'}`);
    } finally {
      setSending(false);
    }
  };

  const handleQueryJPushStats = async () => {
    if (!jpushMsgId.trim()) return;
    setQuerying(true);
    try {
      const data = await adminPushAPI.jpushStats(jpushMsgId.split(',').map(value => value.trim()).filter(Boolean));
      setJpushStats(data);
    } catch (error) {
      toast.error(`查询失败：${error.message || '未知错误'}`);
    } finally {
      setQuerying(false);
    }
  };

  if (user?.role !== 'admin') return <Empty text="无权限" icon="fa-lock" />;

  const statItems = [
    { label: 'Web Push', value: stats?.web_count ?? '-', icon: 'fa-globe', tone: 'blue' },
    { label: 'JPush', value: stats?.jpush_count ?? '-', icon: 'fa-mobile-screen', tone: 'violet' },
    { label: '今日发送', value: stats?.today_sent ?? '-', icon: 'fa-paper-plane', tone: 'green' },
    { label: '今日失败', value: stats?.today_failed ?? '-', icon: 'fa-triangle-exclamation', tone: 'red' },
  ];

  return (
    <div className="ac-page-stack">
      <div className="ac-toolbar">
        <div className="ac-section-note">平台配置、发送能力和投递结果会在这里集中展示。</div>
        <button type="button" className="ac-btn" onClick={loadData} disabled={loading}>
          <i className={`fa-solid fa-rotate${loading ? ' fa-spin' : ''}`} aria-hidden="true" />
          刷新数据
        </button>
      </div>

      <ErrorBox msg={loadError} />
      {loading && !stats && !platforms && !logs.length && <Loading text="正在加载推送管理数据…" />}

      <div className="ac-stat-grid">
        {statItems.map(item => <StatCard compact key={item.label} {...item} />)}
      </div>

      {platforms && (
        <Card title="平台状态" description="发送前请确认目标推送通道已正确配置。" icon="fa-server">
          <div className="ac-form-grid">
            {[
              { name: 'Web Push（VAPID）', ok: platforms.vapidConfigured, detail: platforms.vapidConfigured ? '已配置' : '未配置' },
              { name: '极光推送', ok: platforms.jpushEnabled, detail: platforms.jpushEnabled ? `AppKey：${platforms.jpushAppKey || '***'}` : '未启用' },
            ].map(platform => (
              <div className="ac-platform-row" key={platform.name}>
                <i className={`fa-solid ${platform.ok ? 'fa-circle-check ac-text-success' : 'fa-circle-xmark ac-text-muted'}`} aria-hidden="true" />
                <span className="ac-grow ac-row-label">{platform.name}</span>
                <span className={`ac-pill ${platform.ok ? 'green' : 'slate'}`}>{platform.detail}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="ac-grid-2">
        <Card title="发送通知" description="群发属于高影响操作，发送前请核对平台、范围和内容。" icon="fa-paper-plane">
          <div className="ac-form-grid">
            <div className="ac-form-grid ac-form-grid-2">
              <FormField label="推送平台" htmlFor="push-platform">
                <select id="push-platform" className="ac-select" value={sendForm.platform} onChange={event => setSendForm(previous => ({ ...previous, platform: event.target.value }))}>
                  <option value="all">全部平台</option>
                  <option value="web">Web Push</option>
                  <option value="jpush">极光推送</option>
                </select>
              </FormField>
              <FormField label="接收范围" htmlFor="push-target-type">
                <select id="push-target-type" className="ac-select" value={sendForm.targetType} onChange={event => setSendForm(previous => ({ ...previous, targetType: event.target.value }))}>
                  <option value="all">全部用户</option>
                  <option value="user">指定用户</option>
                </select>
              </FormField>
            </div>
            {sendForm.targetType === 'user' && (
              <FormField label="用户 ID" hint="多个用户 ID 用英文逗号分隔。" htmlFor="push-target-ids">
                <input id="push-target-ids" className="ac-input" inputMode="text" autoComplete="off" value={sendForm.targetIds} onChange={event => setSendForm(previous => ({ ...previous, targetIds: event.target.value }))} />
              </FormField>
            )}
            <FormField label="通知标题" required htmlFor="push-title">
              <input id="push-title" className="ac-input" value={sendForm.title} onChange={event => setSendForm(previous => ({ ...previous, title: event.target.value }))} />
            </FormField>
            <FormField label="通知内容" required htmlFor="push-body">
              <textarea id="push-body" className="ac-textarea" value={sendForm.body} onChange={event => setSendForm(previous => ({ ...previous, body: event.target.value }))} />
            </FormField>
            <FormField label="跳转路径" hint="使用站内路径，例如 /notifications。" htmlFor="push-url">
              <input id="push-url" className="ac-input" value={sendForm.url} onChange={event => setSendForm(previous => ({ ...previous, url: event.target.value }))} />
            </FormField>
            <div className="ac-action-group">
              <button type="button" className="ac-btn primary" onClick={handleSend} disabled={sending}>
                {sending && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
                {sending ? '发送中' : '发送通知'}
              </button>
              {sendForm.targetType === 'user' && sendForm.targetIds.trim() && (
                <button type="button" className="ac-btn" onClick={handleTestSend} disabled={sending}>
                  <i className="fa-solid fa-vial" aria-hidden="true" />发送测试
                </button>
              )}
            </div>
          </div>
        </Card>

        <Card title="极光送达统计" description="按极光消息 ID 查询各通道送达数据。" icon="fa-chart-column">
          <div className="ac-form-grid">
            <FormField label="消息 ID" hint="多个 msg_id 用英文逗号分隔。" htmlFor="jpush-message-id">
              <input id="jpush-message-id" className="ac-input" value={jpushMsgId} onChange={event => setJpushMsgId(event.target.value)} />
            </FormField>
            <div className="ac-action-group">
              <button type="button" className="ac-btn" onClick={handleQueryJPushStats} disabled={querying || !jpushMsgId.trim()}>
                {querying && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
                {querying ? '查询中' : '查询统计'}
              </button>
            </div>
            {Array.isArray(jpushStats) && jpushStats.length > 0 && (
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead><tr><th scope="col">msg_id</th><th scope="col">极光通道</th><th scope="col">厂商通道</th><th scope="col">iOS APNs</th><th scope="col">iOS 消息</th></tr></thead>
                  <tbody>
                    {jpushStats.map((item, index) => (
                      <tr key={item.msg_id ?? index}><td>{item.msg_id}</td><td>{item.jpush_received ?? '-'}</td><td>{item.android_pns_received ?? '-'}</td><td>{item.ios_apns_received ?? '-'}</td><td>{item.ios_msg_received ?? '-'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {Array.isArray(jpushStats) && !jpushStats.length && <Empty text="未查询到送达数据" icon="fa-chart-column" />}
          </div>
        </Card>
      </div>

      <Card title="最近推送记录" description="用于核对近期 Web Push 与 JPush 的发送数量。" icon="fa-clock-rotate-left" pad={false}>
        {!logs.length ? <Empty text="暂无推送记录" icon="fa-clock-rotate-left" /> : (
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead><tr><th scope="col">发送时间</th><th scope="col">标题</th><th scope="col">Web Push</th><th scope="col">JPush</th></tr></thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="ac-cell-muted">{new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td title={log.title}>{log.title}</td>
                    <td><span className="ac-pill blue">{log.sent_count || 0}</span></td>
                    <td><span className="ac-pill violet">{log.jpush_sent || 0}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
