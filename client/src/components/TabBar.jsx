import { useRef, useEffect, useState } from 'react';

/**
 * MIUI 风格标签栏 — 带滑动指示器
 * @param {{ tabs: {key:string, label:string, icon?:string}[], value:string, onChange:(key:string)=>void }} props
 */
export default function TabBar({ tabs, value, onChange }) {
  const containerRef = useRef(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeBtn = container.querySelector(`[data-tab-key="${value}"]`);
    if (activeBtn) {
      const containerRect = container.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      setIndicator({
        left: btnRect.left - containerRect.left + container.scrollLeft,
        width: btnRect.width,
      });
    }
  }, [value]);

  return (
    <div className="miui-tab-bar-wrapper">
      <div ref={containerRef} className="miui-tab-bar">
        {tabs.map(t => (
          <button
            key={t.key}
            data-tab-key={t.key}
            className={`miui-tab ${value === t.key ? 'active' : ''}`}
            onClick={() => onChange(t.key)}
          >
            {t.icon && <i className={`fa-solid ${t.icon}`} />}
            <span>{t.label}</span>
          </button>
        ))}
        {/* 滑动指示器 */}
        <div
          className="miui-tab-indicator"
          style={{
            transform: `translateX(${indicator.left}px)`,
            width: indicator.width,
          }}
        />
      </div>
    </div>
  );
}

/**
 * MIUI 风格标签内容 — 带左右滑动动画
 */
export function TabContent({ activeKey, children }) {
  const [currentKey, setCurrentKey] = useState(activeKey);
  const [direction, setDirection] = useState(0); // -1 左滑, 1 右滑
  const prevKeyRef = useRef(activeKey);
  const keysRef = useRef([]);

  // 收集所有 key
  useEffect(() => {
    const keys = [];
    const collect = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(collect);
      } else if (node.props?.tabKey !== undefined) {
        keys.push(node.props.tabKey);
      } else if (node.props?.children) {
        collect(node.props.children);
      }
    };
    collect(children);
    keysRef.current = keys;
  }, [children]);

  useEffect(() => {
    if (activeKey === currentKey) return;
    const keys = keysRef.current.length > 0 ? keysRef.current : [currentKey, activeKey];
    const oldIdx = keys.indexOf(prevKeyRef.current);
    const newIdx = keys.indexOf(activeKey);
    setDirection(newIdx > oldIdx ? 1 : -1);
    prevKeyRef.current = activeKey;
    // 先播放退出动画，再切换内容
    setCurrentKey(activeKey);
  }, [activeKey]);

  return (
    <div className="miui-tab-content">
      {Array.isArray(children)
        ? children.find(c => c?.props?.tabKey === currentKey)
        : children
      }
    </div>
  );
}

export function TabPanel({ tabKey, children }) {
  return <div data-panel={tabKey}>{children}</div>;
}
