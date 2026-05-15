import { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton } from '../components/Feedback';
import { termWikiAPI } from '../api';
import { useToast } from '../contexts/ToastContext';

export default function TermWiki() {
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await termWikiAPI.list({ search: search || undefined });
        setTerms(data.terms || []);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [search]);

  return (
    <PageLayout hero={{ icon: 'fa-book', title: '术语 Wiki', subtitle: 'ABDL 常用术语解释' }}>
      <div className="mb-5">
        <input
          className="form-control"
          placeholder="搜索术语..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <LoadingSkeleton count={5} height={60} />
      ) : (
        <div className="space-y-3">
          {terms.map((t, i) => (
            <div
              key={t.id || i}
              className="card stagger-item cursor-pointer"
              style={{ padding: '1rem 1.25rem' }}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold" style={{ color: 'var(--text)' }}>{t.term}</span>
                  {t.category && <span className="tag ml-2">{t.category}</span>}
                </div>
                <i className={`fa-solid fa-chevron-${expanded === i ? 'up' : 'down'} text-sm`} style={{ color: 'var(--text-muted)' }} />
              </div>
              {expanded === i && (
                <div className="mt-3 pt-3 text-sm animate-fade-in" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-light)' }}>
                  {t.definition}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
