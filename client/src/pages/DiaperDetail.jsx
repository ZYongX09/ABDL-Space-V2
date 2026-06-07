import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { Spinner } from '../components/Feedback';
import ImageGrid from '../components/ImageGrid';
import { useVerifyModal } from '../components/VerifyModal';
import { diapersAPI, ratingsAPI, diaperWikiAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';

const DIMENSIONS = [
  { key: 'absorption_score', label: '吸收性', icon: 'fa-droplet' },
  { key: 'comfort_score', label: '舒适度', icon: 'fa-couch' },
  { key: 'thickness_score', label: '厚度', icon: 'fa-layer-group' },
  { key: 'appearance_score', label: '外观', icon: 'fa-palette' },
  { key: 'value_score', label: '性价比', icon: 'fa-coins' },
];

function StarRating({ value, onChange, max = 10 }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onChange(i + 1)}
          className="text-xl transition-transform hover:scale-125"
          style={{ color: i < value ? 'var(--warning)' : '#DDD', background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
        >
          <i className="fa-solid fa-star" />
        </button>
      ))}
    </div>
  );
}

export default function DiaperDetail() {
  const { id } = useParams();
  const [diaper, setDiaper] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [wikiProduct, setWikiProduct] = useState(null);
  const [brandLogoError, setBrandLogoError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const [scores, setScores] = useState({});
  const [reviewText, setReviewText] = useState('');
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const toast = useToast();
  const { trigger, VerifyModal, captchaToken } = useVerifyModal();
  const navigate = useNavigate();
  const isLoggedIn = !!user;

  useEffect(() => {
    if (!/^\d+$/.test(String(id))) { setLoading(false); return; }
    (async () => {
      try {
        const [dData, rData] = await Promise.all([
          diapersAPI.get(id),
          ratingsAPI.getForDiaper(id),
        ]);
        setDiaper(dData.diaper);
        setReviews(rData.reviews || []);

        // 查找匹配的 wiki 词条
        try {
          const diaper = dData.diaper;
          if (diaper) {
            const slugMap = {
              'Little Kings': 'little-kings',
              'PeekABU': 'peekabu',
              'Simple Ultra': 'simple-ultra',
              'Simple Daytime': 'simple-daytime',
              'LittlePawz': 'littlepawz',
              'DinoRawrZ': 'dinorawrz',
              'Bunny Hopps 梦幻小粉兔': 'bunnyhopps-4-tape',
              'AlphaGatorZ': 'alphagatorz',
              'Oops All Huskies': 'oops-all-huskies',
              'TinyTails': 'tinytails',
              'Super Dry Kids': 'super-dry-kids',
              'Daydreamer Adult Diapers': 'daydreamer-diapers',
              'Princess Pink Overnight Briefs': 'princess-pink-adult-diapers',
              'Safari': 'mega-safari-adult-diapers',
              'Lunar Cub': 'lunar-cub-adult-diapers',
              'Critter Caboose': 'mega-critter-caboose-adult-diapers',
              'Dinosaur': 'mega-dinosaur-adult-diapers',
              'Bunny Boo': 'bunnyboo-adult-diapers',
              'Alpaca': 'rearz-alpaca-overnight-diapers',
              'Lil Squirts Splash': 'lil-squirts-adult-diapers-splash',
              'Inspire+': 'mega-inspire-adult-diapers',
            };
            // 尝试多种匹配
            const matchedSlug = slugMap[diaper.model]
              || Object.entries(slugMap).find(([k]) => diaper.model?.includes(k))?.[1]
              || diaper.model?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (matchedSlug) {
              // 尝试两种品牌
              for (const brand of ['ABU', 'REARZ']) {
                const wRes = await diaperWikiAPI.getByBrandSlug(brand, matchedSlug);
                if (wRes.product) {
                  setWikiProduct(wRes.product);
                  break;
                }
              }
              // 埋点：匹配失败时方便后续追踪
              if (!wikiProduct) {
                console.info('[wiki-match] no match', { model: diaper.model, matchedSlug });
              }
            }
          }
        } catch (e) {
          console.warn('[wiki-match] error', e);
        }
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const [submitting, setSubmitting] = useState(false);

  const doSubmitRating = async () => {
    if (submitting) return;
    const hasScore = Object.values(scores).some(v => v > 0);
    if (!hasScore) { toast.error('请至少选择一项评分'); return; }
    setSubmitting(true);
    try {
      await ratingsAPI.create({ diaper_id: Number(id), ...scores, review: reviewText || undefined, captchaToken: captchaToken.current });
      toast.success('评分成功');
      setShowRating(false);
      setScores({});
      setReviewText('');
      const rData = await ratingsAPI.getForDiaper(id);
      setReviews(rData.reviews || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRating = () => {
    trigger(doSubmitRating);
  };

  if (loading) return <Spinner />;
  if (!diaper) return <div className="empty-state"><h3>纸尿裤不存在</h3></div>;

  return (
    <PageLayout hero={{ icon: 'fa-baby', title: `${diaper.brand} ${diaper.model}` }}>
      {/* 产品图片 + 信息卡片 */}
      <div className="card mb-5">
        {/* 产品图片（有则显示） */}
        {diaper.images?.length > 0 && (
          <div className="mb-4">
            <ImageGrid images={diaper.images} />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text)' }}>产品信息</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between items-center"><dt style={{ color: 'var(--text-light)' }}>品牌</dt>
                <dd className="flex items-center gap-2">
                  {diaper.brand_logo && !brandLogoError ? (
                    <div className="h-8 rounded-lg overflow-hidden flex items-center" style={{ padding: '3px 8px' }}>
                      <img
                        src={diaper.brand_logo}
                        alt={diaper.brand}
                        className="h-full object-contain"
                        style={{ maxWidth: 100, filter: (isDark ? diaper.brand_invert_dark : diaper.brand_invert_light) ? 'invert(1)' : 'none' }}
                        onError={() => setBrandLogoError(true)}
                      />
                    </div>
                  ) : (
                    <span className="font-semibold">{diaper.brand}</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between"><dt style={{ color: 'var(--text-light)' }}>型号</dt><dd className="font-semibold">{diaper.model}</dd></div>
              {diaper.product_type && <div className="flex justify-between"><dt style={{ color: 'var(--text-light)' }}>类型</dt><dd>{diaper.product_type}</dd></div>}
              {diaper.thickness && <div className="flex justify-between"><dt style={{ color: 'var(--text-light)' }}>厚度</dt><dd>{diaper.thickness}mm</dd></div>}
              {diaper.absorbency_adult && <div className="flex justify-between"><dt style={{ color: 'var(--text-light)' }}>成人实际吸收</dt><dd>{diaper.absorbency_adult}</dd></div>}
              {diaper.absorbency_mfr && <div className="flex justify-between"><dt style={{ color: 'var(--text-light)' }}>厂家标称吸收</dt><dd>{diaper.absorbency_mfr}</dd></div>}
              {diaper.avg_price && <div className="flex justify-between"><dt style={{ color: 'var(--text-light)' }}>参考价</dt><dd>{diaper.avg_price}</dd></div>}
              {diaper.official_url && (
                <div className="flex justify-between items-center">
                  <dt style={{ color: 'var(--text-light)' }}>官网</dt>
                  <a href={diaper.official_url} target="_blank" rel="noopener noreferrer"
                    className="btn btn-outline btn-sm miui-press"
                    style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square mr-1" />访问官网
                  </a>
                </div>
              )}
            </dl>
          </div>

          {/* 尺码信息 */}
          {diaper.sizes && diaper.sizes.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--text)' }}>尺码</h3>
              <div className="space-y-2">
                {diaper.sizes.map(s => (
                  <div key={s.label} className="flex items-center gap-3 text-sm p-2 rounded-lg" style={{ background: 'var(--input-bg)' }}>
                    <span className="font-bold w-10">{s.label}</span>
                    <span style={{ color: 'var(--text-light)' }}>
                      腰围 {s.waist_min}-{s.waist_max}cm · 臀围 {s.hip_min}-{s.hip_max}cm
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 评分按钮 */}
      <div className="flex gap-3 mb-5">
        {user ? (
          <button className="btn btn-primary miui-press" onClick={() => {
            if (showRating && Object.values(scores).some(v => v > 0) && !confirm('已选评分将丢失，确定取消吗？')) return;
            setShowRating(!showRating);
          }}>
            <i className="fa-solid fa-star" /> {showRating ? '取消评分' : '写评分'}
          </button>
        ) : (
          <Link to="/login" className="btn btn-outline miui-press">登录后评分</Link>
        )}
        <Link to={`/compare?add=${id}`} className="btn btn-outline miui-press">
          <i className="fa-solid fa-scale-balanced" /> 加入对比
        </Link>
        {wikiProduct && (
          <Link to={`/diaper-wiki/${wikiProduct.id}`} className="btn btn-outline miui-press"
            style={{ background: 'var(--primary-light)', borderColor: 'var(--primary)', color: 'var(--primary)' }}>
            <i className="fa-solid fa-book-open" /> 裤裤百科
          </Link>
        )}
      </div>

      {/* 评分表单 */}
      {showRating && (
        <div className="card mb-5">
          <h3 className="font-bold mb-2" style={{ color: 'var(--text)' }}>评分（1-10 星）</h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-chart-line mr-1" />综合评分经贝叶斯平均与置信区间修正，评分数越多越接近真实水平
          </p>
          <div className="space-y-4">
            {DIMENSIONS.map(dim => (
              <div key={dim.key}>
                <div className="flex items-center gap-2 mb-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <i className={`fa-solid ${dim.icon} w-5 text-center`} style={{ color: 'var(--primary-dark)' }} />
                  {dim.label}
                  {scores[dim.key] && <span className="ml-auto" style={{ color: 'var(--warning)' }}>{scores[dim.key]}/10</span>}
                </div>
                <StarRating value={scores[dim.key] || 0} onChange={v => setScores(prev => ({ ...prev, [dim.key]: v }))} />
              </div>
            ))}
          </div>
          <textarea
            className="form-control mt-4 mb-3"
            placeholder="写点使用感受（可选）..."
            value={reviewText}
            onChange={e => setReviewText(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <button className="btn btn-primary btn-sm miui-press" onClick={handleSubmitRating}>提交评分</button>
          </div>
        </div>
      )}

      {/* 评价列表 */}
      {!isLoggedIn && (
        <div
          className="card mb-4"
          style={{
            padding: '1.25rem',
            textAlign: 'center',
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
          <i className="fa-solid fa-lock" style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '0.5rem', display: 'block' }} />
          <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>为确保数据安全</div>
          <div style={{ color: 'var(--text-light)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            登录后查看用户评分与评价详情
          </div>
          <button
            className="btn btn-primary btn-sm miui-press"
            onClick={() => navigate('/login')}
          >
            <i className="fa-solid fa-right-to-bracket mr-2" />
            登录 / 注册
          </button>
        </div>
      )}

      <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
        用户评价{isLoggedIn ? ` (${reviews.length})` : ''}
      </h3>
      {reviews.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>暂无评价</p>
      ) : (
        <div className="space-y-3" style={!isLoggedIn ? { filter: 'blur(6px)', userSelect: 'none', pointerEvents: 'none' } : {}}>
          {reviews.map(r => (
            <div key={r.id} className="card" style={{ padding: '1rem' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-sm">{isLoggedIn ? (r.user?.username || r.username || '匿名') : 'xxxx'}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{isLoggedIn ? new Date(r.created_at + 'Z').toLocaleDateString('zh-CN') : 'xxxx-xx-xx'}</span>
              </div>
              {r.review && <p className="text-sm mb-2">{isLoggedIn ? r.review : 'xxxxxxxxxxxxxxxx'}</p>}
              <div className="flex flex-wrap gap-2">
                {DIMENSIONS.map(dim => r[dim.key] != null && (
                  <span key={dim.key} className="tag">
                    <i className={`fa-solid ${dim.icon} mr-1`} />{dim.label} {isLoggedIn ? `${r[dim.key]}/10` : 'x/10'}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    {VerifyModal}
    </PageLayout>
  );
}
