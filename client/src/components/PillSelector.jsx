import { useState, useRef, useEffect } from 'react';

/**
 * 药丸形毛玻璃分段选择器
 * 模仿 x.com 的 For You / Following 切换
 */
export default function PillSelector({ tabs, activeTab, onChange }) {
  const containerRef = useRef(null);
  const [indicatorStyle, setIndicatorStyle] = useState({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector(`[data-tab="${activeTab}"]`);
    if (activeBtn) {
      setIndicatorStyle({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
  }, [activeTab]);

  return (
    <div className="pill-selector-wrapper">
      <div className="pill-selector" ref={containerRef}>
        {/* 滑动指示器 */}
        <div
          className="pill-indicator"
          style={{
            transform: `translateX(${indicatorStyle.left || 0}px)`,
            width: indicatorStyle.width || 0,
          }}
        />
        {tabs.map(tab => (
          <button
            key={tab.key}
            data-tab={tab.key}
            className={`pill-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
