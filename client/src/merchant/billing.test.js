import test from 'node:test';
import assert from 'node:assert/strict';
import { createMerchantAPI } from './api.js';
import { MAX_BILLING_MINOR, adBillingFields, assertBillingReceipt, createPurchaseAttempt, formatHalfMinor, formatMinor, parseYuan, termExpiries } from './billing.js';
import { parseBillingCodes, parseBillingCodeReceipt, parseBillingPermission } from '../pages/admin/advertisingBilling.js';

test('money uses integer minor units with exact half-minor accounting and write bounds', () => {
  assert.equal(parseYuan(' 15.03 '), 1503);
  for (const invalid of ['', 0, '-1', '1.005', '1e3', '45035996273704.96']) assert.throws(() => parseYuan(invalid));
  assert.equal(parseYuan('45035996273704.95'), MAX_BILLING_MINOR);
  assert.equal(formatHalfMinor(-3), '-¥0.015');
  assert.equal(formatHalfMinor(2003), '¥10.015');
  assert.equal(formatMinor(1500), '¥15.00');
  assert.equal(formatMinor(MAX_BILLING_MINOR), '¥45035996273704.95');
  assert.deepEqual(adBillingFields('plan', '99'), { billing_mode: 'plan' });
  assert.deepEqual(adBillingFields('cpm', '15.03'), { billing_mode: 'cpm', billing_budget_minor: 1503 });
  assert.throws(() => adBillingFields('cpm', ''));
});

test('a confirmed checkout uses the quote unchanged across retry and restore; other companies are isolated', () => {
  const store = new Map();
  const storage = { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key) };
  const attempt = createPurchaseAttempt({ storage, scope: 10, makeId: () => 'request-1' });
  const first = attempt.start('monthly', 3900);
  assert.deepEqual(first, { plan: 'monthly', expected_price_minor: 3900, request_id: 'request-1' });
  assert.deepEqual(attempt.start('monthly', 4900), first);
  const restored = createPurchaseAttempt({ storage, scope: 10 });
  assert.deepEqual(restored.current, first);
  assert.equal(createPurchaseAttempt({ storage, scope: 12 }).current, null);
  assert.throws(() => assertBillingReceipt({ recorded: true, item: { kind: 'monthly', amount_half_minor: -9800 } }, 'monthly', 3900));
  assert.equal(assertBillingReceipt({ recorded: false, item: { kind: 'monthly', amount_half_minor: -7800 } }, 'monthly', 3900).kind, 'monthly');
  restored.clear();
  assert.equal(createPurchaseAttempt({ storage, scope: 10 }).current, null);
});

test('current and queued plan expiries are separately represented', () => {
  const now = Date.parse('2026-12-01T00:00:00Z');
  const current = '2026-12-02T00:00:00Z', queued = '2027-01-01T00:00:00Z';
  assert.deepEqual(termExpiries({ entitlement_current_ends_at: current, entitlement_ends_at: queued }, now), { current, queued });
  assert.deepEqual(termExpiries({ entitlement_current_ends_at: null, entitlement_ends_at: queued }, now), { current: null, queued });
  assert.deepEqual(termExpiries({ entitlement_current_ends_at: null, entitlement_ends_at: null }, now), { current: null, queued: null });
});

test('billing API sends uncached GET, explicit quote and redeem code, and preserves server errors', async () => {
  const calls = [];
  const body = { status: 'paused', balance_minor: 1999, balance_half_minor: 3999, monthly_price_minor: 3900, trial_available: true,
    entitlement_ends_at: null, entitlement_current_ends_at: null, items: [], pagination: { page: 2, limit: 20, total: 24, totalPages: 2 } };
  const api = createMerchantAPI({ fetcher: async (url, init) => {
    calls.push([url, init]);
    return init.method === 'GET' ? Response.json(body) : Response.json({ code: 'billing_paused', error: '平台已暂停' }, { status: 409 });
  } });
  assert.deepEqual(await api.billing({ page: 2, limit: 20 }), body);
  assert.equal(calls[0][0], '/api/merchant/billing?page=2&limit=20');
  assert.equal(calls[0][1].cache, 'no-store');
  const quote = { plan: 'trial', expected_price_minor: 1500, request_id: 'synthetic' };
  await assert.rejects(api.purchaseBilling(quote), error => error.status === 409 && error.code === 'billing_paused');
  await assert.rejects(api.redeemBilling('SYNTHETIC'), { status: 409 });
  assert.deepEqual(calls.slice(1).map(([path, init]) => [path, init.method, JSON.parse(init.body)]), [
    ['/api/merchant/billing/purchase', 'POST', quote], ['/api/merchant/billing/redeem', 'POST', { code: 'SYNTHETIC' }],
  ]);
});

test('code inventory destroys unexpected plaintext fields and permissions fail closed', () => {
  const code = `MB-${'A'.repeat(36)}1234`;
  const row = { id: 1, code_mask: 'MB-AAAA…1234', amount_minor: 1500, created_at: '2026-12-01T00:00:00Z', redeemed_at: null, redeemed_by_merchant_id: null };
  assert.equal(parseBillingPermission({ settings: { can_manage_billing: 1 } }), false);
  assert.equal(parseBillingPermission({ settings: { can_manage_billing: true } }), true);
  const inventory = parseBillingCodes({ items: [{ ...row, code }], total: 20 }, 2, 10);
  assert.deepEqual(inventory, { items: [row], pagination: { page: 2, limit: 10, total: 20, totalPages: 2 } });
  assert.equal(parseBillingCodeReceipt({ ...row, code }, 1500), code);
  assert.throws(() => parseBillingCodeReceipt({ ...row, code }, 1501));
  assert.throws(() => parseBillingCodes({ items: [{ ...row, code_mask: code }], total: 20 }, 2, 10));
});
