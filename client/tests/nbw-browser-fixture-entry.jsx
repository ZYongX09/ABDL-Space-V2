import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import NBWImage from '../src/components/NBWImage.jsx';
import RichContent from '../src/components/RichContent.jsx';
import ImageGrid from '../src/components/ImageGrid.jsx';
import { NBW_PRIMARY_ORIGIN as P, fetchNBWJSON, refreshNBWEndpoints, registrationNBWURL } from '../src/utils/nbwEndpoints.js';
import { bindNBWAccount, exchangeNBWCode, initNBWConfig, startNBWBind, startNBWOAuth, verifyNBWState } from '../src/utils/nbwOAuth.js';
import { useNBWEndpoints, useNBWOAuth } from '../src/utils/useNBWEndpoints.js';

const cached = Object.freeze({ id: 'stable-fixture-42', uri: `${P}/identity/42`, content: `原正文不改 ${P}/forum.php?mod=viewthread&tid=42&signature=fixture%2Bsig`, avatar: `${P}/fixture-avatar.png`, images: [{ image_url: `${P}/fixture-original.png?sig=a%2Bb`, preview_url: `${P}/fixture-preview.png?sig=a%2Bb`, is_nsfw: false }] });
function Fixture() {
  const endpoint = useNBWEndpoints(), oauth = useNBWOAuth();
  const started = React.useRef(false);
  const [status, setStatus] = useState('尚未发起请求，NBW冷启动保持占位'), [authorized, setAuthorized] = useState(''), [events, setEvents] = useState(null), [register, setRegister] = useState('');
  // 特意不自动初始化，让浏览器可以在discovery之前查看真实共享渲染组件的占位。
  useEffect(() => {
    const capture = event => { setAuthorized(event.detail); setStatus('已捕获授权URL：不会导航到真实NBW'); };
    window.addEventListener('nbw-fixture-navigation', capture);
    return () => window.removeEventListener('nbw-fixture-navigation', capture);
  }, []);
  const run = async fn => { try { await fn(); } catch (error) { setStatus(error.message); } };
  const control = async body => {
    const result = await fetchNBWJSON('/__fixture/nbw/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setEvents(result); setStatus(`服务端已设为 ${result.endpoints.mode} / ${result.endpoints.remote_mode} / ${result.endpoints.revision}`);
  };
  const refresh = async () => { const result = await refreshNBWEndpoints({ force: true }); setStatus(`已刷新 ${result.mode} / ${result.revision}`); };
  const complete = async mismatch => {
    const state = sessionStorage.getItem('nbw_oauth_state');
    const returned = mismatch ? 'wrong-state-fixture-000' : state;
    if (!verifyNBWState(returned)) { setStatus('回调state不匹配，未POST且原事务保留'); return; }
    const result = /^(?:m_)?bind_/.test(state) ? await bindNBWAccount('fixture-code-browser', returned) : await exchangeNBWCode('fixture-code-browser', returned);
    setStatus(`合成回调完成 ${JSON.stringify(result)}`);
  };
  return <main style={{ maxWidth: 1000, margin: '20px auto', padding: 20, fontFamily: 'system-ui', color: '#24344c', background: '#f3f7fc', borderRadius: 16 }}>
    <h1>NBW双网页全链路本地验收</h1>
    <p>仅loopback合成数据。真实共享NBW组件/配置/state/context；CSP拒绝外网图片/iframe/API，授权仅捕获URL不离开本页。</p>
    <p>当前页面Origin <strong>{window.location.origin}</strong>；另可用localhost/127.0.0.1两个独立origin验证同站callback，不能跨origin搬state。</p>
    <section aria-label="服务端控制">
      <h2>服务端快照控制</h2>
      <button onClick={() => run(() => control({ mode: 'primary' }))}>服务端切主域</button>{' '}
      <button onClick={() => run(() => control({ mode: 'backup' }))}>服务端切备用</button>{' '}
      <button onClick={() => run(() => control({ mode: endpoint.endpoints?.mode || 'backup' }))}>同域增加revision</button>{' '}
      <button onClick={() => run(() => control({ reset: true }))}>重置为备用full</button>
      <p>{['full', 'read_only', 'local_only'].map(mode => <button key={mode} onClick={() => run(() => control({ remote_mode: mode }))}>{`模式 ${mode}`}</button>)}</p>
      <p>{[['normal', '正常响应'], ['unavailable', '模拟discovery503'], ['invalid', '模拟非法origin'], ['old-server', '模拟旧两字段config'], ['context-expired', '模拟context过期'], ['context-consumed', '模拟context已消费'], ['register-evil', '模拟恶意registrationURL']].map(([scenario, label]) => <button key={scenario} onClick={() => run(() => control({ scenario }))}>{label}</button>)}</p>
      <button onClick={() => run(refresh)}>强制刷新发现</button>{' '}
      <button onClick={() => run(async () => { if (started.current) return; started.current = true; const cleanup = initNBWConfig(); window.addEventListener('pagehide', cleanup, { once: true }); setStatus('已启动生产30秒/前台刷新'); })}>启用生产TTL观察</button>{' '}
      <button onClick={() => run(async () => setEvents(await fetchNBWJSON('/__fixture/nbw/control')))}>读取本地请求记录</button>
    </section>
    <section aria-label="OAuth控制"><h2>授权与回调</h2>
      <button onClick={() => run(startNBWOAuth)}>登录授权（捕获URL）</button>{' '}
      <button onClick={() => run(startNBWBind)}>绑定授权（捕获URL）</button>{' '}
      <button onClick={() => run(() => complete(false))}>提交合成回调</button>{' '}
      <button onClick={() => run(() => complete(true))}>提交错误state</button>{' '}
      <button onClick={() => { sessionStorage.removeItem('nbw_oauth_transaction'); setStatus('已移除context，下次新state回调必须失败且不降code-only'); }}>移除context测试</button>
      <p><button onClick={() => run(() => control({ hold_authorization: true }))}>保持下一授权响应</button>{' '}<button onClick={() => run(() => control({ release_authorization: true }))}>释放被保持的授权响应</button></p>
      <p>入口状态 <strong>{oauth.available ? '可授权' : '未就绪或能力禁用'}</strong></p>
      <output aria-label="捕获的授权URL" style={{ display: 'block', overflowWrap: 'anywhere' }}>{authorized || '尚未捕获'}</output>
    </section>
    <section aria-label="旧缓存展示"><h2>旧state展示URL（不会修改正文/uri对象）</h2>
      <NBWImage src={cached.avatar} alt="旧NBW头像" width="56" height="56" />
      <RichContent text={cached.content} />
      <ImageGrid images={cached.images} />
      <pre>{JSON.stringify({ stable_id: cached.id, uri: cached.uri, content: cached.content }, null, 2)}</pre>
    </section>
    <section><h2>注册URL安全检查</h2>
      <button onClick={() => run(async () => { await refreshNBWEndpoints({ force: true }); const result = await fetchNBWJSON('/api/auth/nbw/get-register-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); setRegister(registrationNBWURL(result.data.register_url)); setStatus('注册URL已strict验证；本fixture不打开iframe'); })}>检查registrationURL</button>
      <output style={{ display: 'block', overflowWrap: 'anywhere' }}>{register}</output>
    </section>
    <p role="status" style={{ padding: 12, background: 'white', borderRadius: 8 }}>{status}</p>
    <h2>客户端快照</h2><pre>{JSON.stringify(endpoint, null, 2)}</pre>
    <h2>本地请求记录（无code/token）</h2><pre>{JSON.stringify(events, null, 2)}</pre>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
