import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import { LoadingSkeleton } from '../components/Feedback';
import { rankingsAPI } from '../api';
import { useToast } from '../contexts/ToastContext';

const TABS = [
  { key: 'hot', label: '热门', icon: 'fa-fire' },
  { key: 'absorbency', label: '最强吸收', icon: 'fa-droplet' },
  { key: 'popular', label: '最受关注', icon: 'fa-eye' },
];

export default function Rankings() {
  const [tab, setTab] = useState('hot');
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await rankingsAPI.get(tab);
        setRankings(data.rankings || []);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [tab]);

  return (
    <>
    <MobileHeader title="排行榜" />
    <PageLayout hero={{ icon: 'fa-trophy', title: '排行榜', subtitle: '社区纸尿裤排名' }}>
      {/* 标签 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      {loading ? (
        <LoadingSkeleton count={5} height={70} />
      ) : (
        <div className="space-y-2">
          {rankings.map((d, i) => (
            <Link
              key={d.id}
              to={`/diaper/${d.id}`}
              className="rank-item stagger-item"
              style={{ textDecoration: 'none', color: 'var(--text)' }}
            >
              <span className={`rank-number ${i < 3 ? `top${i + 1}` : ''}`}>
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{d.brand} {d.model}</div>
                <div className="text-xs" style={{ color: 'var(--text-light)' }}>
                  {d.product_type}
                </div>
              </div>
              <div className="text-right text-sm flex-shrink-0" style={{ maxWidth: '35%' }}>
                {tab === 'hot' && d.avg_score > 0 && (
                  <span className="font-bold" style={{ color: 'var(--warning)' }}>
                    <i className="fa-solid fa-star mr-1" />{d.avg_score}
                  </span>
                )}
                {tab === 'absorbency' && (
                  <span className="font-bold" style={{ color: 'var(--primary-dark)' }}>
                    {d.absorbency_adult || d.absorbency_mfr || '-'}
                  </span>
                )}
                {tab === 'popular' && (
                  <span style={{ color: 'var(--text-light)' }}>{d.rating_count} 评价</span>
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
