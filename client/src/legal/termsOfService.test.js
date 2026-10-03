import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { termsOfService } from './termsOfService.js';

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = resolve(here, '../pages/TermsOfService.jsx');
const pageSource = readFileSync(pagePath, 'utf8');
const content = JSON.stringify(termsOfService);
const clauseText = termsOfService.sections.flatMap(section => section.clauses.map(clause => clause.text)).join('\n');

function includesAll(fragments) {
  for (const fragment of fragments) assert.ok(content.includes(fragment), `缺少协议事实：${fragment}`);
}

// 直接编译真实页面；仅替换不属于本次范围的布局，检查实际输出的编号、链接和强调。
async function renderTerms() {
  const require = createRequire(import.meta.url);
  const { transform } = require('esbuild');
  const source = pageSource
    .replace("import PageLayout from '../components/PageLayout';", 'const PageLayout = ({ children }) => React.createElement("main", null, children);')
    .replace("import { termsOfService } from '../legal/termsOfService.js';", `const termsOfService = ${JSON.stringify(termsOfService)};`);
  const { code } = await transform(source, { loader: 'jsx', format: 'esm', jsx: 'transform' });
  const moduleSource = `import React from ${JSON.stringify(pathToFileURL(require.resolve('react')).href)};\n${code}`;
  const { default: TermsPage } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  return renderToStaticMarkup(TermsPage());
}

test('版本日期、运营方、成年限制和各端范围明确', () => {
  assert.equal(termsOfService.version, '2026.10');
  assert.equal(termsOfService.updatedAt, '2026-10-03');
  assert.equal(termsOfService.effectiveAt, '2026-10-03');
  assert.equal(termsOfService.operator, 'ABDL-Space');
  assert.equal(termsOfService.email, 'zhx589@outlook.com');
  includesAll(['年满18周岁', 'abdl-space.top', 'm.abdl-space.top', 'Android App', 'Mastodon兼容客户端', '按各端实际开放情况', '不等于已经上线']);
  assert.doesNotMatch(content, /年满16|未满16/);
});

test('协议正文、标题、提示及链接名称统一使用宝宝新天地，内部标识保持不变', () => {
  const displayedText = [
    termsOfService.title,
    ...termsOfService.notices,
    ...termsOfService.sections.flatMap(section => [section.title, ...section.clauses.map(clause => clause.text)]),
    ...termsOfService.links.map(link => link.label),
    termsOfService.closingNotice,
  ];
  displayedText.forEach(value => assert.doesNotMatch(value, /\bNBW\b|NewBabyWorld/i));
  assert.equal(termsOfService.sections.find(section => section.id === 'nbw').title, '第四条 宝宝新天地授权、注册与内容双发');
});

test('章节顺序及内容完整，锚点标识唯一且稳定', () => {
  const ids = ['scope', 'account', 'qq', 'nbw', 'conduct', 'content', 'verification', 'paid', 'novels', 'ai', 'privacy', 'availability', 'moderation', 'closure', 'liability', 'ip', 'changes', 'contact'];
  assert.deepEqual(termsOfService.sections.map(section => section.id), ids);
  const numerals = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八'];
  termsOfService.sections.forEach((section, index) => {
    assert.ok(section.title.startsWith(`第${numerals[index]}条 `));
    assert.ok(section.clauses.length >= 2);
    section.clauses.forEach(clause => assert.ok(clause.text.length > 20));
  });
});

test('QQ使用触发、标识处理及腾讯侧撤销边界', () => {
  includesAll(['QQ SDK 3.5.19', '仅在您选择相应登录、绑定操作后发起', 'openid', 'unionid', 'HMAC', '昵称、头像', '不等于在腾讯侧撤销授权']);
});

test('宝宝新天地覆盖邮箱和注册，明确默认双发、控件缺口和第三方副本', () => {
  includesAll(['OAuth授权', '邮箱查询', '在宝宝新天地注册', '帖子及所附图片', '可能默认双发', '不能仅凭关闭选项确认内容不会发送到宝宝新天地', '暂勿提交有关内容', '先解除绑定', '不会删除已双发的第三方副本']);
});

test('登录与本地锁不能代替年龄和实名核验', () => {
  includesAll(['passkey', '本地PIN与系统生物锁', '不是实名验证或年龄验证', '也不等同于服务器账户密码']);
});

test('宝宝认证涵盖完整材料、人工审核、公开状态和删除申请边界', () => {
  includesAll(['完整照片、审核联系QQ及成年声明', '腾讯云COS', '管理员审阅', '证书及认证状态', '公开展示', '不是人脸识别、身份证认证', '取消认证不等于删除', '不保证取消后自动清理', '不承诺固定期限自动删除', '希望删除认证材料时']);
});

test('付费权益按外部购买、期限额度、订单与法律处理', () => {
  includesAll(['爱发电（ifdian.net）', '外部购买', '兑换码', '有效期限、额度', '不保证未上线权益', '退款、撤销及消费者权利依据适用法律', '处理未履行部分']);
  assert.doesNotMatch(content, /捐赠为无偿赠与行为|捐赠为自愿且不可退还|不得以任何理由要求退款/);
});

test('小说云端上传同步、版权和非永久私密备份边界', () => {
  includesAll(['TXT、EPUB', '文件上传到云端', '阅读进度和笔记', '同步到服务器', '必须具备相应版权或授权', '处理完整文件，不属于仅本地阅读', '不承诺绝对私密或零泄露风险', '不意味着本平台可以任意公开或使用您的文件', '不承诺云端资料永久可用、永久备份']);
});

test('DeepSeek推荐与宝宝新天地分区AI分别披露输入及非医疗用途', () => {
  includesAll(['DeepSeek', '选择提交的资料', '使用感受汇总', 'AI选分区', '帖子正文片段', '不只是传送一个分区名称', '不提供医疗诊断、治疗建议或健康效果承诺']);
});

test('隐私政策直链、安全日志、推送初始化与版本开放边界', () => {
  includesAll(['IP地址、访问与安全日志', '极光推送SDK存在初始化', '关闭通知不当然停止所有相关处理', '限制旧版本', '提示或要求升级', '部分接口或功能也可能暂未开放']);
  assert.ok(pageSource.includes('href="/privacy"'));
  assert.ok(pageSource.includes('href="/cookies"'));
  assert.doesNotMatch(clauseText, /仅在.*同意.*后.*(?:启动|初始化)/);
});

test('注销仅邮箱申请，不承诺完整导出、自动全删或无限保留', () => {
  includesAll(['目前请向zhx589@outlook.com申请', '目前没有完整自助注销或完整数据导出功能', '不应将页面入口理解为已完成注销或导出', '不保证立即自动删除所有', '确有必要保留', '必要范围和期限', '公共协作内容', '私人账户资料需区分处理']);
});

test('合理责任、NSFW与开源权利、更新同意及法定管辖', () => {
  includesAll(['法定责任', '故意或重大过失', '不予免除或限制', '不是违法成人内容的通行证', '依各自适用的许可证', '重新取得明确同意', '不替代法定告知或必要的单独同意', '依法有管辖权的人民法院']);
  assert.doesNotMatch(clauseText, /责任上限为人民币零元|风险由用户自行承担|继续使用.*视为同意|运营方所在地有管辖权|无需经用户同意/);
});

test('真实页面生成每条编号、加粗提示及可达目录锚点，颜色使用主题变量', async () => {
  const html = await renderTerms();
  assert.match(html, /重要提示/);
  assert.match(html, /协议目录/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/cookies"/);
  assert.match(html, /href="mailto:zhx589@outlook.com"/);
  termsOfService.sections.forEach((section, sectionIndex) => {
    assert.ok(html.includes(`href="#terms-${section.id}"`));
    assert.ok(html.includes(`id="terms-${section.id}"`));
    section.clauses.forEach((clause, clauseIndex) => {
      const numbered = `${sectionIndex + 1}.${clauseIndex + 1} ${clause.text}`;
      assert.ok(html.includes(numbered), `未渲染条款：${section.id} ${clauseIndex + 1}`);
      if (clause.important) assert.ok(html.includes(`<strong style="color:var(--text)">${numbered}</strong>`));
    });
  });
  assert.match(html, /scroll-margin-top:6rem/);
  assert.match(html, /datetime="2026-10-03"/i);
  assert.doesNotMatch(pageSource, /#[0-9a-f]{3,8}\b|color:\s*['"](?:white|black)['"]/i);
  assert.ok(pageSource.includes("background: 'var(--primary-light)'"));
});

test('同一工作区的两端数据、页面和回归测试保持逐字一致', context => {
  const desktop = resolve(here, '../..').endsWith('/client');
  const workspace = resolve(here, desktop ? '../../../..' : '../../..');
  const peerSrc = resolve(workspace, desktop ? 'abdl-space-mobile/src' : 'ABDL-Space-V2/client/src');
  const peerModule = resolve(peerSrc, 'legal/termsOfService.js');
  if (!existsSync(peerModule)) {
    context.skip('独立仓库运行时不要求存在另一端；同工作区运行时检查两端一致性');
    return;
  }
  for (const file of ['legal/termsOfService.js', 'legal/termsOfService.test.js', 'pages/TermsOfService.jsx']) {
    assert.equal(readFileSync(resolve(here, '..', file), 'utf8'), readFileSync(resolve(peerSrc, file), 'utf8'), `两端文件不一致：${file}`);
  }
});
