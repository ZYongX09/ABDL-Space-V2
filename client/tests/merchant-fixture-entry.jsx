import React, { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import MerchantConsole from '../src/merchant/Console.jsx';
import { createMerchantAPI } from '../src/merchant/api.js';
import { watchAdminTheme } from '../src/pages/admin/theme.js';

const scenarios = ['ordinary', 'super', 'missing', 'error', 'inactive', 'anonymous'];
const injected = window.__MERCHANT_FIXTURE_SCENARIO__;
const stored = sessionStorage.getItem('merchant-fixture-scenario');
const scenario = scenarios.includes(injected) ? injected : scenarios.includes(stored) ? stored : 'ordinary';
sessionStorage.setItem('merchant-fixture-scenario', scenario);
const dark = new URLSearchParams(window.location.search).get('theme') === 'dark';

// 场景头只供本机同源 fixture 代理识别；显式限制同源，避免该入口被当作任意地址请求器。
function fixtureFetch(input, init) {
  const target = new URL(input, window.location.origin);
  if (target.origin !== window.location.origin) throw new Error('fixture 仅允许同源请求。');
  return fetch(target.toString(), { ...init, headers: { ...init?.headers, 'X-Merchant-Fixture': scenario } });
}

function Fixture() {
  const api = useMemo(() => createMerchantAPI({ base: '', getToken: () => `fixture-${scenario}`, fetcher: fixtureFetch }), []);
  useEffect(() => {
    document.body.classList.add('merchant-mode');
    const cleanup = watchAdminTheme(dark ? 'dark' : 'light');
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(items => items.forEach(item => item.unregister()));
    return () => { cleanup(); document.body.classList.remove('merchant-mode'); api.abortAll(); };
  }, [api]);
  return <MerchantConsole api={api} username={`fixture-${scenario}`} loggedIn={scenario !== 'anonymous'} />;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><Fixture /></BrowserRouter></React.StrictMode>);
