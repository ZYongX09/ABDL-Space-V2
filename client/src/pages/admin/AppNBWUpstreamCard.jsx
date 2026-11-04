import { useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { createNBWUpstreamEditor, initialNBWUpstreamState, isNBWUpstreamDirty, NBW_BACKUP_HOST, NBW_PRIMARY_HOST, NBW_UPSTREAM_MODES } from '../../nbwUpstream/model.js';
import { Card, ErrorBox, Loading, Pill } from './ui';

// 生产组件共用此视图，SSR 覆盖真实加载/切换/保存状态，不另造测试 UI。
export function AppNBWUpstreamView({ state, onChange, onSave, onReload, onCancel }) {
  const { saved, draft, loading, saving, needsReload, error, notice } = state;
  const dirty = isNBWUpstreamDirty(saved, draft);
  const disabled = loading || saving || needsReload;
  return <Card title="NBW 上游域名（备用切换）" icon="fa-tower-broadcast" className="ac-app-nbw-upstream-card" description="宝宝新天地全链路在主、备两个固定域名之间联动：服务器调用、新版 App 与双网页授权、公开链接和图片。">
    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <p id="nbw-upstream-scope" className="ac-app-note">两个域名固定，不可自填。服务器的同步发布、读取、OAuth 交换及新版客户端的授权/登录页、NBW 公开链接与图片随主备切换；稳定账号身份与原正文不变。网页配置最多缓存 30 秒，回到前台和发起授权前刷新，不是全球即时推送；不会重试已失败的请求。</p>
      <p id="nbw-upstream-recovery" className="ac-section-note">主域名故障时切换到备用域名可恢复同步；主域名恢复后请切回主域名。本卡片不修改用户真实的 NBW 绑定或授权，也不删除或验证任何账号凭据。旧 App/旧网页可能仍硬编码主域名，需更新才能完整跟随；进行中的授权固定原域名完成，失败需用户重新发起，不跨域重发授权码。仅本站/只读能力门禁不因切换而放开。</p>
      <p id="nbw-upstream-hosts" className="ac-section-note">固定主域名：{NBW_PRIMARY_HOST}；固定备用域名：{NBW_BACKUP_HOST}。两个域名由服务器下发，本卡片不接受自填或其他域名。</p>
      {saved && <div id="nbw-upstream-saved-summary" className="ac-app-policy-status" role="status" aria-live="polite">
        <Pill tone={saved.mode === 'primary' ? 'green' : 'amber'}>当前上游：{NBW_UPSTREAM_MODES[saved.mode]}</Pill>
        <span>主域名：{NBW_PRIMARY_HOST}；备用域名：{NBW_BACKUP_HOST}。服务器后续调用生效；新版客户端刷新配置后联动，无需重启。</span>
      </div>}
      {loading && <Loading text="正在读取 NBW 上游域名…" />}
      <ErrorBox msg={error} />
      {saved && <form id="nbw-upstream-form" onSubmit={event => { event.preventDefault(); onSave?.(); }} aria-describedby="nbw-upstream-scope nbw-upstream-recovery" style={{ marginTop: 14, minWidth: 0 }}>
        <fieldset className="ac-app-fieldset" disabled={disabled}>
          <legend className="ac-app-visually-hidden">NBW 上游域名配置</legend>
          {Object.entries(NBW_UPSTREAM_MODES).map(([mode, label]) => (
            <label key={mode} className="ac-check-row">
              <input type="radio" name="nbw-upstream-mode" value={mode} checked={draft === mode} onChange={() => onChange?.(mode)} />
              <span>{label}（{mode === 'primary' ? NBW_PRIMARY_HOST : NBW_BACKUP_HOST}）</span>
            </label>
          ))}
          <p className="ac-section-note">只能在主域名与备用域名之间切换，不接受自填或其他域名；此处不展示、不修改任何密钥或令牌。</p>
          <button type="submit" className="ac-btn primary" style={{ justifySelf: 'start', maxWidth: '100%', whiteSpace: 'normal' }}>保存 NBW 上游域名</button>
        </fieldset>
      </form>}
      <p id="nbw-upstream-form-status" role="status" aria-live="polite" className="ac-section-note">{notice || (saving ? '正在保存 NBW 上游域名…' : needsReload ? '未确认最新上游域名，必须成功重新加载后才能保存。' : dirty ? '表单有未保存更改，尚未生效。' : saved ? '当前选择与已保存配置一致。' : '')}</p>
      <div className="ac-action-group" style={{ marginTop: 14, minWidth: 0 }}>
        <button type="button" className="ac-btn" style={{ maxWidth: '100%', whiteSpace: 'normal' }} disabled={loading || saving} onClick={onReload}>重新加载已保存上游域名</button>
        {(loading || saving) && <button type="button" className="ac-btn" onClick={onCancel}>取消当前请求</button>}
      </div>
    </div>
  </Card>;
}

// 继承父级 AppClientsContent 的 AdminLayout，不嵌套布局；按管理员身份/会话 key 隔离，变更同步废弃在途响应。
export default function AppNBWUpstreamCard() {
  const [state, setState] = useState(initialNBWUpstreamState);
  const editor = useRef(null);
  useEffect(() => {
    const current = createNBWUpstreamEditor(adminAPI, { onChange: setState });
    editor.current = current;
    const sessionChanging = () => {
      current.dispose();
      setState({ ...initialNBWUpstreamState(), loading: false, error: '管理员会话已变更，请在当前账号下重新打开管理页面。' });
    };
    window.addEventListener('auth-session-changing', sessionChanging);
    void current.load();
    return () => {
      window.removeEventListener('auth-session-changing', sessionChanging);
      current.dispose();
      if (editor.current === current) editor.current = null;
    };
  }, []);
  return <AppNBWUpstreamView state={state} onChange={mode => editor.current?.change(mode)} onSave={() => void editor.current?.save()} onReload={() => void editor.current?.load()} onCancel={() => editor.current?.cancel()} />;
}
