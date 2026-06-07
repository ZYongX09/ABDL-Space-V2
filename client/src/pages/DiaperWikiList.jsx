import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { Spinner } from '../components/Feedback';
import { diaperWikiAPI } from '../api';
import { useToast } from '../contexts/ToastContext';

export default function DiaperWikiList() {
  const [products, setProducts] = useState([]);
  const [brands, setBrands] = useState({});
  const [meta, setMeta] = useState(null);
  const [cn, setCn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [listRes, brandsRes, metaRes, cnRes] = await Promise.all([
          diaperWikiAPI.list(),
          diaperWikiAPI.brands(),
          diaperWikiAPI.meta(),
          diaperWikiAPI.cn(),
        ]);
        if (cancelled) return;
        setProducts(listRes.products || []);
        setBrands(brandsRes);
        setMeta(metaRes);
        setCn(cnRes);
      } catch (e) {
        if (!cancelled) toast.error(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    let list = products;
    if (brandFilter !== 'ALL') list = list.filter(p => p.brand === brandFilter);
    if (categoryFilter !== 'ALL') {
      // 直接用 type 字段作为权威分类（v2.23.0 已补全所有产品 type）
      // 纸尿裤类: diaper / underwear / booster
      // 配件类: sample-case / accessory
      list = list.filter(p => {
        const t = (p.type || p.category || '').toLowerCase();
        if (categoryFilter === 'diaper') {
          return ['diaper', 'underwear', 'booster'].includes(t);
        } else {
          return ['sample-case', 'accessory'].includes(t);
        }
      });
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(s) ||
        (p.model || '').toLowerCase().includes(s) ||
        (p.category || '').toLowerCase().includes(s)
      );
    }
    return list;
  }, [products, brandFilter, categoryFilter, search]);

  const grouped = useMemo(() => {
    const g = {};
    for (const p of filtered) {
      const key = p.brand;
      if (!g[key]) g[key] = [];
      g[key].push(p);
    }
    return g;
  }, [filtered]);

  return (
    <PageLayout
      hero={{
        icon: 'fa-book-open',
        title: '裤裤百科',
        subtitle: meta ? `${meta.total_products} 款商品 · ${meta.brands?.join(' · ')}` : '纸尿裤 / 失禁裤 知识库',
        extra: (
          <div className="text-xs mt-2 flex items-center gap-2 justify-center" style={{ color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-circle-info" />
            <span>数据来源：{meta?.brands?.map(b => b === 'ABU' ? 'ABUniverse AU' : 'Rearz Inc.').join(' + ')} · {meta?.generated_at?.split('T')[0]}</span>
          </div>
        ),
      }}
    >
      {loading ? (
        <Spinner />
      ) : (
        <>
          {/* 品牌介绍卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {Object.entries(brands).map(([key, brand]) => (
              <div key={key} className="card" style={{ padding: '1rem 1.25rem' }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl font-bold" style={{ color: 'var(--text)' }}>{brand.full_name || brand.name}</span>
                  {brand.origin && <span className="tag" style={{ fontSize: '0.7rem' }}>{brand.origin}</span>}
                </div>
                {cn?.brands?.[key]?.tagline && (
                  <p className="text-xs mb-2" style={{ color: 'var(--primary)' }}>
                    <i className="fa-solid fa-quote-left mr-1" />
                    {cn.brands[key].tagline}
                  </p>
                )}
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-light)', lineHeight: 1.6 }}>
                  {brand.description}
                </p>
                <a href={brand.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs mt-2 inline-block" style={{ color: 'var(--primary)' }}>
                  <i className="fa-solid fa-arrow-up-right-from-square mr-1" />访问官网
                </a>
              </div>
            ))}
          </div>

          {/* 搜索 + 过滤 */}
          <div className="mb-5 space-y-3">
            <div className="relative">
              <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }} />
              <input
                className="form-control pl-10"
                placeholder="搜索商品..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: '2.5rem' }}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                { key: 'ALL', label: '全部' },
                ...Object.keys(brands).map(b => ({ key: b, label: b })),
              ].map(f => (
                <button key={f.key} onClick={() => setBrandFilter(f.key)}
                  className={`tag miui-press transition-all ${brandFilter === f.key ? 'shadow-md' : ''}`}
                  style={{
                    background: brandFilter === f.key ? 'var(--primary)' : 'var(--input-bg)',
                    color: brandFilter === f.key ? '#fff' : 'var(--text)',
                    cursor: 'pointer',
                    border: 'none',
                    padding: '0.4rem 0.9rem',
                    fontSize: '0.8rem',
                  }}>
                  {f.label}
                </button>
              ))}
              <span className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />
              {[
                { key: 'ALL', label: '全部类型' },
                { key: 'diaper', label: '纸尿裤' },
                { key: 'accessory', label: '配件' },
              ].map(f => (
                <button key={f.key} onClick={() => setCategoryFilter(f.key)}
                  className={`tag miui-press transition-all ${categoryFilter === f.key ? 'shadow-md' : ''}`}
                  style={{
                    background: categoryFilter === f.key ? 'var(--primary)' : 'var(--input-bg)',
                    color: categoryFilter === f.key ? '#fff' : 'var(--text)',
                    cursor: 'pointer',
                    border: 'none',
                    padding: '0.4rem 0.9rem',
                    fontSize: '0.8rem',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              共 {filtered.length} 款
            </div>
          </div>

          {/* 按品牌分组 */}
          {Object.entries(grouped).map(([brandKey, items]) => (
            <div key={brandKey} className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg font-bold" style={{ color: 'var(--text)' }}>{brandKey}</span>
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>· {items.length} 款</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {items.map(p => (
                  <Link key={p.id} to={`/diaper-wiki/${p.id}`}
                    className="card card-interactive miui-press overflow-hidden"
                    style={{ padding: 0, textDecoration: 'none', color: 'inherit' }}>
                    {/* 封面图 */}
                    <div style={{ aspectRatio: '1/1', background: 'var(--bg-card-soft)', overflow: 'hidden' }}>
                      {p.raw_images?.[0] ? (
                        <img src={p.raw_images[0]} alt={p.name} className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => { e.currentTarget.style.opacity = '0.3'; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                          <i className="fa-solid fa-image text-2xl" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="font-semibold text-sm mb-1 line-clamp-2" style={{ color: 'var(--text)' }}>{p.name}</div>
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {p.rating && (
                          <span><i className="fa-solid fa-star mr-0.5" style={{ color: 'var(--warning)' }} />{p.rating.value}</span>
                        )}
                        {p.size_chart_image && <span><i className="fa-solid fa-ruler mr-0.5" />尺码图</span>}
                        <span className="ml-auto"><i className="fa-solid fa-images mr-0.5" />{p.raw_images?.length || 0}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="empty-state">
              <i className="fa-solid fa-box-open" style={{ fontSize: '2.5rem', opacity: 0.3 }} />
              <p className="mt-3">没有匹配的商品</p>
            </div>
          )}

          {/* 底部说明 */}
          <div className="mt-6 card" style={{ background: 'var(--bg-card-soft)', padding: '1rem 1.25rem' }}>
            <div className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-light)' }}>
              <i className="fa-solid fa-circle-info mt-0.5" style={{ color: 'var(--primary)' }} />
              <div className="leading-relaxed">
                <p>本页面商品信息由 ABDL Space 团队爬取自品牌官网（截至 2026-06），仅供学习交流。价格、规格以官方为准。</p>
                <p className="mt-1">商品图版权归 ABUniverse / Rearz Inc. 所有。</p>
              </div>
            </div>
          </div>
        </>
      )}
    </PageLayout>
  );
}
