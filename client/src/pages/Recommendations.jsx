import { useState, useRef } from 'react';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import { useVerifyModal } from '../components/VerifyModal';
import { recommendAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { Link } from 'react-router-dom';

const RATE_LIMIT_MS = 30000; // 30秒内再次调用需验证

const DATA_OPTIONS = [
  { key: 'basic', label: '基本信息', desc: '年龄、地区', icon: 'fa-circle-user' },
  { key: 'body', label: '身材数据', desc: '体重、腰围、臀围', icon: 'fa-ruler' },
  { key: 'prefs', label: '风格偏好', desc: '你喜欢的款式风格', icon: 'fa-heart' },
  { key: 'bio', label: '个人简介', desc: '你的自我介绍', icon: 'fa-id-card' },
  { key: 'feelings', label: '使用感受', desc: '你提交过的感受记录', icon: 'fa-comments' },
];

export default function Recommendations() {
  const [recommendations, setRecommendations] = useState([]);
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [consented, setConsented] = useState(false);
  const [selected, setSelected] = useState({ basic: true, body: true, prefs: true, bio: false, feelings: true });
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal } = useVerifyModal();
  const lastRecommendTime = useRef(0);

  const toggle = (key) => setSelected(s => ({ ...s, [key]: !s[key] }));
  const selectedCount = Object.values(selected).filter(Boolean).length;

  const doRecommend = async () => {
    setLoading(true);
    setRecommendations([]);
    setSummary('');
    try {
      const data = await recommendAPI.getRecommend(selected);
      setRecommendations(data.recommendations || []);
      setSummary(data.summary || '');
      lastRecommendTime.current = Date.now();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecommend = () => {
    if (!user) { toast.error('请先登录'); return; }
    if (!consented) { toast.error('请先阅读并同意隐私说明'); return; }
    if (selectedCount === 0) { toast.error('请至少选择一项数据'); return; }
    // 短时间内再次调用需验证
    if (Date.now() - lastRecommendTime.current < RATE_LIMIT_MS) {
      trigger(doRecommend);
      return;
    }
    doRecommend();
  };

  return (
    <>
    <MobileHeader title="AI 推荐" />
    <PageLayout hero={{ icon: 'fa-wand-magic-sparkles', title: 'AI 智能推荐', subtitle: '让 AI 帮你找到最合适的纸尿裤' }}>
      {/* 个性化推荐 */}
      {user ? (
        <div className="card mb-5">
          <h3 className="font-bold mb-2" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-bolt mr-2" style={{ color: 'var(--warning)' }} />
            个性化推荐
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-light)' }}>
            根据你的个人数据，AI 为你量身推荐最合适的纸尿裤
          </p>

          {/* 数据选择 */}
          <div className="mb-4">
            <h4 className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>选择要使用的数据</h4>
            <div className="space-y-2">
              {DATA_OPTIONS.map(opt => (
                <label
                  key={opt.key}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                  style={{
                    background: selected[opt.key] ? 'var(--primary-light)' : 'var(--input-bg)',
                    border: `1.5px solid ${selected[opt.key] ? 'var(--primary)' : 'var(--border)'}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected[opt.key]}
                    onChange={() => toggle(opt.key)}
                    className="w-4 h-4 rounded cursor-pointer accent-[var(--primary-dark)]"
                  />
                  <i className={`fa-solid ${opt.icon} w-5 text-center text-sm`} style={{ color: selected[opt.key] ? 'var(--primary-dark)' : 'var(--text-muted)' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{opt.label}</div>
                    <div className="text-xs" style={{ color: 'var(--text-light)' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              <Link to="/profile" style={{ color: 'var(--link-color)' }}>去完善资料</Link> 以获得更精准的推荐
            </p>
          </div>

          {/* 隐私说明 */}
          <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--warning-bg, #FFF8E1)', border: '1px solid var(--warning)' }}>
            <div className="flex items-start gap-2">
              <i className="fa-solid fa-shield-halved mt-0.5" style={{ color: 'var(--warning)' }} />
              <div className="text-sm">
                <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>数据使用说明</div>
                <ul className="space-y-1" style={{ color: 'var(--text-light)' }}>
                  <li>· 你选择的个人数据将发送至第三方AI服务（DeepSeek）用于生成推荐</li>
                  <li>· 数据仅用于本次推荐请求，本平台不会额外存储发送给AI的数据</li>
                  <li>· 你可以自由选择要分享的数据类别，未勾选的数据不会被发送</li>
                  <li>· 身体数据可在 <Link to="/profile" style={{ color: 'var(--link-color)' }}>个人中心</Link> 中随时修改或清空</li>
                  <li>· 详细信息请查阅 <Link to="/privacy" style={{ color: 'var(--link-color)' }}>隐私政策</Link> 第2.2条和第5.1条</li>
                </ul>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer accent-[var(--primary-dark)]" />
                  <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>我已知晓上述说明，并同意将所选数据发送至DeepSeek AI进行推荐处理</span>
                </label>
              </div>
            </div>
          </div>

          <button className="btn btn-primary miui-press" onClick={handleRecommend} disabled={loading || !consented || selectedCount === 0}>
            {loading ? (
              <><span className="spinner mr-2" style={{ width: 16, height: 16, borderWidth: 2 }} />分析中...</>
            ) : (
              <><i className="fa-solid fa-wand-magic-sparkles" /> 获取推荐</>
            )}
          </button>
        </div>
      ) : (
        <div className="card mb-5">
          <div className="text-center py-4">
            <i className="fa-solid fa-right-to-bracket text-2xl mb-2" style={{ color: 'var(--primary-dark)' }} />
            <p className="text-sm" style={{ color: 'var(--text-light)' }}>登录后可获取基于个人数据的 AI 推荐</p>
            <Link to="/login" className="btn btn-primary mt-3">去登录</Link>
          </div>
        </div>
      )}

      {/* 推荐结果 */}
      {recommendations.length > 0 && (
        <div className="space-y-3 mb-5">
          <h3 className="font-bold" style={{ color: 'var(--text)' }}>推荐结果</h3>
          {recommendations.map((r, i) => (
            <div key={r.diaper_id || i} className="card" style={{ padding: '1.25rem' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold" style={{ color: 'var(--text)' }}>{r.brand} {r.model}</div>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-light)' }}>{r.reason}</p>
                </div>
                {r.matchScore && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-2xl font-bold" style={{ color: 'var(--primary-dark)' }}>{r.matchScore}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>匹配度</div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {summary && (
            <div className="card" style={{ padding: '1rem', background: 'var(--primary-light)' }}>
              <p className="text-sm" style={{ color: 'var(--primary-dark)' }}>{summary}</p>
            </div>
          )}
        </div>
      )}

      {!recommendations.length && !loading && !user && (
        <div className="empty-state">
          <div className="icon"><i className="fa-solid fa-robot" /></div>
          <h3>获取 AI 推荐</h3>
          <p>登录后获取个性化推荐</p>
        </div>
      )}
    {VerifyModal}
    </PageLayout>
    </>
  );
}
