import { useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import './ThemeToggleBubble.css';

export default function ThemeToggleBubble() {
  const { theme, setTheme, autoTheme, toggleAutoTheme } = useTheme();
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef(null);
  const cloudTimer = useRef(null);
  const containerRef = useRef(null);

  const isDark = theme === 'dark';

  // 卸载时清理 timer
  useEffect(() => {
    return () => clearTimeout(leaveTimer.current);
  }, []);

  // 云朵随机漂移动画
  useEffect(() => {
    if (!hovered || !containerRef.current) return;
    const getRandomDir = () => (Math.random() > 0.5 ? '2em' : '-2em');
    const cloudSons = containerRef.current.querySelectorAll('.dnt-cloud-son');
    cloudTimer.current = setInterval(() => {
      cloudSons.forEach(el => {
        el.style.transform = `translate(${getRandomDir()}, ${getRandomDir()})`;
      });
    }, 1000);
    return () => clearInterval(cloudTimer.current);
  }, [hovered]);

  const handleMouseEnter = useCallback(() => {
    clearTimeout(leaveTimer.current);
    setHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setHovered(false), 150);
  }, []);

  const handleClick = useCallback(() => {
    if (autoTheme) {
      // 先关闭自动模式
      toggleAutoTheme();
      // 切换到非当前时间主题
      const newTheme = isDark ? 'light' : 'dark';
      setTheme(newTheme);
    } else {
      setTheme(isDark ? 'light' : 'dark');
    }
  }, [isDark, autoTheme, setTheme, toggleAutoTheme]);

  // colorful 主题不显示
  if (theme === 'colorful') return null;

  const sunMoonIcon = isDark ? 'fa-sun' : 'fa-moon';

  return (
    <div
      className={`theme-bubble-wrapper ${hovered ? 'is-hovered' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 收起态：圆形图标 */}
      <div
        className="theme-bubble-circle"
        onClick={handleClick}
        title={isDark ? '切换到浅色模式' : '切换到深色模式'}
      >
        <i className={`fa-solid ${sunMoonIcon}`} />
      </div>

      {/* 展开态：DayNightToggle 4.0 */}
      <div className="theme-bubble-expanded" ref={containerRef}>
        <div className="dnt-container">
          <div
            className={`dnt-components ${isDark ? 'dark' : ''}`}
            onClick={handleClick}
          >
            {/* 太阳/月亮按钮 */}
            <div className="dnt-main-button">
              <div className="dnt-moon" />
              <div className="dnt-moon" />
              <div className="dnt-moon" />
            </div>
            {/* 白天背景光晕 */}
            <div className="dnt-daytime-bg" />
            <div className="dnt-daytime-bg" />
            <div className="dnt-daytime-bg" />
            {/* 云 */}
            <div className="dnt-cloud">
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
            </div>
            <div className="dnt-cloud-light">
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
              <div className="dnt-cloud-son" />
            </div>
            {/* 星星 */}
            <div className="dnt-stars">
              <div className="dnt-star big"><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /></div>
              <div className="dnt-star big"><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /></div>
              <div className="dnt-star medium"><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /></div>
              <div className="dnt-star medium"><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /></div>
              <div className="dnt-star small"><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /></div>
              <div className="dnt-star small"><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /><div className="dnt-star-son" /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
