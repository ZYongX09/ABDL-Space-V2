import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { Spinner } from '../components/Feedback';
import { useVerifyModal } from '../components/VerifyModal';
import { diapersAPI, ratingsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const DIMENSIONS = [
  { key: 'absorption_score', label: '吸收性', icon: 'fa-droplet' },
  { key: 'fit_score', label: '贴合度', icon: 'fa-shirt' },
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
  const [brandLogoError, setBrandLogoError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const [scores, setScores] = useState({});
  const [reviewText, setReviewText] = useState('');
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal } = useVerifyModal();

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
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const doSubmitRating = async () => {
    try {
      await ratingsAPI.create({ diaper_id: Number(id), ...scores, review: reviewText || undefined });
      toast.success('评分成功');
      setShowRating(false);
      setScores({});
      setReviewText('');
      const rData = await ratingsAPI.getForDiaper(id);
      setReviews(rData.reviews || []);
    } catch (e) {
      toast.error(e.message);
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
          <div className="mb-4 rounded-xl overflow-hidden">
            {diaper.images.length === 1 ? (
              <img
                src={diaper.images[0]}
                alt={`${diaper.brand} ${diaper.model}`}
                className="w-full h-auto object-contain"
                style={{ maxHeight: 300, background: 'var(--input-bg)' }}
                onError={e => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {diaper.images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt=""
                    className="h-48 object-cover rounded-lg flex-shrink-0"
                    style={{ background: 'var(--input-bg)' }}
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                ))}
              </div>
            )}
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
                        style={{ maxWidth: 100 }}
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
          <button className="btn btn-primary miui-press" onClick={() => setShowRating(!showRating)}>
            <i className="fa-solid fa-star" /> {showRating ? '取消评分' : '写评分'}
          </button>
        ) : (
          <Link to="/login" className="btn btn-outline miui-press">登录后评分</Link>
        )}
        <Link to="/compare" className="btn btn-outline miui-press">
          <i className="fa-solid fa-scale-balanced" /> 加入对比
        </Link>
      </div>

      {/* 评分表单 */}
      {showRating && (
        <div className="card mb-5">
          <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>评分（1-10 星）</h3>
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
      <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
        用户评价 ({reviews.length})
      </h3>
      {reviews.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>暂无评价</p>
      ) : (
        <div className="space-y-3">
          {reviews.map(r => (
            <div key={r.id} className="card" style={{ padding: '1rem' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-sm">{r.username || '匿名'}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleDateString('zh-CN')}</span>
              </div>
              {r.review && <p className="text-sm mb-2">{r.review}</p>}
              <div className="flex flex-wrap gap-2">
                {DIMENSIONS.map(dim => r[dim.key] != null && (
                  <span key={dim.key} className="tag">
                    <i className={`fa-solid ${dim.icon} mr-1`} />{dim.label} {r[dim.key]}/10
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
