// 小说审核本地验收登陆页控制脚本：仅同源调用本地 fixture 配置接口，绝不触达生产 API 或 AI。
const config = async (changeActor) => {
  const response = await fetch('/__novel/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(changeActor ? { actorId: Number(document.getElementById('actor').value) } : {}),
      scenario: document.getElementById('scenario').value,
      delay: Number(document.getElementById('delay').value),
    }),
  });
  if (!response.ok) throw new Error('本地场景配置失败');
  document.getElementById('result').textContent = '已应用本地场景，未调用生产或真实 AI';
};
document.getElementById('apply').onclick = () => config(false);
document.getElementById('start').onclick = async () => {
  await config(true);
  const id = document.getElementById('actor').value;
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(registration => registration.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => caches.delete(key)));
  }
  localStorage.setItem('abdl_theme', document.getElementById('theme').value);
  localStorage.setItem('abdl_auto_theme', 'false');
  localStorage.setItem('abdl_accounts', JSON.stringify([1, 2].map(accountId => ({ id: accountId, username: 'fixture_admin_' + accountId, role: 'admin', token: 'fixture-' + accountId }))));
  localStorage.setItem('abdl_active_account', id);
  localStorage.setItem('cookie_consent', JSON.stringify({ accepted: false, date: new Date().toISOString() }));
  location.href = '/admin/novels';
};
