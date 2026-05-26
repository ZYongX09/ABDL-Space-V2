import { useState, useEffect } from 'react';

export default function BaseScoreRef({ adultScore, babyScore }) {
  const [pulse, setPulse] = useState(false);

  // 模拟实时感：每30秒闪烁一次表示数据刷新
  useEffect(() => {
    const t = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    }, 30000);
    return () => clearInterval(t);
  }, []);

  if (!adultScore && !babyScore) return null;

  return (
    <div className={`base-score-ref ${pulse ? 'base-score-ref--pulse' : ''}`}>
      <div className="base-score-ref-icon">
        <i className="fa-solid fa-chart-line" />
      </div>
      <div className="base-score-ref-body">
        <div className="base-score-ref-title">算法基准分</div>
        <div className="base-score-ref-scores">
          {adultScore > 0 && (
            <span className="base-score-ref-item">
              <span className="base-score-ref-tag base-score-ref-tag--adult">成人</span>
              <strong>{adultScore}</strong>
            </span>
          )}
          {babyScore > 0 && (
            <span className="base-score-ref-item">
              <span className="base-score-ref-tag base-score-ref-tag--baby">儿童</span>
              <strong>{babyScore}</strong>
            </span>
          )}
        </div>
      </div>
      <div className="base-score-ref-hint">
        <i className="fa-solid fa-circle-info" />
        <span>评分人数为 0 时的初始分数，基于全站数据实时计算</span>
      </div>
    </div>
  );
}
