import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { adminAPI } from '../api';

const BetaModeContext = createContext();

const DEFAULT_CONFIG = {
  enabled: false,
  allowedRoutes: ['/', '/login', '/register', '/admin', '/beta-register'],
  message: '产品正在内测中，请登录后访问',
};

export function BetaModeProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await adminAPI.getBetaMode();
        setConfig(data);
      } catch {
        // 使用默认配置
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const data = await adminAPI.getBetaMode();
      setConfig(data);
    } catch {}
  }, []);

  const isRouteAllowed = useCallback((pathname) => {
    if (!config.enabled) return true;
    
    // 精确匹配
    if (config.allowedRoutes.includes(pathname)) return true;
    
    // 前缀匹配（支持 /diaper/:id 等动态路由）
    return config.allowedRoutes.some(route => {
      if (route === '/') return pathname === '/';
      return pathname.startsWith(route);
    });
  }, [config]);

  return (
    <BetaModeContext.Provider value={{ config, loading, refreshConfig, isRouteAllowed }}>
      {children}
    </BetaModeContext.Provider>
  );
}

export function useBetaMode() {
  const ctx = useContext(BetaModeContext);
  if (!ctx) throw new Error('useBetaMode must be used within BetaModeProvider');
  return ctx;
}
