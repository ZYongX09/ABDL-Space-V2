import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { captchaAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/* ---- API helpers (captcha key management) ---- */
function getToken() { return localStorage.getItem('token'); }

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`服务器响应异常 (${res.status})`); }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

/* ---- 主组件 ---- */
export default function CaptchaApiPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyRateLimit, setNewKeyRateLimit] = useState(100);
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState(null);   // 创建后显示的完整 key
  const [showDocs, setShowDocs] = useState(false);
  const [apiStatus, setApiStatus] = useState(null);

  /* ---- 未登录 → 弹登录 ---- */
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login', { state: { from: '/captcha-api' } });
    }
  }, [user, authLoading, navigate]);

  /* ---- 加载 keys ---- */
  const loadKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/captcha/keys');
      setKeys(res.keys || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) loadKeys();
  }, [user, loadKeys]);

  /* ---- 加载 API 状态 ---- */
  useEffect(() => {
    captchaAPI.status().then(setApiStatus).catch(() => {});
  }, []);

  /* ---- 创建 key ---- */
  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await apiFetch('/api/captcha/keys', {
        method: 'POST',
        body: JSON.stringify({
          label: newKeyLabel || undefined,
          rate_limit: newKeyRateLimit,
          permissions: ['create', 'check'],
        }),
      });
      setRevealedKey(res.key);
      setShowCreate(false);
      setNewKeyLabel('');
      setNewKeyRateLimit(100);
      loadKeys();
      toast.success('API Key 创建成功');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  /* ---- 切换 active ---- */
  const toggleActive = async (id, currentActive) => {
    try {
      await apiFetch(`/api/captcha/keys/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !currentActive }),
      });
      loadKeys();
    } catch (err) {
      toast.error(err.message);
    }
  };

  /* ---- 删除 key ---- */
  const deleteKey = async (id) => {
    if (!confirm('确定删除此 API Key？删除后不可恢复。')) return;
    try {
      await apiFetch(`/api/captcha/keys/${id}`, { method: 'DELETE' });
      loadKeys();
      toast.success('已删除');
    } catch (err) {
      toast.error(err.message);
    }
  };

  /* ---- 复制到剪贴板 ---- */
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success('已复制'),
      () => toast.error('复制失败')
    );
  };

  if (authLoading) return null;
  if (!user) return null;

  return (
    <PageLayout hero={{ icon: 'fa-key', title: 'Captcha API', subtitle: '管理验证码 API Key 与接入文档' }}>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* === API 状态 === */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <i className="fa-solid fa-heart-pulse" style={{ color: 'var(--primary-dark)' }} />
            <span className="font-semibold text-sm">API 状态</span>
            {apiStatus && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--success-bg, #e6f9e6)', color: 'var(--success)' }}>
                {apiStatus.status} · v{apiStatus.version}
              </span>
            )}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            支持类型: {apiStatus?.types?.join(', ') || 'quantum'} ·
            当前共 {keys.length} 个 API Key
          </p>
        </div>

        {/* === 创建按钮 === */}
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-list mr-2" />API Keys
          </h2>
          <div className="flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => setShowDocs(!showDocs)}>
              <i className="fa-solid fa-book mr-1" />{showDocs ? '隐藏文档' : 'API 文档'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
              <i className="fa-solid fa-plus mr-1" />创建 Key
            </button>
          </div>
        </div>

        {/* === 创建后显示完整 key === */}
        {revealedKey && (
          <div className="card" style={{ border: '1.5px solid var(--success)' }}>
            <div className="flex items-center gap-2 mb-2">
              <i className="fa-solid fa-circle-check" style={{ color: 'var(--success)' }} />
              <span className="font-semibold text-sm">API Key 已创建</span>
            </div>
            <p className="text-xs mb-2" style={{ color: 'var(--danger)' }}>
              <i className="fa-solid fa-triangle-exclamation mr-1" />
              请立即复制保存，此 Key 仅显示一次！
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs p-2 rounded" style={{ background: 'var(--input-bg)', wordBreak: 'break-all' }}>
                {revealedKey}
              </code>
              <button className="btn btn-outline btn-sm" onClick={() => copyToClipboard(revealedKey)}>
                <i className="fa-solid fa-copy" />
              </button>
            </div>
            <button className="btn btn-sm mt-2" onClick={() => setRevealedKey(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              我已保存，关闭
            </button>
          </div>
        )}

        {/* === 创建表单 === */}
        {showCreate && (
          <div className="card" style={{ border: '1.5px solid var(--border)' }}>
            <h3 className="font-semibold text-sm mb-3">创建新 API Key</h3>
            <div className="mb-3">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>备注名称（可选）</label>
              <input className="form-control" value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)}
                placeholder="如: 我的网站" />
            </div>
            <div className="mb-3">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>每小时请求上限</label>
              <input type="number" className="form-control" value={newKeyRateLimit}
                onChange={e => setNewKeyRateLimit(Number(e.target.value))} min={1} max={10000} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={creating}>
                {creating ? '创建中...' : '确认创建'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowCreate(false)}>取消</button>
            </div>
          </div>
        )}

        {/* === Key 列表 === */}
        {loading ? (
          <div className="text-center py-8">
            <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : keys.length === 0 ? (
          <div className="card text-center py-8">
            <i className="fa-solid fa-key text-2xl mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>还没有 API Key</p>
          </div>
        ) : (
          <div className="space-y-3">
            {keys.map(k => (
              <div key={k.id} className="card" style={{ opacity: k.active ? 1 : 0.5 }}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <code className="text-xs font-bold">{k.key_prefix}...</code>
                      {k.label && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.label}</span>}
                      <span className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: k.active ? 'var(--success-bg, #e6f9e6)' : 'var(--danger-bg, #fde8e8)', color: k.active ? 'var(--success)' : 'var(--danger)' }}>
                        {k.active ? '启用' : '禁用'}
                      </span>
                    </div>
                    <div className="text-xs space-x-3" style={{ color: 'var(--text-muted)' }}>
                      <span>权限: {k.permissions.join(', ')}</span>
                      <span>限速: {k.rate_limit}/h</span>
                      <span>调用: {k.use_count} 次</span>
                      {k.last_used && <span>最后使用: {new Date(k.last_used * 1000).toLocaleString('zh-CN')}</span>}
                    </div>
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      创建于 {new Date(k.created_at * 1000).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-3">
                    <button className="btn btn-outline btn-sm" style={{ fontSize: '0.65rem', padding: '2px 8px' }}
                      onClick={() => toggleActive(k.id, k.active)}>
                      {k.active ? '禁用' : '启用'}
                    </button>
                    <button className="btn btn-sm" style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'var(--danger)', color: '#fff' }}
                      onClick={() => deleteKey(k.id)}>
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* === API 文档 === */}
        {showDocs && (
          <div className="card" style={{ border: '1.5px solid var(--border)' }}>
            <h3 className="font-bold text-base mb-4" style={{ color: 'var(--text)' }}>
              <i className="fa-solid fa-book mr-2" />Captcha API 文档
            </h3>

            <div className="space-y-5 text-sm" style={{ color: 'var(--text)' }}>

              {/* 基础信息 */}
              <section>
                <h4 className="font-semibold mb-2">基础信息</h4>
                <div className="text-xs p-3 rounded" style={{ background: 'var(--input-bg)' }}>
                  <p>Base URL: <code>https://api.abdl-space.top/api/v1/captcha</code></p>
                  <p>鉴权方式: <code>Authorization: Bearer cv_xxxx</code></p>
                  <p>Content-Type: <code>application/json</code></p>
                </div>
              </section>

              {/* 创建验证 */}
              <section>
                <h4 className="font-semibold mb-2">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold mr-2" style={{ background: 'var(--primary-dark)', color: '#fff' }}>POST</span>
                  /create
                </h4>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>创建一个新的验证码会话</p>
                <div className="text-xs p-3 rounded mb-2" style={{ background: 'var(--input-bg)' }}>
                  <p className="font-semibold mb-1">Request Body:</p>
                  <pre className="overflow-x-auto">{`{
  "type": "quantum"    // 可选，默认 "quantum"
}`}</pre>
                </div>
                <div className="text-xs p-3 rounded" style={{ background: 'var(--input-bg)' }}>
                  <p className="font-semibold mb-1">Response:</p>
                  <pre className="overflow-x-auto">{`{
  "session_id": "a1b2c3...",
  "type": "quantum",
  "challenge": {
    "nodes": [...],
    "order": ["β","α","γ","δ","ε"],
    "width": 500,
    "height": 260
  },
  "ttl": 300
}`}</pre>
                </div>
              </section>

              {/* 校验答案 */}
              <section>
                <h4 className="font-semibold mb-2">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold mr-2" style={{ background: 'var(--primary-dark)', color: '#fff' }}>POST</span>
                  /check
                </h4>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>提交用户操作结果，校验是否正确</p>
                <div className="text-xs p-3 rounded mb-2" style={{ background: 'var(--input-bg)' }}>
                  <p className="font-semibold mb-1">Request Body:</p>
                  <pre className="overflow-x-auto">{`{
  "session_id": "a1b2c3...",
  "answer": "β,α,γ,δ,ε"
}`}</pre>
                </div>
                <div className="text-xs p-3 rounded" style={{ background: 'var(--input-bg)' }}>
                  <p className="font-semibold mb-1">Response:</p>
                  <pre className="overflow-x-auto">{`{
  "verified": true,
  "token": "eyJhbG...",
  "attempts_left": 4,
  "locked": false
}`}</pre>
                </div>
              </section>

              {/* 获取类型 */}
              <section>
                <h4 className="font-semibold mb-2">
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold mr-2" style={{ background: 'var(--success)', color: '#fff' }}>GET</span>
                  /types
                </h4>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>获取支持的验证类型列表</p>
                <div className="text-xs p-3 rounded" style={{ background: 'var(--input-bg)' }}>
                  <p className="font-semibold mb-1">Response:</p>
                  <pre className="overflow-x-auto">{`{
  "types": ["quantum"]
}`}</pre>
                </div>
              </section>

              {/* 调用示例 */}
              <section>
                <h4 className="font-semibold mb-2">调用示例</h4>
                <div className="text-xs p-3 rounded" style={{ background: 'var(--input-bg)' }}>
                  <pre className="overflow-x-auto">{`// 1. 创建验证会话
const { session_id, challenge } = await fetch(
  'https://api.abdl-space.top/api/v1/captcha/create',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer cv_your_key_here',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'quantum' }),
  }
).then(r => r.json());

// 2. 渲染验证 UI（使用 challenge 数据）
// challenge.order = 正确节点顺序
// challenge.nodes = 节点位置

// 3. 用户完成后，提交答案
const result = await fetch(
  'https://api.abdl-space.top/api/v1/captcha/check',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer cv_your_key_here',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id,
      answer: userSequence.join(','),
    }),
  }
).then(r => r.json());

// result.verified = true/false
// result.token = 一次性令牌（可选用于后续业务调用）`}</pre>
                </div>
              </section>

              {/* 错误码 */}
              <section>
                <h4 className="font-semibold mb-2">错误码</h4>
                <div className="text-xs space-y-1">
                  <p><code>401</code> — 缺少或无效的 API Key</p>
                  <p><code>403</code> — Key 权限不足</p>
                  <p><code>400</code> — 参数错误</p>
                  <p><code>429</code> — 请求频率超限</p>
                  <p><code>500</code> — 服务器内部错误</p>
                </div>
              </section>

              {/* Quantum 验证说明 */}
              <section>
                <h4 className="font-semibold mb-2">Quantum 验证说明</h4>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  <p className="mb-1">Quantum 验证要求用户按照高亮提示的顺序依次点击 5 个节点（α, β, γ, δ, ε）。</p>
                  <p className="mb-1">• <code>challenge.order</code> 包含正确的节点顺序</p>
                  <p className="mb-1">• 用户操作结果以逗号分隔的节点 ID 字符串提交（如 <code>"β,α,γ,δ,ε"</code>）</p>
                  <p className="mb-1">• 每个 session 最多 5 次尝试，超过后锁定 5 分钟</p>
                  <p>• Session 有效期 5 分钟</p>
                </div>
              </section>

            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
