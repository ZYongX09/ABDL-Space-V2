import { validateAlipayPolicyResponse, validateAlipayPolicyUpdate } from './alipayPolicyModel.js';
import { validateAlipayRefundBody, validateIdempotencyKey, validateSponsorOverview, validateSponsorPaymentRecords, validateSponsorRefundResponse } from './sponsorLedgerModel.js';

// 由现有 AuthContext 注入已登录账户的令牌；cookie 会话沿用 credentials。
// 不独立读取账户、不回退模拟身份、不进入全站缓存。
export function createSponsorAdminAPI({ base = '', fetcher = (...args) => fetch(...args), getToken = () => '', isCurrentSession = () => true } = {}) {
  async function request(path, method = 'GET', body, shape = 'object', options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), method === 'GET' ? 30000 : 90000);
    try {
      if (!isCurrentSession()) throw new Error('账户会话已切换，请重新打开赞助者管理');
      const headers = { Accept: 'application/json', ...(options.headers || {}) };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetcher(`${base.replace(/\/$/, '')}${options.prefix ?? '/api/admin/sponsors'}${path}`, {
        method, headers, credentials: 'include', cache: 'no-store', redirect: 'error',
        signal: controller.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      let data;
      try { data = await response.json(); } catch {
        // 门禁/退款即使返回 HTML 错误页也保留 HTTP 权限/冲突/缺失语义，不展示原始响应。
        if (shape === 'alipayPolicy' && !response.ok) data = null;
        else if (shape === 'refund') throw new Error('退款响应无法解析，结果可能已受理；请先核对订单与概览，不要直接重复提交');
        else throw new Error('服务器响应无法解析，请重新读取状态；写入结果可能尚未确定');
      }
      if (!isCurrentSession()) throw new Error('账户会话已切换，已忽略旧账户响应');
      if (!response.ok) {
        const message = response.status === 401 ? (shape === 'refund' ? '登录已过期，请重新登录；未确认退款结果。' : '登录已过期，请重新登录；未确认操作成功。')
          : response.status === 403 ? '当前账户无管理员权限，或请求来源验证失败。'
            : shape === 'refund' ? (response.status === 404 || response.status === 405 ? '支付宝退款接口尚未提供，当前不可退款。'
              : response.status === 409 ? '退款操作冲突或订单状态已变化；未确认退款成功。请先核对订单与概览，不要直接重复提交。'
                : `退款请求失败（${response.status}），未确认退款成功。`)
              : response.status === 409
                ? '操作冲突：配置或套餐可能已被修改，或操作标识与请求不一致。请重新读取后核对，不要覆盖他人修改。'
                : shape === 'alipayPolicy' ? (response.status === 404 || response.status === 405 ? '支付宝门禁管理接口尚未提供，暂不可用。' : `支付宝门禁请求失败（${response.status}），未确认操作成功。`)
                  : shape === 'overview' || shape === 'records' ? (response.status === 404 || response.status === 405
                    ? '赞助账本接口尚未提供，暂不可用。' : `赞助账本请求失败（${response.status}），未获得新的数据。`)
                    : (typeof data?.error === 'string' ? data.error : `请求失败（${response.status}）`);
        const error = new Error(message);
        error.status = response.status;
        error.code = typeof data?.code === 'string' ? data.code : '';
        error.definitive = response.status >= 400 && response.status < 500;
        throw error;
      }
      const valid = data && typeof data === 'object' && !Array.isArray(data)
        && (shape !== 'list' || (Array.isArray(data.items) && Number.isSafeInteger(data.total) && data.total >= 0))
        && (shape !== 'items' || Array.isArray(data.items))
        && (shape !== 'config' || (Number.isSafeInteger(data.version) && Array.isArray(data.colors) && Array.isArray(data.benefits) && Array.isArray(data.purchase_steps)))
        && (shape !== 'plan' || (typeof data.id === 'string' && Number.isSafeInteger(data.version)))
        && (shape !== 'me' || (typeof data.sponsor?.active === 'boolean' && Number.isSafeInteger(data.quota?.remaining)))
        && (shape !== 'batch' || (typeof data.id === 'string' && Number.isSafeInteger(data.count)))
        && (shape !== 'stockBatch' || (typeof data.batch_id === 'string' && typeof data.state === 'string'))
        && (shape !== 'export' || (typeof data.id === 'string' && Array.isArray(data.codes) && data.codes.every(code => typeof code === 'string' && code.length > 0 && !/[\r\n]/.test(code))))
        && (shape !== 'stock' || (typeof data.plan_id === 'string' && typeof data.verified === 'boolean'));
      if (!valid) throw new Error('服务器响应与赞助者管理契约不一致，请重新读取并联系维护者；未确认操作成功');
      if (shape === 'alipayPolicy') return validateAlipayPolicyResponse(data);
      if (shape === 'overview') return validateSponsorOverview(data);
      if (shape === 'records') return validateSponsorPaymentRecords(data);
      if (shape === 'refund') return validateSponsorRefundResponse(data);
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error(shape === 'alipayPolicy'
        ? '支付宝门禁网络中断或超时，未确认保存成功。请先读取最新设置核查，不会自动重试或回退本地数据。'
        : shape === 'refund' ? '退款网络中断或超时，结果未知、未确认退款成功。请先核对订单与概览；不会自动重试，手动重试须复用同一操作标识。'
          : shape === 'overview' || shape === 'records' ? '赞助账本网络中断或超时，未获得新的数据；不会自动重试或回退本地数据。'
            : '网络中断或超时。写入可能已受理，请先核查状态；不要重复补货。相同表单重试将沿用操作标识。');
      throw error;
    } finally { clearTimeout(timer); }
  }
  const id = value => encodeURIComponent(value);
  const query = values => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values || {})) if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
    return params.size ? `?${params}` : '';
  };
  return {
    config: () => request('/config', 'GET', undefined, 'config'),
    saveConfig: body => request('/config', 'PUT', body, 'config'),
    alipayPolicy: () => request('/alipay-policy', 'GET', undefined, 'alipayPolicy'),
    saveAlipayPolicy: body => request('/alipay-policy', 'PUT', validateAlipayPolicyUpdate(body), 'alipayPolicy'),
    plans: () => request('/plans', 'GET', undefined, 'items'),
    createPlan: body => request('/plans', 'POST', body, 'plan'),
    updatePlan: (planId, body) => request(`/plans/${id(planId)}`, 'PUT', body, 'plan'),
    user: userId => request(`/users/${id(userId)}`, 'GET', undefined, 'me'),
    users: params => request(`/users${query(params)}`, 'GET', undefined, 'list'),
    grant: (userId, body) => request(`/users/${id(userId)}/grants`, 'POST', body, 'me'),
    revoke: (userId, body) => request(`/users/${id(userId)}/revoke`, 'POST', body, 'me'),
    quota: (userId, body) => request(`/users/${id(userId)}/quota`, 'POST', body, 'me'),
    codes: params => request(`/codes${query(params)}`, 'GET', undefined, 'list'),
    createBatch: body => request('/code-batches', 'POST', body, 'batch'),
    exportBatch: (batchId, body) => request(`/code-batches/${id(batchId)}/export`, 'POST', body, 'export'),
    codeState: (codeId, body) => request(`/codes/${id(codeId)}/state`, 'POST', body),
    audit: params => request(`/audit${query(params)}`, 'GET', undefined, 'list'),
    stock: () => request('/stock/', 'GET', undefined, 'items'),
    saveStock: (planId, body) => request(`/stock/${id(planId)}`, 'PUT', body, 'stock'),
    checkStock: (planId, body) => request(`/stock/${id(planId)}/check`, 'POST', body, 'stock'),
    refill: (planId, body) => request(`/stock/${id(planId)}/refill`, 'POST', body, 'stockBatch'),
    stockBatches: params => request(`/stock/batches${query(params)}`, 'GET', undefined, 'list'),
    reconcile: (batchId, body) => request(`/stock/batches/${id(batchId)}/reconcile`, 'POST', body, 'stockBatch'),
    overview: () => request('/overview', 'GET', undefined, 'overview'),
    paymentRecords: params => request(`/payment-records${query(params)}`, 'GET', undefined, 'records'),
    // 退款使用独立同源路径，但仍复用会话、no-store、超时与错误语义。
    refundAlipayOrder: (orderNo, body, idempotencyKey) => {
      if (typeof orderNo !== 'string' || !orderNo.trim() || orderNo.length > 128 || /[\r\n]/.test(orderNo)) throw new Error('退款订单号无效，已停止发送');
      return request(`/${id(orderNo)}/refunds`, 'POST', validateAlipayRefundBody(body), 'refund', {
        prefix: '/api/payments/alipay/orders', headers: { 'Idempotency-Key': validateIdempotencyKey(idempotencyKey) },
      });
    },
  };
}

// 明文仅存在于本次管理员点击触发的下载中；不写 React 状态、日志、剪贴板或浏览器缓存。
export function downloadCodes(result) {
  const blob = new Blob([result.codes.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sponsor-codes-${result.id.replace(/[^a-zA-Z0-9_-]/g, '_')}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
