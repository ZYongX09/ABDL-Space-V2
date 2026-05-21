import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { DiaperImage } from '../components/DiaperImage';
import MobileHeader from '../components/MobileHeader';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import { diapersAPI } from '../api';
import { useToast } from '../contexts/ToastContext';

export default function Home() {
  const [diapers, setDiapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [brands, setBrands] = useState([]);
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
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [search, brand, sort]);

  return (
    <>
    <MobileHeader title="纸尿裤" />
    <PageLayout hero={{ icon: 'fa-baby', title: '纸尿裤列表', subtitle: '发现最适合你的纸尿裤' }}>
      {/* 搜索筛选 */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          className="form-control flex-1 min-w-[180px]"
          placeholder="搜索品牌或型号..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-control w-auto" value={brand} onChange={e => setBrand(e.target.value)}>
          <option value="">全部品牌</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className="form-control w-auto" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="id">默认排序</option>
          <option value="avg_score">评分最高</option>
          <option value="rating_count">评价最多</option>
        </select>
        <Link to="/compare" className="btn btn-outline">
          <i className="fa-solid fa-scale-balanced" /> 对比
        </Link>
        <Link to="/rankings" className="btn btn-outline md:hidden">
          <i className="fa-solid fa-trophy" /> 排行
        </Link>
      </div>

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
              className="card stagger-item block hover:shadow-hover transition-all overflow-hidden"
              style={{ textDecoration: 'none', color: 'var(--text)', breakInside: 'avoid', marginBottom: '16px', display: 'block' }}
            >
              {(d.images?.length > 0 || d.image || d.image_url) && (
                <DiaperImage
                  src={d.images?.[0] || d.image || d.image_url}
                  alt={`${d.brand} ${d.model}`}
                  maxHeight={160}
                  onError={e => { e.target.parentElement.style.display = 'none'; }}
                />
              )}
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--primary-dark)' }}>
                {d.brand}
              </div>
              <div className="text-lg font-bold mb-2">{d.model}</div>
              <div className="flex flex-wrap gap-2 text-sm" style={{ color: 'var(--text-light)' }}>
                {d.product_type && <span className="tag">{d.product_type}</span>}
                {d.thickness && <span className="tag">厚度 {d.thickness}mm</span>}
              </div>
              <div className="flex items-center gap-3 mt-3 text-sm">
                {d.avg_score > 0 && (
                  <span className="flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                    <i className="fa-solid fa-star" /> {d.avg_score}
                  </span>
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
