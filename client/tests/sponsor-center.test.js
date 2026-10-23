import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { readFeedState, writeFeedState, clearRouteListCache } from '../src/utils/navigationState.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('赞助者中心有独立懒加载路由、标题和设置页入口', () => {
  const app = source('../src/App.jsx');
  assert.match(app, /lazy\(\(\) => import\('\.\/sponsors\/SponsorCenter'\)\)/);
  assert.match(app, /path="\/sponsors" element=\{<SponsorCenter \/>\}/);
  assert.match(app, /'\/sponsors': '赞助者中心/);
  assert.match(source('../src/pages/Settings.jsx'), /<Link to="\/sponsors"/);
});

test('旧固定捐赠入口统一转向动态套餐，外购提醒提供兑换返回入口', () => {
  const about = source('../src/pages/About.jsx');
  assert.match(about, /<Link to="\/sponsors"/);
  assert.doesNotMatch(about, /product_type=0/);
  const external = source('../src/pages/ExternalLink.jsx');
  assert.match(external, /<Link to="\/sponsors"/);
  assert.match(external, /返回本站不表示权益已激活/);
});

test('赞助权益更新能清除列表快照，不影响后续写入', () => {
  writeFeedState('sponsor-before', { advertisements: ['old'] });
  assert.ok(readFeedState('sponsor-before'));
  clearRouteListCache();
  assert.equal(readFeedState('sponsor-before'), null);
  writeFeedState('sponsor-after', { posts: [] });
  assert.deepEqual(readFeedState('sponsor-after'), { posts: [] });
  clearRouteListCache();
});

test('付款取码说明图为可部署的本地 PNG，而非支付二维码', () => {
  for (const index of [1, 2]) {
    const path = new URL(`../public/sponsors/payment-guide-${index}.png`, import.meta.url);
    assert.ok(existsSync(path));
    assert.equal(readFileSync(path).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});
