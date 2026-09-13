import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Empty, FormField, Loading, Modal, Pill, useConfirm } from './ui';
import { fmtFull } from './util';

export default function AdminSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const [beta, setBeta] = useState(null);
  const [betaForm, setBetaForm] = useState({ enabled: false, allowedRoutes: '', message: '' });
  const [betaSaving, setBetaSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [saveKey, setSaveKey] = useState(null);
  const [settingSaving, setSettingSaving] = useState(false);
  const [password, setPassword] = useState({ old: '', fresh: '' });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [emails, setEmails] = useState(null);
  const [blockForm, setBlockForm] = useState({ email: '', reason: '' });
  const [blockSaving, setBlockSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [betaResult, settingsResult, emailsResult] = await Promise.all([
        adminAPI.betaMode(),
        adminAPI.settings(),
        adminAPI.blockedEmails(),
      ]);
      setBeta(betaResult);
      setBetaForm({
        enabled: !!betaResult.enabled,
        allowedRoutes: (betaResult.allowedRoutes || []).join('\n'),
        message: betaResult.message || '',
      });
      setSettings(settingsResult.settings || []);
      setEmails(emailsResult.emails || []);
    } catch (error) {
      toast.error(`设置加载失败：${error.message || '未知错误'}`);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const saveBeta = async () => {
    const routes = betaForm.allowedRoutes.split('\n').map(route => route.trim()).filter(Boolean);
    setBetaSaving(true);
    try {
      await adminAPI.setBetaMode({ enabled: betaForm.enabled, allowedRoutes: routes, message: betaForm.message.trim() });
      toast.success('内测模式已保存');
      await load();
    } catch (error) {
      toast.error(error.message || '保存失败');
    } finally {
      setBetaSaving(false);
    }
  };

  const submitSetting = async () => {
    if (!saveKey?.key.trim()) {
      toast.error('key 不能为空');
      return;
    }
    setSettingSaving(true);
    try {
      await adminAPI.saveSetting(saveKey.key.trim(), saveKey.value);
      toast.success('配置已保存');
      setSaveKey(null);
      await load();
    } catch (error) {
      toast.error(error.message || '保存失败');
    } finally {
      setSettingSaving(false);
    }
  };

  const changePassword = async () => {
    if (password.fresh.length < 8) {
      toast.error('新密码至少 8 位');
      return;
    }
    setPasswordSaving(true);
    try {
      await adminAPI.resetPassword(password.old, password.fresh);
      toast.success('密码已修改');
      setPassword({ old: '', fresh: '' });
    } catch (error) {
      toast.error(error.message || '修改失败');
    } finally {
      setPasswordSaving(false);
    }
  };

  const addBlockedEmail = async () => {
    const email = blockForm.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('请输入有效的邮箱地址');
      return;
    }
    setBlockSaving(true);
    try {
      await adminAPI.addBlockedEmail(email, blockForm.reason.trim());
      toast.success('已加入屏蔽名单');
      setBlockForm({ email: '', reason: '' });
      await load();
    } catch (error) {
      toast.error(error.message || '添加失败');
    } finally {
      setBlockSaving(false);
    }
  };

  const removeBlockedEmail = async email => {
    const accepted = await confirm({
      title: '移除屏蔽邮箱',
      message: `确定从屏蔽名单移除 ${email} 吗？移除后该邮箱可以重新申请验证码。`,
      okText: '确认移除',
      danger: true,
    });
    if (!accepted) return;
    try {
      await adminAPI.removeBlockedEmail(email);
      toast.success('已移除');
      await load();
    } catch (error) {
      toast.error(error.message || '移除失败');
    }
  };

  return (
    <AdminLayout active="settings">
      <div className="ac-page-stack">
        <Card
          title="运行模式"
          description="控制未登录访问范围。变更后会直接影响前台可访问页面。"
          icon="fa-flask"
          action={(
            <button type="button" className="ac-btn primary" disabled={betaSaving} onClick={saveBeta}>
              {betaSaving && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
              {betaSaving ? '保存中' : '保存运行配置'}
            </button>
          )}
        >
          {!beta ? <Loading /> : (
            <div className="ac-form-grid">
              <label className="ac-check-row">
                <input type="checkbox" checked={betaForm.enabled} onChange={event => setBetaForm(form => ({ ...form, enabled: event.target.checked }))} />
                <span>启用内测模式，未登录用户仅可访问白名单路由</span>
              </label>
              <FormField label="允许访问的路由" hint="每行一个路由，必须以 / 开头。" htmlFor="beta-routes">
                <textarea id="beta-routes" className="ac-textarea" value={betaForm.allowedRoutes} onChange={event => setBetaForm(form => ({ ...form, allowedRoutes: event.target.value }))} />
              </FormField>
              <FormField label="前台提示文案" htmlFor="beta-message">
                <input id="beta-message" className="ac-input" value={betaForm.message} onChange={event => setBetaForm(form => ({ ...form, message: event.target.value }))} />
              </FormField>
            </div>
          )}
        </Card>

        <Card
          title="站点配置"
          description="维护 site_settings 中的运行参数。修改前请确认配置用途。"
          icon="fa-database"
          action={<button type="button" className="ac-btn primary" onClick={() => setSaveKey({ key: '', value: '' })}><i className="fa-solid fa-plus" aria-hidden="true" />新增配置项</button>}
          pad={false}
        >
          {!settings ? <Loading /> : !settings.length ? <Empty text="暂无配置项" icon="fa-database" /> : (
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead><tr><th scope="col">配置键</th><th scope="col">配置值</th><th scope="col">更新时间</th><th scope="col">操作</th></tr></thead>
                <tbody>
                  {settings.map(setting => (
                    <tr key={setting.key}>
                      <td><code>{setting.key}</code></td>
                      <td><div className="ac-cell-truncate" title={setting.value}>{setting.value}</div></td>
                      <td className="ac-cell-muted">{setting.updated_at ? fmtFull(setting.updated_at) : '-'}</td>
                      <td>
                        <button type="button" className="ac-icon-button" aria-label={`编辑配置 ${setting.key}`} title="编辑配置" onClick={() => setSaveKey({ key: setting.key, value: setting.value })}>
                          <i className="fa-solid fa-pen" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card
          title="邮箱治理"
          description="名单中的邮箱无法在网页或 App 申请注册、绑定和找回密码验证码。"
          icon="fa-ban"
          action={(
            <button type="button" className="ac-btn primary" disabled={blockSaving} onClick={addBlockedEmail}>
              {blockSaving && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
              {blockSaving ? '添加中' : '添加屏蔽'}
            </button>
          )}
          pad={false}
        >
          <div className="ac-card-body">
            <div className="ac-form-grid ac-form-grid-2">
              <FormField label="邮箱地址" required htmlFor="blocked-email">
                <input id="blocked-email" className="ac-input" type="email" placeholder="user@example.com" value={blockForm.email} onChange={event => setBlockForm(form => ({ ...form, email: event.target.value }))} />
              </FormField>
              <FormField label="屏蔽原因" hint="可选，最多 200 个字符。" htmlFor="blocked-reason">
                <input id="blocked-reason" className="ac-input" maxLength={200} value={blockForm.reason} onChange={event => setBlockForm(form => ({ ...form, reason: event.target.value }))} />
              </FormField>
            </div>
          </div>
          {!emails ? <Loading /> : !emails.length ? <Empty text="暂无屏蔽邮箱" icon="fa-ban" /> : (
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead><tr><th scope="col">邮箱</th><th scope="col">原因</th><th scope="col">操作人</th><th scope="col">屏蔽时间</th><th scope="col">操作</th></tr></thead>
                <tbody>
                  {emails.map(record => (
                    <tr key={record.email}>
                      <td><Pill tone="red">{record.email}</Pill></td>
                      <td><div className="ac-cell-truncate" title={record.reason || ''}>{record.reason || '-'}</div></td>
                      <td className="ac-cell-muted">{record.created_by_username || '-'}</td>
                      <td className="ac-cell-muted">{record.created_at ? fmtFull(record.created_at) : '-'}</td>
                      <td><button type="button" className="ac-btn danger" onClick={() => removeBlockedEmail(record.email)}><i className="fa-solid fa-trash" aria-hidden="true" />移除</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="管理员账号安全" description="修改当前管理员密码。新密码至少 8 位。" icon="fa-key">
          <div className="ac-form-grid ac-form-grid-2">
            <FormField label="当前密码" required htmlFor="current-password">
              <input id="current-password" className="ac-input" type="password" autoComplete="current-password" value={password.old} onChange={event => setPassword(value => ({ ...value, old: event.target.value }))} />
            </FormField>
            <FormField label="新密码" required hint="至少 8 位，建议包含字母、数字和符号。" htmlFor="new-password">
              <input id="new-password" className="ac-input" type="password" autoComplete="new-password" value={password.fresh} onChange={event => setPassword(value => ({ ...value, fresh: event.target.value }))} />
            </FormField>
          </div>
          <div className="ac-action-group" style={{ marginTop: 14 }}>
            <button type="button" className="ac-btn primary" disabled={passwordSaving} onClick={changePassword}>
              {passwordSaving && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
              {passwordSaving ? '提交中' : '修改密码'}
            </button>
          </div>
        </Card>

        <Modal
          open={!!saveKey}
          onClose={() => setSaveKey(null)}
          title={saveKey?.key ? `编辑配置 ${saveKey.key}` : '新增配置项'}
          width={460}
          footer={(
            <>
              <button type="button" className="ac-btn" onClick={() => setSaveKey(null)}>取消</button>
              <button type="button" className="ac-btn primary" disabled={settingSaving} onClick={submitSetting}>{settingSaving ? '保存中' : '保存配置'}</button>
            </>
          )}
        >
          {saveKey && (
            <div className="ac-form-grid">
              <FormField label="配置键" required hint="仅支持小写字母、数字和下划线，最多 64 个字符。" htmlFor="setting-key">
                <input id="setting-key" className="ac-input" disabled={!!saveKey.key} value={saveKey.key} onChange={event => setSaveKey(value => ({ ...value, key: event.target.value }))} />
              </FormField>
              <FormField label="配置值" hint="最多 8000 个字符。" htmlFor="setting-value">
                <textarea id="setting-value" className="ac-textarea" value={saveKey.value} onChange={event => setSaveKey(value => ({ ...value, value: event.target.value }))} />
              </FormField>
            </div>
          )}
        </Modal>
      </div>
    </AdminLayout>
  );
}
