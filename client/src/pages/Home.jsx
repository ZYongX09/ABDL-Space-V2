import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import { diapersAPI } from '../api';
import { useToast } from '../contexts/ToastContext';
import { useTheme } from '../contexts/ThemeContext';

import BaseScoreRef from '../components/BaseScoreRef';

export default function Home() {
  const [diapers, setDiapers] = useState([]);
  const [baseScores, setBaseScores] = useState({ adult: 0, baby: 0 });
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const shouldInvert = (d) => isDark ? d.brand_invert_dark : d.brand_invert_light;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [brands, setBrands] = useState([]);
  const [failedLogos, setFailedLogos] = useState(new Set());
  const [sort, setSort] = useState('id');
  const toast = useToast();

  useEffect(() => {
    diapersAPI.brands().then(d => setBrands(d.brands || [])).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await diapersAPI.list({ search: search || undefined, brand: brand || undefined, sort });
        setDiapers(data.diapers || []);
        setBaseScores(data.base_scores || { adult: 0, baby: 0 });
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [search, brand, sort]);

  return (
    <>
    <PageLayout hero={{ icon: 'fa-baby', title: '纸尿裤列表', subtitle: '发现最适合你的纸尿裤' }}>
      {/* 搜索筛选 */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="flex-1 min-w-[180px] miui-input-group">
          <input
            className="form-control"
            placeholder="搜索品牌或型号..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="form-control w-auto" value={brand} onChange={e => setBrand(e.target.value)}>
          <option value="">全部品牌</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="form-control w-auto" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="id">默认排序</option>
          <option value="avg_score">评分最高</option>
          <option value="rating_count">评价最多</option>
        </select>
        <Link to="/compare" className="btn btn-outline miui-press">
          <i className="fa-solid fa-scale-balanced" /> 对比
        </Link>
        <Link to="/rankings" className="btn btn-outline md:hidden miui-press">
          <i className="fa-solid fa-trophy" /> 排行
        </Link>
      </div>

      {/* 基准分参考 */}
      {baseScores.adult > 0 && (
        <BaseScoreRef adultScore={baseScores.adult} babyScore={baseScores.baby} />
      )}

      {/* 列表 */}
      {loading ? (
        <LoadingSkeleton count={6} height={140} />
      ) : diapers.length === 0 ? (
        <EmptyState icon="fa-baby" title="暂无纸尿裤" description="试试其他搜索条件" />
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
          {diapers.map((d, i) => (
            <Link
              key={d.id}
              to={`/diaper/${d.id}`}
              className="card card-interactive miui-hover-lift block hover:shadow-hover transition-all overflow-hidden"
              style={{ textDecoration: 'none', color: 'var(--text)', breakInside: 'avoid', marginBottom: '16px', display: 'block' }}
            >
              {(d.images?.length > 0 || d.image || d.image_url) && (
                <div className="mb-3 -mx-8 -mt-8 overflow-hidden" style={{ aspectRatio: '1 / 1' }}>
                  <img
                    src={d.images?.[0] || d.image || d.image_url}
                    alt={`${d.brand} ${d.model}`}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: 'center' }}
                    onError={e => { e.target.parentElement.style.display = 'none'; }}
                  />
                </div>
              )}
              <div className="flex items-center gap-2 mb-1">
                {d.brand_logo && !failedLogos.has(d.brand) ? (
                  <div className="h-7 rounded overflow-hidden flex items-center" style={{ padding: '2px 6px' }}>
                    <img
                      src={d.brand_logo}
                      alt={d.brand}
                      className="h-full object-contain"
                      style={{ maxWidth: 80, filter: shouldInvert(d) ? 'invert(1)' : 'none' }}
                      onError={() => setFailedLogos(prev => new Set(prev).add(d.brand))}
                    />
                  </div>
                ) : (
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--primary-dark)' }}>{d.brand}</span>
                )}
              </div>
              <div className="text-lg font-bold mb-2">{d.model}</div>
              <div className="flex flex-wrap gap-2 text-sm" style={{ color: 'var(--text-light)' }}>
                {d.product_type && <span className="tag">{d.product_type}</span>}
                {d.is_baby_diaper === 1 && <span className="tag" style={{ background: 'rgba(255,143,171,0.12)', color: '#d87a95', borderColor: 'rgba(255,143,171,0.3)' }}>儿童款</span>}
                {d.thickness && <span className="tag">厚度 {d.thickness}mm</span>}
              </div>
              <div className="flex items-center gap-3 mt-3 text-sm">
                {d.avg_score > 0 ? (
                  <span className="flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                    <i className="fa-solid fa-star" /> {d.avg_score}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>暂无评分</span>
                )}
                {d.rating_count > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>{d.rating_count} 评价</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageLayout>
    </>
  );
}
