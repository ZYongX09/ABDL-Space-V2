import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';

/**
 * InvitePage — 邀请码管理页面（参考 viewturbo 分享页风格）
 */
export default function InvitePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

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

  function copyCode(code, id) {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      showToast('已复制到剪贴板', 'success');
      setTimeout(() => setCopiedId(null), 2000);
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
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      minHeight: '100vh',
      background: 'var(--bg)',
    }}>
      {/* Hero 区域 */}
      <div style={{
        background: 'linear-gradient(135deg, var(--invite) 0%, var(--invite-soft) 100%)',
        borderRadius: '20px',
        padding: '40px 32px',
        marginBottom: '24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* 装饰元素 */}
        <div style={{
          position: 'absolute',
          top: '-20px',
          right: '-20px',
          width: '120px',
          height: '120px',
          borderRadius: '50%',
          background: 'var(--invite-softer)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-30px',
          left: '30%',
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'var(--checkin-softer)',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '16px',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '14px',
              background: 'var(--bg-card)',
              border: '1px solid var(--invite-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(10px)',
            }}>
              <i className="fa-solid fa-user-plus" style={{ fontSize: '20px', color: 'var(--invite)' }} />
            </div>
            <div>
              <h1 style={{
                fontSize: '28px',
                fontWeight: '700',
                color: 'var(--text)',
                margin: 0,
                lineHeight: 1.2,
              }}>
                邀请好友
              </h1>
              <p style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                margin: '4px 0 0',
              }}>
                分享邀请码，一起获得奖励
              </p>
            </div>
          </div>

          {/* 奖励统计 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            marginTop: '24px',
          }}>
            {[
              { label: '邀请成功', value: usedCodes.length, icon: 'fa-check-circle', color: 'var(--invite)' },
              { label: '待使用', value: activeCodes.length, icon: 'fa-clock', color: 'var(--streak)' },
              { label: '已过期', value: expiredCodes.length, icon: 'fa-hourglass-end', color: 'var(--muted-strong)' },
            ].map((stat, i) => (
              <div key={i} style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
              }}>
                <i className={`fa-solid ${stat.icon}`} style={{
                  fontSize: '18px',
                  color: stat.color,
                  marginBottom: '8px',
                  display: 'block',
                }} />
                <div style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: 'var(--text)',
                }}>
                  {stat.value}
                </div>
                <div style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 奖励规则卡片 */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px',
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'var(--primary)15',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <i className="fa-solid fa-gift" style={{ color: 'var(--primary)', fontSize: '16px' }} />
          </div>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: 'var(--text)',
            margin: 0,
          }}>
            邀请奖励
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
        }}>
          {/* 邀请人奖励 */}
          <div style={{
            background: 'linear-gradient(135deg, var(--invite-soft), var(--invite-softer))',
            border: '1px solid var(--invite-border)',
            borderRadius: '12px',
            padding: '20px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}>
              <i className="fa-solid fa-trophy" style={{ color: 'var(--invite)', fontSize: '16px' }} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--invite)' }}>
                邀请你
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-star" style={{ fontSize: '12px', color: 'var(--invite)' }} />
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>+50 经验值</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-coins" style={{ fontSize: '12px', color: 'var(--points)' }} />
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>+20 积分</span>
              </div>
            </div>
          </div>

          {/* 被邀请人奖励 */}
          <div style={{
            background: 'linear-gradient(135deg, var(--post-soft), var(--post-softer))',
            border: '1px solid var(--post-border)',
            borderRadius: '12px',
            padding: '20px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}>
              <i className="fa-solid fa-user-check" style={{ color: 'var(--post)', fontSize: '16px' }} />
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--post)' }}>
                被邀请人
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-star" style={{ fontSize: '12px', color: 'var(--post)' }} />
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>注册 +10 经验</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-coins" style={{ fontSize: '12px', color: 'var(--points)' }} />
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>首次评价 +50 积分</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 生成邀请码 */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '24px',
        marginBottom: '24px',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--primary)15',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <i className="fa-solid fa-ticket" style={{ color: 'var(--primary)', fontSize: '16px' }} />
            </div>
            <div>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: 'var(--text)',
                margin: 0,
              }}>
                我的邀请码
              </h2>
              <p style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                margin: '2px 0 0',
              }}>
                最多同时拥有 10 个有效邀请码
              </p>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={generating || activeCodes.length >= 10}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: generating || activeCodes.length >= 10
                ? 'var(--border)'
                : 'linear-gradient(135deg, var(--invite), var(--checkin))',
              color: 'var(--checkin-on)',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: generating || activeCodes.length >= 10 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: generating || activeCodes.length >= 10
                ? 'none'
                : '0 2px 8px var(--invite-border)',
            }}
          >
            <i className={`fa-solid ${generating ? 'fa-spinner fa-spin' : 'fa-plus'}`} />
            {generating ? '生成中...' : '生成新邀请码'}
          </button>
        </div>

        {/* 邀请码列表 */}
        {loading ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '24px', marginBottom: '12px', display: 'block' }} />
            加载中...
          </div>
        ) : codes.length === 0 ? (
          <div style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--bg)',
            borderRadius: '12px',
            border: '2px dashed var(--border)',
          }}>
            <i className="fa-solid fa-ticket" style={{
              fontSize: '48px',
              color: 'var(--border)',
              marginBottom: '16px',
              display: 'block',
            }} />
            <p style={{
              fontSize: '16px',
              fontWeight: '600',
              color: 'var(--text)',
              margin: '0 0 8px',
            }}>
              暂无邀请码
            </p>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: 0,
            }}>
              点击上方按钮生成你的专属邀请码
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {codes.map((code) => (
              <div
                key={code.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px',
                  background: code.used || code.expired ? 'var(--bg)' : 'var(--bg-card)',
                  border: `1px solid ${code.used || code.expired ? 'var(--border)' : 'var(--primary)30'}`,
                  borderRadius: '12px',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* 状态图标 */}
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '10px',
                  background: code.used
                    ? 'var(--muted-bg)'
                    : code.expired
                      ? 'var(--streak-soft)'
                      : 'var(--invite-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '14px',
                  flexShrink: 0,
                }}>
                  <i className={`fa-solid ${
                    code.used ? 'fa-check-circle' :
                    code.expired ? 'fa-hourglass-end' :
                    'fa-ticket'
                  }`} style={{
                    fontSize: '18px',
                    color: code.used ? 'var(--muted-strong)' : code.expired ? 'var(--streak-strong)' : 'var(--invite)',
                  }} />
                </div>

                {/* 邀请码信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "'SF Mono', 'Monaco', 'Menlo', monospace",
                    fontSize: '16px',
                    fontWeight: '700',
                    color: 'var(--text)',
                    letterSpacing: '1.5px',
                    marginBottom: '4px',
                  }}>
                    {code.code}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                  }}>
                    {code.used ? (
                      <>
                        <i className="fa-solid fa-user" style={{ fontSize: '10px' }} />
                        <span>已被 {code.used_by} 使用</span>
                      </>
                    ) : code.expired ? (
                      <>
                        <i className="fa-solid fa-clock" style={{ fontSize: '10px' }} />
                        <span>已过期</span>
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-calendar" style={{ fontSize: '10px' }} />
                        <span>有效期至 {new Date(code.expires_at).toLocaleDateString('zh-CN')}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* 操作按钮 */}
                {!code.used && !code.expired && (
                  <button
                    onClick={() => copyCode(code.code, code.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      background: copiedId === code.id ? 'var(--invite)' : 'var(--invite-soft)',
                      color: copiedId === code.id ? 'var(--checkin-on)' : 'var(--invite)',
                      border: `1px solid ${copiedId === code.id ? 'var(--invite)' : 'var(--invite-border)'}`,
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <i className={`fa-solid ${copiedId === code.id ? 'fa-check' : 'fa-copy'}`} />
                    {copiedId === code.id ? '已复制' : '复制'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 使用说明 */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        padding: '24px',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px',
        }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'var(--points-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <i className="fa-solid fa-lightbulb" style={{ color: 'var(--points)', fontSize: '16px' }} />
          </div>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: 'var(--text)',
            margin: 0,
          }}>
            使用说明
          </h2>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '16px',
        }}>
          {[
            {
              icon: 'fa-share-nodes',
              title: '分享邀请码',
              desc: '将邀请码发送给好友，邀请他们注册',
              color: 'var(--post)',
            },
            {
              icon: 'fa-user-plus',
              title: '好友注册',
              desc: '好友在注册时输入你的邀请码',
              color: 'var(--invite)',
            },
            {
              icon: 'fa-gift',
              title: '获得奖励',
              desc: '双方都能获得丰厚的经验和积分奖励',
              color: 'var(--points)',
            },
          ].map((step, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: '14px',
              padding: '16px',
              background: 'var(--bg)',
              borderRadius: '12px',
            }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--hover-bg)',
                border: `1px solid ${step.color}30`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <i className={`fa-solid ${step.icon}`} style={{ color: step.color, fontSize: '16px' }} />
              </div>
              <div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: 'var(--text)',
                  marginBottom: '4px',
                }}>
                  {step.title}
                </div>
                <div style={{
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}>
                  {step.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
