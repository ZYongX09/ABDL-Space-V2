import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { Spinner } from '../components/Feedback';
import { diaperWikiAPI } from '../api';
import { useToast } from '../contexts/ToastContext';

const SPEC_LABEL_CN = {
  'Tapes': '魔术贴数',
  'Tall Leakguards': '高立围防漏',
  'Fast Absorb Core': '快速吸收芯',
  'Backing': '背板材质',
  'Front Elastic Band': '前弹性腰围',
  'Back Elastic Band': '后弹性腰围',
  'Print Coverage': '印花区域',
  'Print Style': '印花风格',
  'Ink Layer': '油墨层',
  'Fade When Wet': '遇湿褪色',
  'Scented': '加香',
};

const SPEC_VALUE_CN = {
  // 贴式
  '4-Tape': '4 贴式',
  '2-Tape': '2 贴式',
  // 背板
  'Plastic-Backed': '塑料背板',
  'Cloth-Backed': '布感背板',
  'Cloth-Like': '布感背板', // 备用
  // 印花区域
  'Landing Zone': '定位印花区',
  'Full Print': '全身印花',
  'All Over': '全身印花',
  'No Print': '无印花',
  // 印花风格
  'Positional': '定位印花',
  'Repeating': '重复图案',
  'Solid': '纯色',
  // 油墨层位置
  'Outside': '外层',
  'Inside': '内层',
  'None': '无',
  'Transparent': '透明',
  // 其他
  'Scented': '加香',
  'Unscented': '无香',
};

function tVal(v) {
  if (v === true) return '✓ 支持';
  if (v === false) return '— 不支持';
  if (SPEC_VALUE_CN[v]) return SPEC_VALUE_CN[v];
  return v;
}

function tKey(k) {
  return SPEC_LABEL_CN[k] || k;
}

export default function DiaperWiki() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [brands, setBrands] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview'); // overview | specs | images | reviews
  const [activeImage, setActiveImage] = useState(0);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [res, brandsRes] = await Promise.all([
          diaperWikiAPI.get(id),
          diaperWikiAPI.brands(),
        ]);
        if (cancelled) return;
        if (!res.product) {
          toast.error('未找到该商品');
          return;
        }
        setProduct(res.product);
        setBrands(brandsRes);
      } catch (e) {
        if (!cancelled) toast.error(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <Spinner />;
  if (!product) return <div className="empty-state"><h3>商品不存在</h3></div>;

  const brand = brands[product.brand] || {};
  const allImages = [...(product.raw_images || [])];
  if (product.size_chart_image) {
    // size chart 加到末尾做单独展示
  }
  const hasImages = allImages.length > 0;
  const hasSpecs = product.specs && product.specs.length > 0;
  const hasSizes = product.sizes && product.sizes.length > 0;
  const hasDescription = !!(product.description_en || product.description_cn);
  const hasReviews = product.reviews && product.reviews.length > 0;
  const hasSizingTable = product.sizing_table && product.sizing_table.length > 0;

  return (
    <PageLayout
      hero={{
        icon: 'fa-book-open',
        title: `${product.brand} ${product.name}`,
        subtitle: product.rating ? `★ ${product.rating.value} · ${product.rating.count} 条评价` : null,
        extra: (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <a href={product.source_url} target="_blank" rel="noopener noreferrer"
              className="btn btn-outline btn-sm miui-press"
              style={{ padding: '4px 12px', fontSize: '0.78rem' }}>
              <i className="fa-solid fa-arrow-up-right-from-square mr-1" />
              {brands[product.brand]?.name || product.brand} 官网
            </a>
            <span className="tag" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
              <i className="fa-solid fa-tag mr-1" />{product.category || product.type || '纸尿裤'}
            </span>
          </div>
        ),
      }}
    >
      {/* 品牌信息卡片 */}
      {brand.description && (
        <div className="card mb-4" style={{ background: 'var(--bg-card-soft)', padding: '1rem 1.25rem' }}>
          <div className="flex items-start gap-3">
            <div style={{ fontSize: '1.5rem' }}>📖</div>
            <div className="text-sm" style={{ color: 'var(--text-light)', lineHeight: 1.7 }}>
              <span className="font-semibold mr-1" style={{ color: 'var(--text)' }}>{brand.full_name || brand.name}</span>
              {brand.origin && <span className="tag mr-2">{brand.origin}</span>}
              <span>{brand.description}</span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 切换 */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl" style={{ background: 'var(--input-bg)' }}>
        {[
          { key: 'overview', label: '简介', icon: 'fa-circle-info' },
          { key: 'specs', label: '规格', icon: 'fa-list-check', show: hasSpecs || hasSizes || hasSizingTable },
          { key: 'images', label: '图集', icon: 'fa-images', show: hasImages || product.size_chart_image },
          { key: 'reviews', label: `评价${product.rating ? ` (${product.rating.count})` : ''}`, icon: 'fa-comments', show: hasReviews },
        ].filter(t => t.show !== false).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium miui-press transition-all ${tab === t.key ? 'shadow-sm' : ''}`}
            style={{
              background: tab === t.key ? 'var(--bg-card)' : 'transparent',
              color: tab === t.key ? 'var(--primary)' : 'var(--text-light)',
            }}>
            <i className={`fa-solid ${t.icon} mr-1.5`} />{t.label}
          </button>
        ))}
      </div>

      {/* 简介 Tab */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* 主图 */}
          {hasImages && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ aspectRatio: '1/1', background: 'var(--bg-card-soft)', overflow: 'hidden' }}>
                <img
                  src={allImages[0]}
                  alt={product.name}
                  className="w-full h-full"
                  style={{ objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                />
              </div>
            </div>
          )}

          {/* 描述 */}
          {hasDescription && (
            <div className="card">
              <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-quote-left mr-2" style={{ color: 'var(--primary)' }} />官方介绍
              </h3>
              {product.description_cn && (
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-light)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                  {product.description_cn}
                </p>
              )}
              {product.description_en && (
                <details className="mt-3">
                  <summary className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <i className="fa-solid fa-language" />查看英文原文
                  </summary>
                  <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-muted)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                    {product.description_en}
                  </p>
                </details>
              )}
              <p className="text-xs mt-2 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-robot" />
                <span>AI 翻译 · 原文来自品牌官网</span>
              </p>
            </div>
          )}

          {/* 评分概览 */}
          {product.rating && (
            <div className="card">
              <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-star mr-2" style={{ color: 'var(--warning)' }} />用户评分
              </h3>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>
                    {product.rating.value}<span className="text-base text-gray-400">/5</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{product.rating.count} 条评价</div>
                </div>
                <div className="flex-1">
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }, (_, i) => (
                      <i key={i} className="fa-solid fa-star text-xl"
                        style={{ color: i < Math.round(Number(product.rating.value)) ? 'var(--warning)' : '#DDD' }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 价格 + 来源 */}
          <div className="card">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>参考价</div>
                <div className="font-semibold" style={{ color: 'var(--text)' }}>
                  {product.source_price_text || (product.source_price ? `$${product.source_price} ${product.source_currency || ''}` : '—')}
                </div>
              </div>
              <div>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>来源</div>
                <a href={product.source_url} target="_blank" rel="noopener noreferrer"
                  className="font-semibold" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                  {product.brand === 'ABU' ? 'ABUniverse AU' : 'Rearz Inc.'} <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 规格 Tab */}
      {tab === 'specs' && (
        <div className="space-y-4">
          {/* 详细规格表 (ABU 风格) */}
          {hasSpecs && (
            <div className="card">
              <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-list-check mr-2" style={{ color: 'var(--primary)' }} />详细规格
              </h3>
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {product.specs.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 text-sm">
                    <span style={{ color: 'var(--text-light)' }}>{tKey(s.key)}</span>
                    <span className="font-medium" style={{ color: 'var(--text)' }}>{tVal(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 尺码表 (ABU 风格) */}
          {hasSizes && (
            <div className="card">
              <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-ruler mr-2" style={{ color: 'var(--primary)' }} />尺码表
              </h3>
              <div className="space-y-2">
                {product.sizes.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm p-3 rounded-lg"
                    style={{ background: 'var(--input-bg)' }}>
                    <span className="font-bold text-lg w-12 text-center" style={{ color: 'var(--primary)' }}>{s.size}</span>
                    <span style={{ color: 'var(--text-light)' }}>{s.measurement}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-info-circle mr-1" />以腰围和臀围中较大者为准选择尺码
              </p>
            </div>
          )}

          {/* REARZ sizing table */}
          {hasSizingTable && (
            <div className="card">
              <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-ruler mr-2" style={{ color: 'var(--primary)' }} />尺码表
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {product.sizing_table.map((row, i) => (
                      <tr key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                        {row.map((cell, j) => (
                          <td key={j} className={`py-2 px-3 ${j === 0 ? 'font-semibold' : ''}`}
                            style={{ color: j === 0 ? 'var(--text)' : 'var(--text-light)' }}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* size chart infographic */}
          {product.size_chart_image && (
            <div className="card">
              <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-chart-simple mr-2" style={{ color: 'var(--primary)' }} />尺码图解
              </h3>
              <img
                src={product.size_chart_image}
                alt="Size Chart"
                className="w-full rounded-lg"
                style={{ aspectRatio: '4/3', objectFit: 'contain', background: 'var(--bg-card-soft)' }}
              />
            </div>
          )}

          {/* variants 列表 */}
          {product.variants && product.variants.length > 0 && (
            <div className="card">
              <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-boxes-stacked mr-2" style={{ color: 'var(--primary)' }} />所有规格
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.variants.slice(0, 16).map((v, i) => (
                  <div key={i} className="text-xs p-2 rounded-lg" style={{ background: 'var(--input-bg)' }}>
                    <div className="font-semibold" style={{ color: 'var(--text)' }}>{v.public_title || v.name}</div>
                    <div className="flex items-center justify-between mt-1">
                      {v.sku && <span style={{ color: 'var(--text-muted)' }}>SKU: {v.sku}</span>}
                      {v.price && <span className="font-semibold" style={{ color: 'var(--primary)' }}>${(v.price / 100).toFixed(2)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 图集 Tab */}
      {tab === 'images' && (
        <div className="space-y-4">
          {hasImages && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ aspectRatio: '1/1', background: 'var(--bg-card-soft)', overflow: 'hidden' }}>
                <img
                  src={allImages[activeImage]}
                  alt={`${product.name} ${activeImage + 1}`}
                  className="w-full h-full"
                  style={{ objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.style.opacity = '0.3'; }}
                />
              </div>
              <div className="p-3 text-center text-xs" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                {activeImage + 1} / {allImages.length}
              </div>
            </div>
          )}
          {allImages.length > 1 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {allImages.map((img, i) => (
                <button key={i} onClick={() => setActiveImage(i)}
                  className="rounded-lg overflow-hidden miui-press"
                  style={{
                    border: i === activeImage ? '2px solid var(--primary)' : '2px solid transparent',
                    aspectRatio: '1',
                    background: 'var(--bg-card-soft)',
                  }}>
                  <img src={img} alt="" loading="lazy" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {product.size_chart_image && (
            <div className="card">
              <h3 className="text-base font-bold mb-3" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-chart-simple mr-2" style={{ color: 'var(--primary)' }} />尺码图解
              </h3>
              <img src={product.size_chart_image} alt="Size Chart" className="w-full rounded-lg"
                style={{ aspectRatio: '4/3', objectFit: 'contain', background: 'var(--bg-card-soft)' }} />
            </div>
          )}
        </div>
      )}

      {/* 评价 Tab */}
      {tab === 'reviews' && hasReviews && (
        <div className="space-y-3">
          {product.reviews.map((r, i) => (
            <div key={i} className="card" style={{ padding: '1rem' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                    style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                    {(r.author || 'A')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{r.author || '匿名'}</div>
                    {r.date && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.date}</div>}
                  </div>
                </div>
                {r.rating && (
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }, (_, j) => (
                      <i key={j} className="fa-solid fa-star text-xs"
                        style={{ color: j < Number(r.rating) ? 'var(--warning)' : '#DDD' }} />
                    ))}
                  </div>
                )}
              </div>
              {r.body && (
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-light)', lineHeight: 1.7 }}>
                  {r.body}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 底部：返回链接 */}
      <div className="mt-6 text-center">
        <Link to="/diaper-wiki" className="btn btn-outline miui-press">
          <i className="fa-solid fa-arrow-left mr-2" />返回百科列表
        </Link>
      </div>
    </PageLayout>
  );
}
