import { useState, useEffect } from 'react';
import { adminPushAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function NotificationAdmin() {
  const { user } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [platforms, setPlatforms] = useState(null);
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

  const loadData = async () => {
    try {
      const [s, l, p] = await Promise.all([
        adminPushAPI.stats(),
        adminPushAPI.logs(),
        adminPushAPI.platforms(),
      ]);
      setStats(s);
      setLogs(l.logs || []);
      setPlatforms(p);
    } catch (e) {
      console.error('[PushAdmin] load failed:', e);
    }
  };

  useEffect(() => {
    if (user?.role !== 'admin') return;
    loadData();
  }, [user, loadData]);

  const handleSend = async () => {
    if (!sendForm.title || !sendForm.body) {
      toast.error('请填写标题和内容');
      return;
    }
    setSending(true);
    try {
      const targetIds = sendForm.targetIds
        ? sendForm.targetIds.split(',').map(s => s.trim()).filter(Boolean).map(Number)
        : undefined;
      const result = await adminPushAPI.send({
        targetType: sendForm.targetType,
        targetIds,
        title: sendForm.title,
        body: sendForm.body,
        url: sendForm.url,
        platform: sendForm.platform,
      });
      toast.success(`推送已发送 (Web: ${result.webSent || 0}, JPush: ${result.jpushSent || 0})`);
      setSendForm(prev => ({ ...prev, title: '', body: '' }));
      loadData();
    } catch (e) {
      toast.error('发送失败: ' + (e.message || '未知错误'));
    }
    setSending(false);
  };

  const handleTestSend = async () => {
    if (!sendForm.targetIds) {
      toast.error('请填写用户 ID');
      return;
    }
    setSending(true);
    try {
      const userId = Number(sendForm.targetIds.split(',')[0].trim());
      await adminPushAPI.test(userId);
      toast.success('测试推送已发送');
    } catch (e) {
      toast.error('测试失败: ' + (e.message || '未知错误'));
    }
    setSending(false);
  };

  const handleQueryJPushStats = async () => {
    if (!jpushMsgId) return;
    try {
      const data = await adminPushAPI.jpushStats(jpushMsgId.split(',').map(s => s.trim()));
      setJpushStats(data);
    } catch (e) {
      toast.error('查询失败: ' + (e.message || '未知错误'));
    }
  };

  if (user?.role !== 'admin') {
    return <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>无权限</div>;
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 20 }}>
      <div style={{ padding: '16px 16px 0' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          <i className="fa-solid fa-bell" style={{ color: 'var(--primary)', marginRight: 8 }} />
          推送通知管理
        </h2>
      </div>

      {/* 统计面板 */}
      <div style={{ padding: '12px 16px' }}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Web Push', value: stats?.web_count ?? '-', color: 'var(--primary)' },
            { label: 'JPush', value: stats?.jpush_count ?? '-', color: 'var(--accent)' },
            { label: '今日发送', value: stats?.today_sent ?? '-', color: 'var(--success)' },
            { label: '失败', value: stats?.today_failed ?? '-', color: 'var(--danger)' },
          ].map(s => (
            <div key={s.label} className="card text-center" style={{ padding: '12px 8px' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 平台状态 */}
      {platforms && (
        <div style={{ padding: '0 16px 12px' }}>
          <div className="card" style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>平台状态</div>
            {[
              { name: 'Web Push (VAPID)', ok: platforms.vapidConfigured, detail: platforms.vapidConfigured ? '已配置' : '未配置' },
              { name: '极光推送', ok: platforms.jpushEnabled, detail: platforms.jpushEnabled ? `AppKey: ${platforms.jpushAppKey || '***'}` : '未启用' },
            ].map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <i className={`fa-solid ${p.ok ? 'fa-circle-check' : 'fa-circle-xmark'}`}
                  style={{ color: p.ok ? 'var(--success)' : 'var(--text-light)', fontSize: 14 }} />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{p.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>{p.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 发送通知 */}
      <div style={{ padding: '0 16px 12px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>发送通知</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                className="form-control"
                style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                value={sendForm.platform}
                onChange={e => setSendForm(p => ({ ...p, platform: e.target.value }))}
              >
                <option value="all">全部平台</option>
                <option value="web">Web Push</option>
                <option value="jpush">极光推送</option>
              </select>
              <select
                className="form-control"
                style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
                value={sendForm.targetType}
                onChange={e => setSendForm(p => ({ ...p, targetType: e.target.value }))}
              >
                <option value="all">全部用户</option>
                <option value="user">指定用户</option>
              </select>
            </div>
            {sendForm.targetType === 'user' && (
              <input
                className="form-control"
                style={{ padding: '8px 12px', fontSize: 13 }}
                placeholder="用户 ID，多个用逗号分隔"
                value={sendForm.targetIds}
                onChange={e => setSendForm(p => ({ ...p, targetIds: e.target.value }))}
              />
            )}
            <input
              className="form-control"
              style={{ padding: '8px 12px', fontSize: 13 }}
              placeholder="标题"
              value={sendForm.title}
              onChange={e => setSendForm(p => ({ ...p, title: e.target.value }))}
            />
            <textarea
              className="form-control"
              style={{ padding: '8px 12px', fontSize: 13, minHeight: 60 }}
              placeholder="内容"
              value={sendForm.body}
              onChange={e => setSendForm(p => ({ ...p, body: e.target.value }))}
            />
            <input
              className="form-control"
              style={{ padding: '8px 12px', fontSize: 13 }}
              placeholder="跳转路径 (默认 /notifications)"
              value={sendForm.url}
              onChange={e => setSendForm(p => ({ ...p, url: e.target.value }))}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? '发送中...' : '群发通知'}
              </button>
              {sendForm.targetType === 'user' && sendForm.targetIds && (
                <button
                  className="btn btn-outline btn-sm"
                  style={{ flex: 1 }}
                  onClick={handleTestSend}
                  disabled={sending}
                >
                  发送测试
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* JPush 送达统计 */}
      <div style={{ padding: '0 16px 12px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>极光送达统计</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              className="form-control"
              style={{ flex: 1, padding: '8px 12px', fontSize: 13 }}
              placeholder="输入 msg_id，多个用逗号分隔"
              value={jpushMsgId}
              onChange={e => setJpushMsgId(e.target.value)}
            />
            <button className="btn btn-outline btn-sm" onClick={handleQueryJPushStats}>查询</button>
          </div>
          {jpushStats && Array.isArray(jpushStats) && jpushStats.map((s, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>msg_id: {s.msg_id}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <span>极光通道送达: {s.jpush_received ?? '-'}</span>
                <span>厂商通道送达: {s.android_pns_received ?? '-'}</span>
                <span>iOS APNs 送达: {s.ios_apns_received ?? '-'}</span>
                <span>iOS 消息送达: {s.ios_msg_received ?? '-'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 推送记录 */}
      <div style={{ padding: '0 16px 12px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>最近推送记录</div>
          {logs.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>暂无记录</div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {logs.map(log => (
                <div key={log.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                  fontSize: 12, color: 'var(--text-muted)',
                }}>
                  <span style={{ flexShrink: 0 }}>
                    {new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.title}
                  </span>
                  <span style={{ flexShrink: 0 }}>
                    <span style={{ color: 'var(--primary)' }}>Web:{log.sent_count || 0}</span>
                    {' '}
                    <span style={{ color: 'var(--accent)' }}>JP:{log.jpush_sent || 0}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
