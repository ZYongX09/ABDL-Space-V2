import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext();

const THEMES = ['light', 'dark', 'colorful'];
const THEME_LABELS = { light: 'fa-sun 浅色', dark: 'fa-moon 深色', colorful: 'fa-palette 多彩' };

function getInitialTheme() {
  const saved = localStorage.getItem('abdl_theme');
  if (saved && THEMES.includes(saved)) return saved;
  return 'colorful';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('abdl_theme', theme);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme(t => {
      const idx = THEMES.indexOf(t);
      return THEMES[(idx + 1) % THEMES.length];
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
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, THEMES, THEME_LABELS }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
