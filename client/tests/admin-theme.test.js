import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import postcss from 'postcss';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const adminCSS = postcss.parse(source('../src/pages/admin/admin.css'));
const globalCSS = postcss.parse(source('../src/styles/global.css'));

function declarations(root, selector) {
  const values = {};
  root.walkRules(rule => {
    if (rule.selector !== selector) return;
    rule.walkDecls(decl => { values[decl.prop] = decl.value; });
  });
  return values;
}

// 模拟 CSS 自定义属性在定义元素上先解析、再继承的语义，检查别名循环和缺失。
function resolve(values) {
  const result = {};
  const resolving = new Set();
  const get = name => {
    if (name in result) return result[name];
    assert.ok(name in values, `未定义的主题变量 ${name}`);
    assert.ok(!resolving.has(name), `主题变量循环 ${name}`);
    resolving.add(name);
    const value = values[name].replace(/var\((--[\w-]+)\)/g, (_, key) => get(key));
    resolving.delete(name);
    result[name] = value;
    return value;
  };
  Object.keys(values).filter(key => key.startsWith('--')).forEach(get);
  return result;
}

for (const theme of ['light', 'dark', 'colorful']) {
  test(`管理端 ${theme} 主题共享站点表面，确认层、赞助页无变量循环`, () => {
    const selector = `[data-theme="${theme}"]`;
    const root = resolve({
      ...declarations(globalCSS, ':root'), ...declarations(globalCSS, selector),
      ...declarations(adminCSS, ':root'), ...declarations(adminCSS, selector),
    });
    const admin = resolve({ ...root, ...declarations(adminCSS, '.admin-console,\n.ac-admin-theme') });
    assert.equal(admin['--ac-surface'], root['--bg-card']);
    assert.equal(admin['--ac-text'], root['--text']);
    assert.equal(admin['--ac-canvas'], theme === 'colorful' ? root['--hero-bg'] : root['--bg']);
    assert.equal(admin['--app-admin-scheme'], theme === 'dark' ? 'dark' : 'light');
    assert.equal(admin['--ac-surface-subtle'], root['--input-bg']);
    const sponsor = resolve({ ...admin, ...declarations(postcss.parse(source('../src/sponsors/sponsors.css')), '.sponsor-admin') });
    assert.equal(sponsor['--sa-surface'], admin['--ac-surface']);
    assert.equal(sponsor['--sa-primary'], admin['--ac-action']);
    assert.equal(sponsor['--sa-text'], admin['--ac-text']);
  });
}

test('浅色与深色的文字、语义状态和实心按钮保持至少 4.5:1 对比', () => {
  const mix = (a, b, weight) => a.map((value, index) => value * weight + b[index] * (1 - weight));
  const parse = value => {
    if (/^#[\da-f]{6}$/i.test(value)) return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255);
    const mixed = /^color-mix\(in srgb, (.+) (\d+)%, (.+)\)$/.exec(value);
    if (mixed) return mix(parse(mixed[1]), parse(mixed[3]), Number(mixed[2]) / 100);
    const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
    assert.ok(rgba, `未知颜色表达式 ${value}`);
    return [Number(rgba[1]) / 255, Number(rgba[2]) / 255, Number(rgba[3]) / 255, Number(rgba[4])];
  };
  const contrast = (a, b) => {
    const luminance = color => color.reduce((sum, value, index) => sum + [0.2126, 0.7152, 0.0722][index] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4), 0);
    const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (high + 0.05) / (low + 0.05);
  };
  for (const theme of ['light', 'dark']) {
    const selector = `[data-theme="${theme}"]`;
    const root = resolve({ ...declarations(globalCSS, ':root'), ...declarations(globalCSS, selector), ...declarations(adminCSS, ':root'), ...declarations(adminCSS, selector) });
    const admin = resolve({ ...root, ...declarations(adminCSS, '.admin-console,\n.ac-admin-theme') });
    const surface = parse(admin['--ac-surface']);
    for (const tone of ['action', 'success', 'danger', 'warning', 'violet', 'pink']) {
      const text = parse(admin[`--ac-${tone}`]);
      const soft = parse(admin[`--ac-${tone}-soft`]);
      const background = soft.length === 4 ? mix(soft.slice(0, 3), surface, soft[3]) : soft;
      assert.ok(contrast(text, background) >= 4.5, `${theme} ${tone} 状态文字对比不足`);
    }
    for (const tone of ['action', 'danger']) {
      assert.ok(contrast(parse(admin[`--ac-${tone}`]), parse(admin['--ac-on-action'])) >= 4.5, `${theme} ${tone} 按钮文字对比不足`);
    }
    assert.ok(contrast(parse(admin['--ac-text-secondary']), surface) >= 4.5);
  }
});

test('App 管理只保留页内布局，不再以路由覆盖共享主题', () => {
  assert.doesNotMatch(source('../src/pages/admin/appClients.css'), /:root|:has\(|--ac-[\w-]+\s*:/);
  assert.match(source('../src/pages/admin/ui.jsx'), /className="ac-admin-theme"/);
  const adminDir = new URL('../src/pages/admin/', import.meta.url);
  for (const file of readdirSync(adminDir).filter(file => file.endsWith('.jsx') && !['layout.jsx', 'ui.jsx', 'charts.jsx', 'util.jsx'].includes(file))) {
    assert.match(source(`../src/pages/admin/${file}`), /AdminLayout/, `${file} 未使用管理端共享容器`);
  }
});

test('共享控件与赞助控件不再硬编码浅色表面/文本/边框', () => {
  for (const path of ['../src/pages/admin/admin.css', '../src/sponsors/sponsors.css']) {
    postcss.parse(source(path)).walkDecls(decl => {
      if (decl.prop.startsWith('--')) return;
      if (/^(color|background(-color)?|border(-.*)?|outline(-color)?|fill|stroke)$/.test(decl.prop)) {
        assert.doesNotMatch(decl.value, /#[\da-f]{3,8}\b|\b(?:white|black)\b/i, `${path}: ${decl.toString()}`);
      }
    });
  }
  for (const file of ['charts.jsx', 'overview.jsx', 'security.jsx']) {
    assert.doesNotMatch(source(`../src/pages/admin/${file}`), /#[\da-f]{3,8}\b/i);
  }
});

test('QQ 身份组件实际渲染三态，未知不提供解绑、不声称无身份', async () => {
  const server = await createServer({ configFile: false, root: new URL('../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  try {
    const { LoginMethods, UserIdentityDetails } = await server.ssrLoadModule('/src/pages/admin/users.jsx');
    const render = qq => renderToStaticMarkup(React.createElement(LoginMethods, { identity: { methods: { qq } }, onUnbind() {} }));
    for (const value of [true, 1, '1']) {
      const html = render({ bound: value, can_unbind: true });
      assert.match(html, /QQ 已绑定/);
      assert.match(html, /管理解绑/);
    }
    for (const value of [false, 0, '0']) {
      const html = render({ bound: value });
      assert.match(html, /QQ 未绑定/);
      assert.match(html, /该用户当前没有 QQ 第三方身份/);
      assert.doesNotMatch(html, /管理解绑/);
    }
    for (const qq of [undefined, null, {}, { bound: null }, { nickname: '旧资料' }]) {
      const html = render(qq);
      assert.match(html, /QQ 状态未知/);
      assert.doesNotMatch(html, /QQ 未绑定|该用户当前没有 QQ 第三方身份|管理解绑/);
    }
    assert.match(render({ bound: true, can_unbind: false }), /disabled=""/);
    const fallback = user => renderToStaticMarkup(React.createElement(UserIdentityDetails, {
      identity: null, identityError: '请求失败（404）', user, onUnbind() { throw new Error('降级展示不能解绑'); },
    }));
    for (const [value, label] of [[true, '已绑定'], [false, '未绑定'], [null, '状态未知'], [undefined, '状态未知']]) {
      // 无论旧列表是否为已绑定，都只使用最新普通详情值；false 不能被旧 true 覆盖。
      const html = fallback({ qq_bound: value, methods: { qq: { bound: true, can_unbind: true } } });
      assert.match(html, new RegExp(label));
      assert.match(html, /身份详情：请求失败（404）/);
      assert.match(html, /第三方身份资料暂不可用/);
      assert.doesNotMatch(html, /登录方式<|管理解绑|允许解绑|alt="QQ 头像"|最近身份审计|可用<|未设置/);
      if (value === false) assert.doesNotMatch(html, />已绑定</);
    }
    const dedicated = renderToStaticMarkup(React.createElement(UserIdentityDetails, {
      identity: { methods: { qq: { bound: false, can_unbind: false } }, audit: [] }, user: { qq_bound: true }, onUnbind() {},
    }));
    assert.match(dedicated, /QQ 未绑定/);
    assert.doesNotMatch(dedicated, /QQ 已绑定|管理解绑/);
  } finally {
    await server.close();
  }
});
