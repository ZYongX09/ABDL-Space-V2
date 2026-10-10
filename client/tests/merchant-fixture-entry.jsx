import React, { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import MerchantConsole from '../src/merchant/Console.jsx';
import { createMerchantAPI } from '../src/merchant/api.js';
import { watchAdminTheme } from '../src/pages/admin/theme.js';

const scenarios = ['ordinary', 'super', 'missing', 'error', 'inactive', 'anonymous'];
const selected = new URLSearchParams(window.location.search).get('fixture');
const scenario = scenarios.includes(selected) ? selected : sessionStorage.getItem('merchant-fixture-scenario') || 'ordinary';
sessionStorage.setItem('merchant-fixture-scenario', scenario);
const dark = new URLSearchParams(window.location.search).get('theme') === 'dark';
function Fixture() {
  const api = useMemo(() => createMerchantAPI({ base: '', getToken: () => `fixture-${scenario}`, fetcher: (url, options) => fetch(url, { ...options, headers: { ...options.headers, 'X-Merchant-Fixture': scenario } }) }), []);
  useEffect(() => {
    document.body.classList.add('merchant-mode');
    const cleanup = watchAdminTheme(dark ? 'dark' : 'light');
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(items => items.forEach(item => item.unregister()));
    return () => { cleanup(); document.body.classList.remove('merchant-mode'); api.abortAll(); };
  }, [api]);
  return <MerchantConsole api={api} username={`fixture-${scenario}`} loggedIn={scenario !== 'anonymous'} />;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><Fixture /></BrowserRouter></React.StrictMode>);
