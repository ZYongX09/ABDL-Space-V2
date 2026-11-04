/** NewBabyWorld OAuth：短缓存仅用于展示；每次授权都向本站后端取得签名上下文。 */
import { NBWError, adoptNBWEndpoints, exactNBWFields, fetchNBWJSON, getNBWEndpointState, nbwURLSuffix, refreshNBWEndpoints, subscribeNBWEndpoints } from './nbwEndpoints.js';

let config = null, configExpiresAt = 0, configPromise = null, sessionEpoch = 0;
let oauthStatus = Object.freeze({ configured: false, available: false, error: '' });
const listeners = new Set();
export const getNBWOAuthStatus = () => oauthStatus;
export function subscribeNBWOAuth(listener) { listeners.add(listener); return () => listeners.delete(listener); }
function publishStatus(error = '') {
  const endpoint = getNBWEndpointState();
  oauthStatus = Object.freeze({
    configured: !!(config?.clientId && config?.redirectUri),
    available: !!(config?.clientId && config?.redirectUri && endpoint.endpoints?.remote_mode === 'full' && !endpoint.error && endpoint.expiresAt > Date.now() && configExpiresAt > Date.now()),
    error: error || endpoint.error,
  });
  for (const listener of listeners) listener();
}
subscribeNBWEndpoints(() => publishStatus());
function readClientConfig(data) {
  if (typeof data?.client_id !== 'string' || data.client_id.length > 512 || typeof data.redirect_uri !== 'string' || data.redirect_uri.length > 2048) throw new NBWError('NBW_INVALID_RESPONSE');
  return { clientId: data.client_id, redirectUri: data.redirect_uri };
}
export function isNBWConfigured() { return oauthStatus.available; }
export function whenNBWReady({ force = false } = {}) {
  if (!force && config && Date.now() < configExpiresAt && !getNBWEndpointState().error) return Promise.resolve(config);
  if (configPromise) return configPromise;
  configPromise = (async () => {
    try {
      await refreshNBWEndpoints({ force });
      config = readClientConfig(await fetchNBWJSON('/api/auth/nbw/config'));
      configExpiresAt = Math.min(getNBWEndpointState().expiresAt, Date.now() + 30000);
      publishStatus(); return config;
    } catch (error) {
      configExpiresAt = 0; publishStatus(error.message); return null;
    } finally { configPromise = null; }
  })();
  return configPromise;
}

/** 应用挂载负责刷新与取消订阅；不永久缓存失败 Promise，不宣称全局即时推送。 */
export function initNBWConfig() {
  void whenNBWReady();
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const refresh = () => { if (document.visibilityState !== 'hidden') void whenNBWReady({ force: true }); };
  const invalidate = () => { sessionEpoch += 1; sessionStorage.removeItem('nbw_oauth_state'); sessionStorage.removeItem('nbw_oauth_transaction'); };
  const timer = setInterval(refresh, 30000);
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  window.addEventListener('auth-session-changing', invalidate);
  document.addEventListener('visibilitychange', refresh);
  return () => {
    clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh);
    window.removeEventListener('auth-session-changing', invalidate); document.removeEventListener('visibilitychange', refresh);
  };
}
function generateState(bind) {
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  return (window.location.hostname.startsWith('m.') ? 'm_' : '') + (bind ? 'bind_' : '') + 'nbw1_' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export function readNBWAuthorization(data, state, origin) {
  if (!exactNBWFields(data, ['client_id', 'redirect_uri', 'endpoints', 'authorization_url', 'oauth_context', 'expires_in'])
    || !/^[A-Za-z0-9_-]{16,128}$/.test(state) || data.expires_in !== 600
    || typeof data.oauth_context !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(data.oauth_context)
    || typeof data.authorization_url !== 'string' || data.authorization_url.length > 8192 || nbwURLSuffix(data.authorization_url) === null) throw new NBWError('NBW_INVALID_RESPONSE');
  const client = readClientConfig(data);
  let url, redirect;
  try { url = new URL(data.authorization_url); redirect = new URL(client.redirectUri); } catch { throw new NBWError('NBW_INVALID_RESPONSE'); }
  if (!client.clientId || redirect.origin !== origin || redirect.username || redirect.password || redirect.hash
    || redirect.pathname !== '/auth/nbw/callback' || redirect.search
    || url.origin !== data.endpoints?.authorize_origin || url.pathname !== '/oauth/authorize.php' || url.hash
    || url.searchParams.size !== 4 || !['client_id', 'redirect_uri', 'response_type', 'state'].every(key => url.searchParams.getAll(key).length === 1)
    || url.searchParams.get('client_id') !== client.clientId || url.searchParams.get('redirect_uri') !== client.redirectUri
    || url.searchParams.get('response_type') !== 'code' || url.searchParams.get('state') !== state) throw new NBWError('NBW_INVALID_RESPONSE');
  const endpoints = adoptNBWEndpoints(data.endpoints);
  if (endpoints.remote_mode !== 'full') throw new NBWError('NBW_REMOTE_DISABLED');
  return { client, endpoints, authorizationURL: data.authorization_url, context: data.oauth_context };
}
let starting = false;
async function start(bind) {
  if (starting) return;
  starting = true;
  try {
    const state = generateState(bind), session = sessionEpoch, endpointEpoch = getNBWEndpointState().epoch;
    const data = await fetchNBWJSON(`/api/auth/nbw/config?${new URLSearchParams({ state })}`);
    if (session !== sessionEpoch || endpointEpoch !== getNBWEndpointState().epoch) throw new NBWError('NBW_ENDPOINT_CHANGED');
    // 新协议错误绝不降成旧两字段配置或硬编码 primary；只有 server 提供的精确 URL 可跳转。
    const authorization = readNBWAuthorization(data, state, window.location.origin);
    config = authorization.client; configExpiresAt = getNBWEndpointState().expiresAt; publishStatus();
    sessionStorage.setItem('nbw_oauth_transaction', JSON.stringify({ state, context: authorization.context, origin: window.location.origin, expiresAt: Date.now() + 600000, bind }));
    sessionStorage.setItem('nbw_oauth_state', state);
    window.location.assign(authorization.authorizationURL);
  } catch (error) { publishStatus(error.message); throw error; }
  finally { starting = false; }
}
export const startNBWOAuth = () => start(false);
export const startNBWBind = () => start(true);
export const isNBWMobileState = state => typeof state === 'string' && state.startsWith('m_');
export const isNBWBindState = state => typeof state === 'string' && (state.startsWith('bind_') || state.startsWith('m_bind_'));
export function verifyNBWState(returnedState) {
  return typeof returnedState === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(returnedState) && sessionStorage.getItem('nbw_oauth_state') === returnedState;
}
function callbackPayload(code, state, bind) {
  if (typeof code !== 'string' || !code || code.length > 4096 || /[\x00-\x20\x7f]/.test(code) || !verifyNBWState(state) || isNBWBindState(state) !== bind) throw new NBWError('NBW_OAUTH_CONTEXT_INVALID');
  const raw = sessionStorage.getItem('nbw_oauth_transaction');
  let transaction;
  if (!raw && /^(?:m_)?(?:bind_)?nbw1_/.test(state)) throw new NBWError('NBW_OAUTH_CONTEXT_INVALID');
  if (raw) {
    try { if (raw.length > 8192) throw new Error(); transaction = JSON.parse(raw); } catch { throw new NBWError('NBW_OAUTH_CONTEXT_INVALID'); }
    if (transaction.state !== state || transaction.origin !== window.location.origin || transaction.bind !== bind
      || typeof transaction.context !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(transaction.context)) throw new NBWError('NBW_OAUTH_CONTEXT_INVALID');
    if (!Number.isFinite(transaction.expiresAt) || transaction.expiresAt <= Date.now() || transaction.expiresAt > Date.now() + 600000) throw new NBWError('NBW_OAUTH_CONTEXT_EXPIRED');
  }
  // 兼容部署前已在本 tab 发起、只有旧 state 的 primary 事务。新事务始终携带 context。
  sessionStorage.removeItem('nbw_oauth_state'); sessionStorage.removeItem('nbw_oauth_transaction');
  return transaction ? { code, state, oauth_context: transaction.context } : { code };
}
async function complete(code, state, bind) {
  const payload = callbackPayload(code, state, bind);
  const snapshot = getNBWEndpointState();
  if (snapshot.endpoints && snapshot.endpoints.remote_mode !== 'full') throw new NBWError('NBW_REMOTE_DISABLED');
  return fetchNBWJSON(bind ? '/api/auth/nbw/bind' : '/api/auth/nbw/callback', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
}
export const exchangeNBWCode = (code, state) => complete(code, state, false);
export const bindNBWAccount = (code, state) => complete(code, state, true);

// 只透传本站服务器签发的绑定凭据或旧注册 code 上下文；绝不把它当上游 access_token。
export function nbwRegistrationFields(value = {}) {
  const fields = {};
  for (const key of ['nbw_token', 'nbw_code', 'nbw_state', 'nbw_oauth_context']) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string' || !value[key] || value[key].length > 4096 || /[\x00-\x20\x7f]/.test(value[key])) throw new NBWError('NBW_OAUTH_CONTEXT_INVALID');
    fields[key] = value[key];
  }
  if ((fields.nbw_token && fields.nbw_code) || (!!fields.nbw_state !== !!fields.nbw_oauth_context)
    || ((fields.nbw_state || fields.nbw_oauth_context) && !fields.nbw_code)
    || (fields.nbw_state && !/^[A-Za-z0-9_-]{16,128}$/.test(fields.nbw_state))) throw new NBWError('NBW_OAUTH_CONTEXT_INVALID');
  return fields;
}
