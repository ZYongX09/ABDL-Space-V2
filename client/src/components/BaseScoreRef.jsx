import { useState } from 'react';

export default function BaseScoreRef({ adultScore, babyScore }) {
  const [hovered, setHovered] = useState(false);

  if (!adultScore && !babyScore) return null;

  return (
    <div
      className="base-score-ref"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="base-score-ref-label">
        <i className="fa-solid fa-chart-line mr-1.5" style={{ color: 'var(--primary-dark)' }} />
        基准分参考
      </span>
      {hovered && (
        <div className="base-score-ref-detail">
          {adultScore > 0 && (
            <span className="base-score-ref-item">
              <span className="base-score-ref-tag">成人</span>
              <strong>{adultScore}</strong>
            </span>
          )}
          {babyScore > 0 && (
            <span className="base-score-ref-item">
              <span className="base-score-ref-tag">儿童</span>
              <strong>{babyScore}</strong>
            </span>
          )}
          <span className="base-score-ref-hint">
            评分人数为 0 时的算法基准分
          </span>
        </div>
      )}
    </div>
  );
}
