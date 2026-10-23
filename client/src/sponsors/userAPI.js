import { validateCatalog, validateHistory, validateMe } from './userModel.js';

function apiError(message, { status = 0, code = '', unknownOutcome = false, cause } = {}) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.unknownOutcome = unknownOutcome;
  if (cause !== undefined) error.cause = cause;
  return error;
}

// 不读取全站缓存或模拟身份；每次调用都使用注入的当前会话，不自动重发写入。
export function createSponsorAPI({ base = '', getToken = () => '', isCurrentSession = () => true, fetcher = fetch } = {}) {
  async function request(path, method, body, validator, signal) {
    const controller = new AbortController();
    const writing = method !== 'GET';
    let sent = false;
    let response;
    let errorCode = '';
    let timeout;
    let cancel;
    let cancelledError;
    const cancellation = new Promise((_, reject) => { cancel = reject; });
    // 中止发生在 fetcher 启动前时也避免产生未处理的 rejection。
    cancellation.catch(() => {});
    const status = () => Number.isInteger(response?.status) ? response.status : 0;
    const uncertain = message => apiError(`${message}，结果未确认${writing ? '；请先核查状态，重试须沿用相同操作标识' : '，请重试读取'}`, { status: status(), code: errorCode, unknownOutcome: writing && sent });
    const checkSession = () => {
      if (!isCurrentSession()) throw apiError(sent ? '账户会话已切换，已忽略旧账户响应；结果未确认，请在原账户核查状态' : '账户会话已切换，请重新登录后打开赞助中心', { status: status(), unknownOutcome: writing && sent });
    };
    const abort = message => {
      if (cancelledError) return;
      cancelledError = sent ? uncertain(message) : apiError('请求已取消，尚未发送', { status: status(), code: errorCode });
      cancel(cancelledError);
      controller.abort();
    };
    const onAbort = () => abort('请求已取消');
    const wait = async task => {
      const value = await Promise.race([task, cancellation]);
      if (cancelledError) throw cancelledError;
      return value;
    };
    try {
      checkSession();
      if (signal?.aborted) throw apiError('请求已取消，尚未发送');
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const payload = body === undefined ? undefined : JSON.stringify(body);
      checkSession();
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) throw apiError('请求已取消，尚未发送');
      timeout = setTimeout(() => abort('请求超时（30 秒）'), 30000);
      sent = true;
      response = await wait(fetcher(`${base.replace(/\/+$/, '')}/api/v1/sponsors${path}`, {
        method, headers, credentials: 'include', cache: 'no-store', redirect: 'error', signal: controller.signal,
        ...(payload !== undefined ? { body: payload } : {}),
      }));
      checkSession();
      let data;
      try {
        data = await wait(response.json());
      } catch (cause) {
        checkSession();
        // 401 即使不是 JSON 也应展示登录提示，并保留 HTTP 状态。
        if (response.status === 401) throw apiError('登录已过期，请重新登录；未确认操作成功', { status: 401, unknownOutcome: writing && sent, cause });
        if (cancelledError) throw cancelledError;
        const error = uncertain('服务器响应无法解析');
        error.cause = cause;
        throw error;
      }
      checkSession();
      errorCode = typeof data?.code === 'string' ? data.code : '';
      if (!response.ok) {
        const unknownOutcome = writing && sent && (response.status < 400 || response.status >= 500);
        const serverMessage = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : typeof data?.message === 'string' && data.message.trim() ? data.message.trim() : '';
        const message = response.status === 401 ? '登录已过期，请重新登录；未确认操作成功'
          : response.status === 503 ? '赞助服务暂不可用，请稍后重试'
            : response.status === 403 ? '当前账户无权执行此操作，或请求来源验证失败'
              : response.status === 409 ? `${serverMessage || '操作冲突'}；请核查账户状态，重试须沿用相同操作标识`
                : `赞助请求失败（${response.status}）${serverMessage ? `：${serverMessage}` : ''}`;
        throw apiError(`${message}${unknownOutcome ? '；结果未确认，请先核查状态' : ''}`, { status: response.status, code: errorCode, unknownOutcome });
      }
      let result;
      try { result = validator(data); }
      catch (cause) {
        const error = uncertain(`服务器响应数据不符合赞助契约（${cause.message}）`);
        error.cause = cause;
        throw error;
      }
      checkSession();
      return result;
    } catch (error) {
      // 旧账户的错误与成功响应一样不能被当前账户采用。
      checkSession();
      if (typeof error?.unknownOutcome === 'boolean') throw error;
      if (!sent) throw apiError('请求准备失败，尚未发送，请重试', { cause: error });
      const failure = cancelledError || uncertain('网络中断或传输失败');
      if (!failure.cause) failure.cause = error;
      throw failure;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  return {
    catalog: ({ signal } = {}) => request('/catalog', 'GET', undefined, validateCatalog, signal),
    me: ({ signal } = {}) => request('/me', 'GET', undefined, validateMe, signal),
    redeem: (body, { signal } = {}) => request('/redeem', 'POST', { code: body?.code, operation_id: body?.operation_id }, validateMe, signal),
    color: (colorKey, { signal } = {}) => request('/color', 'PUT', { color_key: colorKey }, validateMe, signal),
    claim: (body, { signal } = {}) => request('/claims', 'POST', { benefit_id: body?.benefit_id, operation_id: body?.operation_id }, validateMe, signal),
    history: ({ offset = 0, limit = 20, signal } = {}) => request(`/redemptions?${new URLSearchParams({ offset: String(offset), limit: String(limit) })}`, 'GET', undefined, validateHistory, signal),
  };
}
