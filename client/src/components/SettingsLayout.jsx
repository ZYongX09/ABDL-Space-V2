import { useState, useEffect, useRef } from 'react';

/**
 * SettingsLayout — 电脑端左菜单 + 右内容布局（参考 X.com settings、weibo set/index）
 *
 * @param {Array} menu - 菜单项 [{ id, label, icon }]，id 对应 section id
 * @param {React.ReactNode} children - 内容区，每个顶级子节点需要一个 id 属性（或 sectionKeys 指定）
 * @param {string} sectionKeys - 可选，section id 顺序（默认按 DOM 中带 id 的元素自动识别）
 */
export default function SettingsLayout({ menu, children }) {
  const [activeId, setActiveId] = useState(menu[0]?.id);
  const observerRef = useRef(null);

  useEffect(() => {
    // scroll-spy：用 IntersectionObserver 监测当前可见 section
    const elements = menu
      .map(m => document.getElementById(m.id))
      .filter(Boolean);

    if (elements.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // 找出当前最靠上的可见 section
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );

    elements.forEach(el => observerRef.current.observe(el));
    return () => observerRef.current?.disconnect();
  }, [menu]);

  const handleClick = (e, id) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    const yOffset = -24;
    const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
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
