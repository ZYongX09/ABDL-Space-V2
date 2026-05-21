import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

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

const ALL_SCOPES = ['profile', 'email', 'read', 'write'];

export default function OAuthClientsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showSecret, setShowSecret] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showDocs, setShowDocs] = useState(false);

  // 表单
  const [form, setForm] = useState({
    name: '', description: '', logo_url: '', homepage_url: '',
    redirect_uris: '', scopes: ['profile'],
  });

  useEffect(() => {
    if (!authLoading && !user) navigate('/login', { state: { from: '/oauth-clients' } });
  }, [user, authLoading, navigate]);

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/oauth/clients');
      setClients(res.clients || []);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { if (user) loadClients(); }, [user, loadClients]);

  const resetForm = () => {
    setForm({ name: '', description: '', logo_url: '', homepage_url: '', redirect_uris: '', scopes: ['profile'] });
    setEditing(null);
    setShowCreate(false);
  };

  const handleCreate = async () => {
    const uris = form.redirect_uris.split('\n').map(u => u.trim()).filter(Boolean);
    if (!form.name || uris.length === 0) { toast.error('请填写应用名称和回调地址'); return; }
    try {
      const res = await apiFetch('/api/oauth/clients', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name, description: form.description || undefined,
          logo_url: form.logo_url || undefined, homepage_url: form.homepage_url || undefined,
          redirect_uris: uris, scopes: form.scopes,
        }),
      });
      setShowSecret({ client_id: res.client.client_id, secret: res.raw_secret });
      resetForm();
      loadClients();
      toast.success('OAuth 应用创建成功');
    } catch (err) { toast.error(err.message); }
  };

  const handleUpdate = async () => {
    const uris = form.redirect_uris.split('\n').map(u => u.trim()).filter(Boolean);
    try {
      await apiFetch(`/api/oauth/clients/${editing}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name, description: form.description,
          logo_url: form.logo_url, homepage_url: form.homepage_url,
          redirect_uris: uris, scopes: form.scopes,
        }),
      });
      resetForm();
      loadClients();
      toast.success('已更新');
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (clientId) => {
    if (!confirm('确定删除此应用？所有已授权的 token 将被吊销。')) return;
    try {
      await apiFetch(`/api/oauth/clients/${clientId}`, { method: 'DELETE' });
      loadClients();
      toast.success('已删除');
    } catch (err) { toast.error(err.message); }
  };

  const startEdit = (client) => {
    setEditing(client.client_id);
    setForm({
      name: client.name,
      description: client.description || '',
      logo_url: client.logo_url || '',
      homepage_url: client.homepage_url || '',
      redirect_uris: client.redirect_uris.join('\n'),
      scopes: client.scopes,
    });
    setShowCreate(true);
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text).then(() => toast.success('已复制'), () => toast.error('复制失败'));
  };

  const toggleScope = (scope) => {
    setForm(f => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter(s => s !== scope) : [...f.scopes, scope],
    }));
  };

  if (authLoading) return null;
  if (!user) return null;

  return (
    <PageLayout hero={{ icon: 'fa-puzzle-piece', title: 'OAuth 开发平台', subtitle: '管理你的 OAuth 应用' }}>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* === 顶部操作 === */}
        <div className="flex items-center justify-between">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            共 {clients.length} 个应用
          </p>
          <div className="flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => setShowDocs(!showDocs)}>
              <i className="fa-solid fa-book mr-1" />{showDocs ? '隐藏文档' : '接入文档'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => { resetForm(); setShowCreate(true); }}>
              <i className="fa-solid fa-plus mr-1" />创建应用
            </button>
          </div>
        </div>

        {/* === 创建/编辑表单 === */}
        {showCreate && (
          <div className="card" style={{ border: '1.5px solid var(--primary-dark)' }}>
            <h3 className="font-semibold text-sm mb-3">{editing ? '编辑应用' : '创建新应用'}</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>应用名称 *</label>
                <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My App" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>描述</label>
                <input className="form-control" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="应用简介" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Logo URL</label>
                  <input className="form-control" value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>主页 URL</label>
                  <input className="form-control" value={form.homepage_url} onChange={e => setForm(f => ({ ...f, homepage_url: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>回调地址 * (每行一个)</label>
                <textarea className="form-control" rows={2} value={form.redirect_uris}
                  onChange={e => setForm(f => ({ ...f, redirect_uris: e.target.value }))}
                  placeholder="https://your-app.com/callback" />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>权限范围</label>
                <div className="flex gap-2 flex-wrap">
                  {ALL_SCOPES.map(s => (
                    <button key={s} type="button"
                      className="text-xs px-2.5 py-1 rounded-full transition-all"
                      style={{
                        background: form.scopes.includes(s) ? 'var(--primary-dark)' : 'var(--input-bg)',
                        color: form.scopes.includes(s) ? '#fff' : 'var(--text)',
                        border: '1px solid var(--border)',
                      }}
                      onClick={() => toggleScope(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button className="btn btn-primary btn-sm" onClick={editing ? handleUpdate : handleCreate}>
                  {editing ? '保存' : '创建'}
                </button>
                <button className="btn btn-outline btn-sm" onClick={resetForm}>取消</button>
              </div>
            </div>
          </div>
        )}

        {/* === Secret 显示 === */}
        {showSecret && (
          <div className="card" style={{ border: '1.5px solid var(--success)' }}>
            <div className="flex items-center gap-2 mb-2">
              <i className="fa-solid fa-circle-check" style={{ color: 'var(--success)' }} />
              <span className="font-semibold text-sm">应用已创建</span>
            </div>
            <div className="mb-3">
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Client ID:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs p-2 rounded flex-1" style={{ background: 'var(--input-bg)', wordBreak: 'break-all' }}>{showSecret.client_id}</code>
                <button className="btn btn-outline btn-sm" onClick={() => copyText(showSecret.client_id)}><i className="fa-solid fa-copy" /></button>
              </div>
            </div>
            <div className="mb-3">
              <p className="text-xs mb-1" style={{ color: 'var(--danger)' }}>Client Secret（仅显示一次，请立即保存）:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs p-2 rounded flex-1" style={{ background: 'var(--input-bg)', wordBreak: 'break-all' }}>{showSecret.secret}</code>
                <button className="btn btn-outline btn-sm" onClick={() => copyText(showSecret.secret)}><i className="fa-solid fa-copy" /></button>
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => setShowSecret(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              我已保存，关闭
            </button>
          </div>
        )}

        {/* === 应用列表 === */}
        {loading ? (
          <div className="text-center py-8"><i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--text-muted)' }} /></div>
        ) : clients.length === 0 ? (
          <div className="card text-center py-8">
            <i className="fa-solid fa-puzzle-piece text-3xl mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>还没有 OAuth 应用</p>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map(cl => (
              <div key={cl.client_id} className="card">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}>
                      {cl.logo_url ? (
                        <img src={cl.logo_url} alt="" className="w-7 h-7 rounded object-cover" />
                      ) : (
                        <i className="fa-solid fa-puzzle-piece" style={{ color: 'var(--primary-dark)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">{cl.name}</span>
                        {!cl.active && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--danger-bg, #fde8e8)', color: 'var(--danger)' }}>已禁用</span>}
                      </div>
                      {cl.description && <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{cl.description}</p>}
                      <div className="text-xs mt-1 flex flex-wrap gap-x-3 gap-y-0.5" style={{ color: 'var(--text-muted)' }}>
                        <span>Client ID: <code>{cl.client_id}</code></span>
                        <span>权限: {cl.scopes.join(', ')}</span>
                        <span>回调: {cl.redirect_uris[0]}{cl.redirect_uris.length > 1 ? ` +${cl.redirect_uris.length - 1}` : ''}</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        创建于 {new Date(cl.created_at * 1000).toLocaleString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-3 flex-shrink-0">
                    <button className="btn btn-outline btn-sm" style={{ fontSize: '0.65rem', padding: '2px 8px' }} onClick={() => startEdit(cl)}>
                      <i className="fa-solid fa-pen" />
                    </button>
                    <button className="btn btn-sm" style={{ fontSize: '0.65rem', padding: '2px 8px', background: 'var(--danger)', color: '#fff' }}
                      onClick={() => handleDelete(cl.client_id)}>
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* === 接入文档 === */}
        {showDocs && (
          <div className="card" style={{ border: '1.5px solid var(--border)' }}>
            <h3 className="font-bold text-base mb-4"><i className="fa-solid fa-book mr-2" />OAuth 2.0 接入文档</h3>

            <div className="space-y-5 text-sm">

              <section>
                <h4 className="font-semibold mb-2">授权流程 (Authorization Code + PKCE)</h4>
                <ol className="list-decimal list-inside space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <li>用户点击"使用 ABDL Space 登录"</li>
                  <li>跳转到授权页面，用户确认授权</li>
                  <li>授权后跳转回你的 <code>redirect_uri</code>，携带 <code>code</code> 和 <code>state</code></li>
                  <li>你的后端用 <code>code</code> 换取 <code>access_token</code></li>
                  <li>用 <code>access_token</code> 调用 API</li>
                </ol>
              </section>

              <section>
                <h4 className="font-semibold mb-2">Step 1: 引导用户授权</h4>
                <pre className="text-xs p-3 rounded overflow-x-auto" style={{ background: 'var(--input-bg)' }}>
{`GET https://abdl-space.top/oauth/authorize
  ?client_id=oc_your_client_id
  &redirect_uri=https://your-app.com/callback
  &scope=profile email
  &state=random_csrf_token
  &response_type=code
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256`}
                </pre>
              </section>

              <section>
                <h4 className="font-semibold mb-2">Step 2: 用 code 换 token</h4>
                <pre className="text-xs p-3 rounded overflow-x-auto" style={{ background: 'var(--input-bg)' }}>
{`POST https://api.abdl-space.top/api/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "code": "授权码",
  "redirect_uri": "https://your-app.com/callback",
  "client_id": "oc_your_client_id",
  "client_secret": "ocs_your_client_secret",
  "code_verifier": "原始随机字符串"
}`}
                </pre>
                <pre className="text-xs p-3 rounded overflow-x-auto mt-2" style={{ background: 'var(--input-bg)' }}>
{`// Response:
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "...",
  "scope": "profile email"
}`}
                </pre>
              </section>

              <section>
                <h4 className="font-semibold mb-2">Step 3: 刷新 Token</h4>
                <pre className="text-xs p-3 rounded overflow-x-auto" style={{ background: 'var(--input-bg)' }}>
{`POST https://api.abdl-space.top/api/oauth/token
{
  "grant_type": "refresh_token",
  "refresh_token": "...",
  "client_id": "oc_your_client_id",
  "client_secret": "ocs_your_client_secret"
}`}
                </pre>
              </section>

              <section>
                <h4 className="font-semibold mb-2">API 端点</h4>
                <div className="space-y-1 text-xs">
                  <p><code>GET /api/oauth/userinfo</code> — 获取用户信息（Bearer token）</p>
                  <p><code>POST /api/oauth/revoke</code> — 吊销 token</p>
                  <p><code>POST /api/oauth/introspect</code> — 自省 token</p>
                  <p><code>GET /api/oauth/scopes</code> — 可用 scope 列表</p>
                </div>
              </section>

              <section>
                <h4 className="font-semibold mb-2">可用 Scopes</h4>
                <div className="text-xs space-y-0.5">
                  <p><code>profile</code> — 用户名、头像、简介</p>
                  <p><code>email</code> — 邮箱地址</p>
                  <p><code>read</code> — 读取用户数据</p>
                  <p><code>write</code> — 写入用户数据</p>
                </div>
              </section>

              <section>
                <h4 className="font-semibold mb-2">PKCE (推荐)</h4>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  建议使用 PKCE 增强安全性。生成 43-128 字符的随机 <code>code_verifier</code>，
                  计算 <code>code_challenge = BASE64URL(SHA256(code_verifier))</code>，
                  授权时传 <code>code_challenge</code>，换 token 时传 <code>code_verifier</code>。
                </p>
              </section>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
