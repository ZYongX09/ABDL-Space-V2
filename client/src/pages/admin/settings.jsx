import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pill, Loading, Empty } from './ui';
import { fmtFull } from './util';

export default function AdminSettings() {
  const toast = useToast();

  // 内测模式
  const [beta, setBeta] = useState(null);
  const [betaForm, setBetaForm] = useState({ enabled: false, allowedRoutes: '', message: '' });
  const [betaSaving, setBetaSaving] = useState(false);

  // site_settings
  const [settings, setSettings] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [saveKey, setSaveKey] = useState(null); // { key, value }
  const [settingSaving, setSettingSaving] = useState(false);

  // 修改密码
  const [pw, setPw] = useState({ old: '', fresh: '' });
  const [pwSaving, setPwSaving] = useState(false);

  // 邮箱屏蔽名单
  const [emails, setEmails] = useState(null);
  const [blockForm, setBlockForm] = useState({ email: '', reason: '' });
  const [blockSaving, setBlockSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, s, e] = await Promise.all([adminAPI.betaMode(), adminAPI.settings(), adminAPI.blockedEmails()]);
      setBeta(b);
      setBetaForm({
        enabled: !!b.enabled,
        allowedRoutes: (b.allowedRoutes || []).join('\n'),
        message: b.message || '',
      });
      setSettings(s.settings || []);
      setEmails(e.emails || []);
    } catch (err) {
      toast.error('设置加载失败: ' + (err.message || ''));
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const saveBeta = async () => {
    const routes = betaForm.allowedRoutes.split('\n').map(r => r.trim()).filter(Boolean);
    setBetaSaving(true);
    try {
      await adminAPI.setBetaMode({ enabled: betaForm.enabled, allowedRoutes: routes, message: betaForm.message.trim() });
      toast.success('内测模式已保存');
      load();
    } catch (e) {
      toast.error(e.message || '保存失败');
    }
    setBetaSaving(false);
  };

  const editSetting = (s) => setSaveKey({ key: s.key, value: s.value });

  const submitSetting = async () => {
    if (!saveKey.key.trim()) { toast.error('key 不能为空'); return; }
    setSettingSaving(true);
    try {
      await adminAPI.saveSetting(saveKey.key.trim(), saveKey.value);
      toast.success('已保存');
      setSaveKey(null);
      load();
    } catch (e) {
      toast.error(e.message || '保存失败');
    }
    setSettingSaving(false);
  };

  const changePassword = async () => {
    if (pw.fresh.length < 8) { toast.error('新密码至少 8 位'); return; }
    setPwSaving(true);
    try {
      await adminAPI.resetPassword(pw.old, pw.fresh);
      toast.success('密码已修改');
      setPw({ old: '', fresh: '' });
    } catch (e) {
      toast.error(e.message || '修改失败');
    }
    setPwSaving(false);
  };

  const addBlockedEmail = async () => {
    const email = blockForm.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast.error('请输入有效的邮箱地址'); return; }
    setBlockSaving(true);
    try {
      await adminAPI.addBlockedEmail(email, blockForm.reason.trim());
      toast.success('已加入屏蔽名单');
      setBlockForm({ email: '', reason: '' });
      load();
    } catch (e) {
      toast.error(e.message || '添加失败');
    }
    setBlockSaving(false);
  };

  const removeBlockedEmail = async (email) => {
    if (!window.confirm(`确定从屏蔽名单移除 ${email} 吗？`)) return;
    try {
      await adminAPI.removeBlockedEmail(email);
      toast.success('已移除');
      load();
    } catch (e) {
      toast.error(e.message || '移除失败');
    }
  };

  return (
    <AdminLayout active="settings">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 内测模式 */}
        <Card title="内测模式（BetaMode）" icon="fa-flask" action={
          <button className="ac-btn primary" disabled={betaSaving} onClick={saveBeta}>{betaSaving ? '保存中...' : '保存配置'}</button>
        }>
          {!beta ? <Loading /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}>
                <input type="checkbox" checked={betaForm.enabled} onChange={e => setBetaForm(f => ({ ...f, enabled: e.target.checked }))} />
                启用内测模式（未登录用户仅可访问白名单路由）
              </label>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>允许访问的路由（每行一个，需以 / 开头）</div>
                <textarea className="ac-textarea" style={{ width: '100%' }} value={betaForm.allowedRoutes} onChange={e => setBetaForm(f => ({ ...f, allowedRoutes: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>提示文案</div>
                <input className="ac-input" style={{ width: '100%' }} value={betaForm.message} onChange={e => setBetaForm(f => ({ ...f, message: e.target.value }))} />
              </div>
            </div>
          )}
        </Card>

        {/* 站点配置 KV */}
        <Card title="站点配置（site_settings）" icon="fa-database" action={
          <button className="ac-btn primary" onClick={() => setSaveKey({ key: '', value: '' })}><i className="fa-solid fa-plus" /> 新增配置项</button>
        }>
          {!settings ? <Loading /> : !settings.length ? <Empty text="暂无配置项" icon="fa-database" /> : (
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr><th>key</th><th>value</th><th>更新时间</th><th style={{ width: 70 }}>操作</th></tr>
                </thead>
                <tbody>
                  {settings.map(s => (
                    <tr key={s.key}>
                      <td><code style={{ color: 'var(--primary-dark)' }}>{s.key}</code></td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{s.value}</td>
                      <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{s.updated_at ? fmtFull(s.updated_at) : '-'}</td>
                      <td><button className="ac-btn" onClick={() => editSetting(s)}><i className="fa-solid fa-pen" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 邮箱屏蔽名单 */}
        <Card title="邮箱屏蔽名单" icon="fa-ban" action={
          <button className="ac-btn primary" disabled={blockSaving} onClick={addBlockedEmail}>{blockSaving ? '添加中...' : '添加屏蔽'}</button>
        }>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>邮箱地址</div>
                <input className="ac-input" type="email" style={{ width: '100%' }} placeholder="user@example.com"
                  value={blockForm.email} onChange={e => setBlockForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>屏蔽原因（可选，≤200 字符）</div>
                <input className="ac-input" style={{ width: '100%' }} value={blockForm.reason}
                  onChange={e => setBlockForm(f => ({ ...f, reason: e.target.value }))} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              被屏蔽的邮箱在注册 / 绑定邮箱 / 找回密码申请验证码时会被后端直接拒绝（网页与 App 同一接口）。
            </div>
          </div>
          {!emails ? <Loading /> : !emails.length ? <Empty text="暂无屏蔽邮箱" icon="fa-ban" /> : (
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr><th>邮箱</th><th>原因</th><th>操作人</th><th>屏蔽时间</th><th style={{ width: 70 }}>操作</th></tr>
                </thead>
                <tbody>
                  {emails.map(r => (
                    <tr key={r.email}>
                      <td><code style={{ color: 'var(--danger, #dc2626)' }}>{r.email}</code></td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5 }}>{r.reason || '-'}</td>
                      <td style={{ fontSize: 12.5 }}>{r.created_by_username || '-'}</td>
                      <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{r.created_at ? fmtFull(r.created_at) : '-'}</td>
                      <td><button className="ac-btn danger" onClick={() => removeBlockedEmail(r.email)}><i className="fa-solid fa-trash" /> 移除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 修改密码 */}
        <Card title="修改管理员密码" icon="fa-key">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>原密码</div>
              <input className="ac-input" type="password" style={{ width: '100%' }} value={pw.old} onChange={e => setPw(p => ({ ...p, old: e.target.value }))} /></div>
            <div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>新密码（至少 8 位）</div>
              <input className="ac-input" type="password" style={{ width: '100%' }} value={pw.fresh} onChange={e => setPw(p => ({ ...p, fresh: e.target.value }))} /></div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="ac-btn primary" disabled={pwSaving} onClick={changePassword}>{pwSaving ? '提交中...' : '修改密码'}</button>
            </div>
          </div>
        </Card>

        {/* 保存配置 KV 弹窗 */}
        {saveKey && (
          <div className="ac-overlay" onClick={() => setSaveKey(null)}>
            <div className="ac-modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
              <div className="ac-modal-head">
                {saveKey.key ? `编辑配置 ${saveKey.key}` : '新增配置项'}
                <button className="ac-modal-close" onClick={() => setSaveKey(null)}><i className="fa-solid fa-xmark" /></button>
              </div>
              <div className="ac-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>key（小写字母/数字/下划线，≤64）</div>
                  <input className="ac-input" style={{ width: '100%' }} disabled={!!saveKey.key} value={saveKey.key} onChange={e => setSaveKey(s => ({ ...s, key: e.target.value }))} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>value（≤8000 字符）</div>
                  <textarea className="ac-textarea" style={{ width: '100%' }} value={saveKey.value} onChange={e => setSaveKey(s => ({ ...s, value: e.target.value }))} />
                </div>
              </div>
              <div className="ac-modal-foot">
                <button className="ac-btn" onClick={() => setSaveKey(null)}>取消</button>
                <button className="ac-btn primary" disabled={settingSaving} onClick={submitSetting}>{settingSaving ? '保存中...' : '保存'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}