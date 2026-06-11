import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton } from '../components/Feedback';
import { rankingsAPI } from '../api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import BaseScoreRef from '../components/BaseScoreRef';

const TABS = [
  { key: 'hot', label: '热门', icon: 'fa-fire' },
  { key: 'absorbency', label: '最强吸收', icon: 'fa-droplet' },
  { key: 'popular', label: '最受关注', icon: 'fa-eye' },
];

const PAGE_SIZE = 20;

export default function Rankings() {
  const [tab, setTab] = useState('hot');
  const [rankings, setRankings] = useState([]);
  const [baseScores, setBaseScores] = useState({ adult: 0, baby: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const offsetRef = useRef(0);
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isLoggedIn = !!user;

  // 用 ref 追踪状态，避免 scroll 闭包过时
  const stateRef = useRef({ hasMore: true, loading: false, loadingMore: false, tab: 'hot', isLoggedIn: false });
  stateRef.current = { hasMore, loading, loadingMore, tab, isLoggedIn };

  // 加载数据
  const loadData = useCallback(async (reset = false) => {
    const { tab: currentTab, isLoggedIn: loggedIn } = stateRef.current;
    const offset = reset ? 0 : offsetRef.current;
    
    if (reset) {
      offsetRef.current = 0;
      setRankings([]);
      setHasMore(true);
    }

    try {
      if (reset) setLoading(true);
      else setLoadingMore(true);

      const data = await rankingsAPI.get(currentTab, undefined, loggedIn ? undefined : 10, offset, PAGE_SIZE);
      const newRankings = data.rankings || [];
      
      if (reset) {
        setRankings(newRankings);
      } else {
        setRankings(prev => [...prev, ...newRankings]);
      }
      
      setBaseScores(data.base_scores || { adult: 0, baby: 0 });
      setTotalCount(data.total || 0);
      setHasMore(data.hasMore ?? false);
      offsetRef.current = offset + newRankings.length;
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [toast]);

  // 切换 tab 时重置
  useEffect(() => {
    loadData(true);
  }, [tab, isLoggedIn]);

  // 滚动加载（暂时禁用，用按钮代替）
  // useEffect(() => {
  //   const scrollContainer = document.querySelector('.app-main-content');
  //   if (!scrollContainer) return;
  //   const handleScroll = () => {
  //     const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
  //     const s = stateRef.current;
  //     if (scrollHeight - scrollTop - clientHeight < 200 && s.hasMore && !s.loading && !s.loadingMore) {
  //       loadData(false);
  //     }
  //   };
  //   scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
  //   return () => scrollContainer.removeEventListener('scroll', handleScroll);
  // }, [loadData]);

  // 基准分刷新
  useEffect(() => {
    let timer = null;
    const startPolling = () => {
      timer = setInterval(async () => {
        try {
          const data = await rankingsAPI.get(tab, undefined, isLoggedIn ? undefined : 10, 0, 1);
          setBaseScores(data.base_scores || { adult: 0, baby: 0 });
        } catch {}
      }, 10000);
    };
    const stopPolling = () => { if (timer) { clearInterval(timer); timer = null; } };
    const onVisibility = () => {
      if (document.hidden) stopPolling();
      else startPolling();
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) startPolling();
    return () => { stopPolling(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [tab, isLoggedIn]);

  return (
    <>
    <PageLayout hero={{ icon: 'fa-trophy', title: '排行榜', subtitle: '社区纸尿裤排名' }}>
      <div className="text-xs mb-4 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
        <i className="fa-solid fa-chart-line" />
        评分经贝叶斯平均与置信区间修正，评分数越多越接近真实水平
      </div>
      {totalCount > 0 && (
        <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          共 {totalCount} 款纸尿裤
        </div>
      )}

      {/* 标签 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`btn btn-sm miui-press ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 基准分参考 */}
      {baseScores.adult > 0 && (
        <BaseScoreRef adultScore={baseScores.adult} babyScore={baseScores.baby} />
      )}

      {/* 列表 */}
      {loading ? (
        <LoadingSkeleton count={5} height={70} />
      ) : (
        <div className="space-y-2" style={{ position: 'relative' }}>
          {rankings.map((d, i) => {
            const isFirst = i === 0;
            const isBlurred = !isLoggedIn && !isFirst;
            return (
              <Link
                key={d.id}
                to={isBlurred ? undefined : `/diaper/${d.id}`}
                className={`rank-item ${isBlurred ? '' : 'card-interactive'} miui-hover-lift`}
                style={{
                  textDecoration: 'none',
                  color: 'var(--text)',
                  ...(isBlurred ? {
                    filter: 'blur(6px)',
                    userSelect: 'none',
                    pointerEvents: 'none',
                  } : {}),
                }}
              >
                <span className={`rank-number ${i < 3 ? `top${i + 1}` : ''}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {isBlurred ? 'xxxx 纸尿裤' : <>{d.brand} {d.model}</>}
                    {!isBlurred && d.is_baby_diaper && <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,143,171,0.12)', color: '#d87a95' }}>儿童款</span>}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-light)' }}>
                    {isBlurred ? '---' : d.product_type}
                  </div>
                </div>
                <div className="text-right text-sm flex-shrink-0" style={{ maxWidth: '35%' }}>
                  {isBlurred ? (
                    <span style={{ color: 'var(--text-muted)' }}>0.00 分</span>
                  ) : (
                    <>
                      {tab === 'hot' && d.avg_score > 0 && (
                        <span className="font-bold" style={{ color: 'var(--warning)' }}>
                          <i className="fa-solid fa-star mr-1" />{d.avg_score}
                        </span>
                      )}
                      {tab === 'hot' && d.avg_score === 0 && (
                        <span style={{ color: 'var(--text-muted)' }}>暂无评分</span>
                      )}
                      {tab === 'absorbency' && (
                        <span className="font-bold" style={{ color: 'var(--primary-dark)' }}>
                          {d.absorbency_adult || d.absorbency_mfr || '-'}
                        </span>
                      )}
                      {tab === 'popular' && (
                        <span style={{ color: 'var(--text-light)' }}>{d.rating_count} 评价</span>
                      )}
                    </>
                  )}
                </div>
              </Link>
            );
          })}

          {/* 加载更多按钮 */}
          {hasMore && rankings.length > 0 && (
            <div className="flex justify-center py-4">
              <button
                className="btn btn-outline miui-press"
                onClick={() => loadData(false)}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <><i className="fa-solid fa-spinner fa-spin mr-2" />加载中...</>
                ) : (
                  <><i className="fa-solid fa-arrow-down mr-2" />加载更多</>
                )}
              </button>
            </div>
          )}

          {/* 无更多数据提示 */}
          {!hasMore && rankings.length > 0 && (
            <div className="text-center py-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              已显示全部 {totalCount} 款
            </div>
          )}

          {/* 未登录遮罩提示 */}
          {!isLoggedIn && rankings.length > 1 && (
            <div
              style={{
                position: 'sticky',
                bottom: '20px',
                zIndex: 10,
                textAlign: 'center',
                padding: '2rem 1.5rem',
                background: 'var(--bg-card)',
                borderRadius: '16px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
                maxWidth: '360px',
                width: '90%',
                margin: '0 auto',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
                <i className="fa-solid fa-lock" style={{ color: 'var(--primary)' }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', marginBottom: '0.5rem' }}>
                为确保数据安全
              </div>
              <div style={{ color: 'var(--text-light)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                登录账户查看完整排行榜
              </div>
              <button
                className="btn btn-primary miui-press"
                onClick={() => navigate('/login')}
                style={{ width: '100%' }}
              >
                <i className="fa-solid fa-right-to-bracket mr-2" />
                登录 / 注册
              </button>
            </div>
          )}
        </div>
      )}
    </PageLayout>
    </>
  );
}
