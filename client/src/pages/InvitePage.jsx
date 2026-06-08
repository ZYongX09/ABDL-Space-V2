import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';

/**
 * InvitePage — 邀请码管理页面
 */
export default function InvitePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (user) fetchCodes();
  }, [user]);

  async function fetchCodes() {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/invite/my-codes', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setCodes(json.codes || []);
      }
    } catch (err) {
      console.error('Failed to fetch invite codes:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/invite/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) {
        showToast('邀请码生成成功', 'success');
        fetchCodes();
      } else {
        showToast(json.error || '生成失败', 'error');
      }
    } catch (err) {
      showToast('生成失败', 'error');
    } finally {
      setGenerating(false);
    }
  }

  function copyCode(code) {
    navigator.clipboard.writeText(code).then(() => {
      showToast('已复制到剪贴板', 'success');
    }).catch(() => {
      showToast('复制失败，请手动复制', 'error');
    });
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  const activeCodes = codes.filter(c => !c.used && !c.expired);
  const usedCodes = codes.filter(c => c.used);
  const expiredCodes = codes.filter(c => c.expired && !c.used);

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '20px',
      minHeight: '100vh',
      background: 'var(--bg)',
    }}>
      {/* 标题 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
      }}>
        <h1 style={{
          fontSize: '20px',
          fontWeight: '700',
          color: 'var(--text)',
          margin: 0,
        }}>
          我的邀请码
        </h1>
        <button
          onClick={handleGenerate}
          disabled={generating || activeCodes.length >= 10}
          style={{
            padding: '8px 16px',
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: generating || activeCodes.length >= 10 ? 'default' : 'pointer',
            opacity: generating || activeCodes.length >= 10 ? 0.5 : 1,
          }}
        >
          {generating ? '生成中...' : '生成新邀请码'}
        </button>
      </div>

      {/* 说明 */}
      <div style={{
        padding: '16px',
        background: '#3B82F615',
        border: '1px solid #3B82F625',
        borderRadius: '12px',
        marginBottom: '20px',
        fontSize: '13px',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
      }}>
        <div>📌 邀请码使用规则：</div>
        <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
          <li>每码限用 1 次，90 天有效期</li>
          <li>每用户最多同时拥有 10 个有效邀请码</li>
          <li>邀请注册成功：你获得 +50 经验 +20 积分</li>
          <li>被邀请人注册：获得 +10 经验</li>
          <li>被邀请人首次评价：获得 +50 积分</li>
        </ul>
      </div>

      {/* 邀请码列表 */}
      <div style={{
        background: 'var(--card-bg, #f5f5f5)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px',
          borderBottom: '1px solid var(--border)',
          fontSize: '14px',
          fontWeight: '600',
          color: 'var(--text)',
        }}>
          邀请码列表
        </div>

        {loading ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            加载中...
          </div>
        ) : codes.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎟️</div>
            暂无邀请码，点击上方按钮生成
          </div>
        ) : (
          <div>
            {codes.map((code, index) => (
              <div
                key={code.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: index < codes.length - 1 ? '1px solid var(--border)' : 'none',
                  opacity: code.used || code.expired ? 0.6 : 1,
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: code.used
                    ? '#9CA3AF20'
                    : code.expired
                      ? '#EF444420'
                      : '#10B98120',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  marginRight: '12px',
                }}>
                  {code.used ? '✅' : code.expired ? '⏰' : '🎟️'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: 'monospace',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'var(--text)',
                    letterSpacing: '1px',
                  }}>
                    {code.code}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    marginTop: '4px',
                  }}>
                    {code.used
                      ? `已被 ${code.used_by} 使用`
                      : code.expired
                        ? '已过期'
                        : `有效期至 ${new Date(code.expires_at).toLocaleDateString('zh-CN')}`}
                  </div>
                </div>
                {!code.used && !code.expired && (
                  <button
                    onClick={() => copyCode(code.code)}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--primary)15',
                      color: 'var(--primary)',
                      border: '1px solid var(--primary)30',
                      borderRadius: '8px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    复制
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
