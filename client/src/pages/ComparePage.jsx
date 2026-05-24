import { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import { diapersAPI } from '../api';
import { useToast } from '../contexts/ToastContext';

export default function ComparePage() {
  const [diapers, setDiapers] = useState([]);
  const [allDiapers, setAllDiapers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    diapersAPI.list({ limit: 100 }).then(data => {
      setAllDiapers(data.diapers || []);
      setLoading(false);
    }).catch(e => { toast.error(e.message); setLoading(false); });
  }, []);

  const toggleDiaper = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const selectedDiapers = allDiapers.filter(d => selected.includes(d.id));

  return (
    <PageLayout hero={{ icon: 'fa-scale-balanced', title: '纸尿裤对比', subtitle: '选择 2-4 款进行对比' }}>
      {loading ? <LoadingSkeleton count={3} height={60} /> : (<>
      <div className="card mb-5">
        <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>选择要对比的纸尿裤（最多 4 款）</h3>
        <div className="flex flex-wrap gap-2">
          {allDiapers.map(d => (
            <button
              key={d.id}
              className={`tag cursor-pointer ${selected.includes(d.id) ? 'filter-tag' : ''}`}
              onClick={() => toggleDiaper(d.id)}
              style={selected.includes(d.id) ? { background: 'var(--primary)', color: 'white' } : {}}
            >
              {d.brand} {d.model}
              {selected.includes(d.id) && <i className="fa-solid fa-xmark ml-1 text-xs" />}
            </button>
          ))}
        </div>
      </div>

      {/* 对比表格 */}
      {selectedDiapers.length >= 2 ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 500 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th className="text-left p-3 font-semibold" style={{ color: 'var(--text-light)' }}>属性</th>
                {selectedDiapers.map(d => (
                  <th key={d.id} className="text-center p-3 font-bold" style={{ color: 'var(--text)' }}>
                    {d.brand}<br /><span className="text-xs font-normal">{d.model}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['产品类型', 'product_type'],
                ['厚度', d => d.thickness ? `${d.thickness}mm` : '-'],
                ['成人吸收', 'absorbency_adult'],
                ['厂家标称', 'absorbency_mfr'],
                ['参考价', 'avg_price'],
                ['评分', d => d.avg_score > 0 ? `${d.avg_score} ⭐` : '-'],
              ].map(([label, key]) => (
                <tr key={label} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="p-3" style={{ color: 'var(--text-light)' }}>{label}</td>
                  {selectedDiapers.map(d => (
                    <td key={d.id} className="text-center p-3">
                      {typeof key === 'function' ? key(d) : (d[key] || '-')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="fa-scale-balanced" title="请选择至少 2 款纸尿裤" description="点击上方标签选择" />
      )}
      </>)}
    </PageLayout>
  );
}
