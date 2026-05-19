import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const ThemeContext = createContext();

const THEMES = ['light', 'dark', 'colorful'];
const THEME_LABELS = { light: 'fa-sun 浅色', dark: 'fa-moon 深色', colorful: 'fa-palette 多彩' };

// 根据时间判断应使用的主题（19:00~7:00 深色，其余浅色）
function getTimeBasedTheme() {
  const hour = new Date().getHours();
  return (hour >= 19 || hour < 7) ? 'dark' : 'light';
}

function getInitialTheme() {
  const saved = localStorage.getItem('abdl_theme');
  if (saved && THEMES.includes(saved)) return saved;
  return 'colorful';
}

function getInitialAuto() {
  return localStorage.getItem('abdl_auto_theme') === 'true';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [autoTheme, setAutoTheme] = useState(getInitialAuto);
  const checkInterval = useRef(null);

  // 自动切换逻辑
  useEffect(() => {
    if (!autoTheme) {
      if (checkInterval.current) clearInterval(checkInterval.current);
      return;
    }

    // 立即应用
    const apply = () => {
      const timeTheme = getTimeBasedTheme();
      setTheme(timeTheme);
    };
    apply();

    // 每分钟检查一次
    checkInterval.current = setInterval(apply, 60 * 1000);
    return () => { if (checkInterval.current) clearInterval(checkInterval.current); };
  }, [autoTheme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    if (!autoTheme) localStorage.setItem('abdl_theme', theme);
  }, [theme, autoTheme]);

  const cycleTheme = useCallback(() => {
    if (autoTheme) return; // 自动模式下不手动切换
    setTheme(t => {
      const idx = THEMES.indexOf(t);
      return THEMES[(idx + 1) % THEMES.length];
    });
  }, [autoTheme]);

  const toggleAutoTheme = useCallback(() => {
    setAutoTheme(prev => {
      const next = !prev;
      localStorage.setItem('abdl_auto_theme', String(next));
      if (next) {
        // 开启自动时立即应用
        const timeTheme = getTimeBasedTheme();
        setTheme(timeTheme);
      }
      return next;
    });
  }, []);

  // Ctrl+Shift+T 快捷键
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        cycleTheme();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, autoTheme, toggleAutoTheme, THEMES, THEME_LABELS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
