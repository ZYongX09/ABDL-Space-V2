import { useState, useEffect, useRef } from 'react';

/**
 * SettingsLayout — 电脑端左菜单 + 右内容布局（参考 X.com settings、weibo set/index）
 *
 * 注意：App.jsx 用 .app-main-content (overflow-y: auto) 作为滚动容器，
 *       不是 window。必须用 scroller.scrollTo 而非 window.scrollTo。
 */
export default function SettingsLayout({ menu, children }) {
  const [activeId, setActiveId] = useState(menu[0]?.id);
  const observerRef = useRef(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // 找最近的可滚动祖先（优先 .app-main-content）
  const getScroller = () => {
    return document.querySelector('.app-main-content')
      || document.scrollingElement
      || document.documentElement;
  };

  useEffect(() => {
    // 等 children commit 到 DOM 后再找 id 元素
    const init = () => {
      const elements = menu
        .map(m => document.getElementById(m.id))
        .filter(Boolean);
      if (elements.length === 0) return;

      const scroller = getScroller();
      const opts = scroller === document.scrollingElement || scroller === document.documentElement
        ? { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
        : { root: scroller, rootMargin: '-30% 0px -60% 0px', threshold: 0 };

      observerRef.current?.disconnect();
      observerRef.current = new IntersectionObserver((entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0] && visible[0].target.id !== activeIdRef.current) {
          setActiveId(visible[0].target.id);
        }
      }, opts);

      elements.forEach(el => observerRef.current.observe(el));
    };

    // 双保险：rAF 确保 DOM 完成
    const raf = requestAnimationFrame(init);
    return () => {
      cancelAnimationFrame(raf);
      observerRef.current?.disconnect();
    };
  }, [menu]);

  const handleClick = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    const el = document.getElementById(id);
    if (!el) return;

    const scroller = getScroller();
    const yOffset = -24;

    if (scroller === window || scroller === document.scrollingElement || scroller === document.documentElement) {
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    } else {
      // .app-main-content 是滚动容器
      const y = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop + yOffset;
      scroller.scrollTo({ top: y, behavior: 'smooth' });
    }
    setActiveId(id);
  };

  return (
    <div className="settings-layout">
      <nav className="settings-menu" aria-label="设置导航">
        {menu.map(item => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={(e) => handleClick(e, item.id)}
            className={`settings-menu-item ${activeId === item.id ? 'active' : ''}`}
          >
            {item.icon && <i className={`fa-solid ${item.icon}`} style={{ width: 18, textAlign: 'center' }} />}
            <span>{item.label}</span>
          </a>
        ))}
      </nav>
      <div className="settings-content">
        {children}
      </div>
    </div>
  );
}
