import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  privacyPolicyMeta as meta,
  privacyPolicyNotice as notice,
  privacyPolicySensitiveNotice as sensitiveNotice,
  privacyPolicySections as sections,
  privacyPolicyContents as contents,
} from './privacyPolicy.js';

const allSections = sections.flatMap(section => [section, ...(section.children || [])]);
const byId = id => {
  const section = allSections.find(entry => entry.id === id);
  assert.ok(section, `Missing section ${id}`);
  return section;
};
const body = (id, language) => byId(id).paragraphs.map(p => p[language]).join('\n');
const allText = language => allSections.flatMap(s => s.paragraphs.map(p => p[language])).join('\n');
const require = createRequire(import.meta.url);
const pagePath = fileURLToPath(new URL('../pages/PrivacyPolicy.jsx', import.meta.url));
const pageSource = readFileSync(pagePath, 'utf8');

// 不落盘构建产物，以 SSR 检查两种语言的真实 JSX、目录及链接。
async function renderPage(language) {
  const result = await build({
    stdin: {
      contents: `import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import PrivacyPolicy from ${JSON.stringify(pagePath)};
        module.exports = renderToStaticMarkup(React.createElement(PrivacyPolicy));`,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    jsx: 'automatic',
    plugins: [{
      name: 'privacy-language-fixture',
      setup(builder) {
        builder.onLoad({ filter: /PrivacyPolicy\.jsx$/ }, () => ({
          contents: pageSource.replace('useState(privacyPolicyMeta.defaultLanguage)', `useState('${language}')`),
          loader: 'jsx',
          resolveDir: fileURLToPath(new URL('../pages/', import.meta.url)),
        }));
      },
    }],
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

test('版本、日期、运营名称、联系方式与语言策略', () => {
  assert.deepEqual(meta, {
    operator: 'ABDL-Space', contact: 'zhx589@outlook.com', version: '2026.10',
    updated: '2026-10-03', effective: '2026-10-03', minimumAge: 18,
    officialLanguage: 'en', defaultLanguage: 'zh',
  });
  assert.match(notice.en, /sole official.*AI translation.*reference only.*English version prevails/s);
  assert.match(notice.zh, /唯一正式版本.*AI 翻译.*仅供参考.*英文版本为准/);
  assert.match(body('scope', 'en'), /under 18 must not register/);
  assert.match(body('scope', 'zh'), /未满 18 周岁不得注册或使用/);
  assert.doesNotMatch(allText('en'), /users aged 16|children under 16|ABDL Space\b/);
});

test('每项中英文完整对应，编号连续，目录覆盖全部唯一锚点', () => {
  const bilingual = value => {
    assert.deepEqual(Object.keys(value).sort(), ['en', 'zh']);
    for (const language of ['en', 'zh']) assert.ok(value[language]?.trim());
    assert.match(value.zh, /[\u3400-\u9fff]/);
  };
  bilingual(notice);
  bilingual(sensitiveNotice);
  assert.equal(sections.length, 16);
  sections.forEach((section, index) => {
    assert.equal(section.number, String(index + 1));
    section.children?.forEach((child, childIndex) => assert.equal(child.number, `${index + 1}.${childIndex + 1}`));
  });
  for (const section of allSections) {
    assert.match(section.id, /^[a-z][a-z0-9-]+$/);
    bilingual(section.title);
    assert.ok(section.paragraphs.length || section.children?.length);
    section.paragraphs.forEach(bilingual);
    section.links?.forEach(entry => bilingual(entry.label));
  }
  assert.equal(new Set(allSections.map(s => s.id)).size, allSections.length);
  assert.deepEqual(contents.map(c => c.id), allSections.map(s => s.id));
  assert.deepEqual(contents.map(c => c.number), allSections.map(s => s.number));
});

test('账户、公开内容、私信与敏感同意', () => {
  for (const [language, patterns] of Object.entries({
    en: [/email address/, /password hash/, /age, region, weight, waist and hip/, /preferences, biography and avatar/],
    zh: [/邮箱/, /密码哈希/, /年龄、地区、体重、腰围、臀围/, /偏好、简介和头像/],
  })) patterns.forEach(pattern => assert.match(body('account-data', language), pattern));
  assert.match(body('community-data', 'en'), /saved by others.*not end-to-end encrypted/s);
  assert.match(body('community-data', 'zh'), /保存.*并非端到端加密/s);
  assert.match(sensitiveNotice.en, /separate consent.*continuing.*not that consent/s);
  assert.match(sensitiveNotice.zh, /单独同意.*继续使用不等于该授权/);
});

const verifiedFacts = [
  ['qq',
    [/3\.5\.19 lite/, /Shenzhen Tencent Computer Systems/, /select QQ login\/linking and confirm/, /code and access token.*temporarily.*OpenID, UnionID, nickname and avatar/s, /device model/, /even if linking is not completed/, /not anonymization/, /not retained long term/, /corresponding identifier mapping/, /another working login method/, /not revocation of Tencent authorization/],
    [/3\.5\.19 lite/, /深圳市腾讯计算机系统有限公司/, /主动选择 QQ 登录或绑定并确认后/, /code.*access token.*临时.*OpenID、UnionID、昵称及头像/s, /设备型号/, /即使未完成绑定/, /不是匿名化/, /token 不长期保存/, /对应标识映射/, /其他可用登录方式/, /不等于撤销腾讯授权/]],
  ['nbw',
    [/independently operated/, /UID, username and avatar/, /Email lookup\/registration sends/, /cross-posted.*by default/, /first 500 characters.*DeepSeek/s, /disable option alone cannot reliably confirm/, /does not delete.*NBW account or copies/, /2024-08-05/, /admin@mail.newbabyworld.top/, /14\+.*remains 18\+/s],
    [/独立运营/, /UID、用户名和头像/, /邮箱查询或注册会将邮箱发送/, /默认双发/, /前 500 字符.*DeepSeek/, /关闭选项不能可靠确认/, /不会删除 NBW 账户或.*副本/, /2024-08-05/, /admin@mail.newbabyworld.top/, /14\+.*仍为 18\+/s]],
  ['verification-submission',
    [/complete photo.*COS/, /not hash-only/, /AES-GCM/, /adult declaration.*time and policy version/, /random shooting requirements/, /SHA-256, size and object key/, /review status, remarks, reviewer and review time/, /separate consent/, /not identity-card.*facial recognition.*medical/, /short-lived signed URLs/, /not the verification photo or contact QQ/, /not publish.*advertising/s],
    [/完整照片.*COS/, /并非只保存哈希/, /AES-GCM/, /成年声明.*时间和政策版本/, /随机拍摄要求/, /SHA-256、大小和对象键/, /审核状态、备注、审核人员和审核时间/, /单独同意/, /不是身份证实名验证、人脸识别或医学鉴定/, /短期签名链接/, /不公开认证照片或联系 QQ/, /不将认证照片公开或用于广告/]],
  ['verification-retention',
    [/remove EXIF/, /noBackup/, /failed submission can leave a draft/, /success or abandonment clears/, /not claim all caches are encrypted/, /revocation does not itself delete/, /no unified automatic photo destruction/, /Request deletion by email/],
    [/清除 EXIF/, /noBackup/, /失败可能保留草稿/, /成功或放弃时清理/, /不声称全部缓存均已加密/, /吊销认证本身不等于删除/, /没有统一的照片自动销毁/, /通过邮箱申请删除/]],
  ['local-lock',
    [/Keystore/, /BiometricPrompt/, /not receive fingerprint or face templates/, /2FAS.*not TOTP/s],
    [/Keystore/, /BiometricPrompt/, /不接收指纹或面容模板/, /2FAS.*不是 TOTP/s]],
  ['passkeys',
    [/credential ID, public key, counter, device type, backup status, transports, nickname/, /private key is managed by your system/],
    [/credential ID、公钥、counter、设备类型、备份状态、transport、昵称/, /私钥由系统或认证器管理/]],
  ['jiguang',
    [/JPush, JCore and JOperate initialize at App startup/, /regId/, /creation\/activity times/, /title, body and navigation/, /Android ID\/OAID/, /version and configuration/, /not.*every.*always collected/, /does not by itself stop SDK initialization/, /not only after login consent/],
    [/JPush、JCore 与 JOperate.*启动时初始化/, /regId/, /创建或活跃时间/, /标题、正文和跳转目标/, /Android ID、OAID/, /版本和配置/, /并非.*始终必采/, /不等于停止 SDK 初始化/, /并非仅在登录同意后初始化/]],
  ['compatible-push',
    [/FCM token/, /app.joinmastodon.org/, /endpoint, public key, authentication secret and settings/, /WebPush delivery is not yet implemented/, /OAuth access token/],
    [/FCM token/, /app.joinmastodon.org/, /endpoint、公钥、认证密钥和设置/, /WebPush 投递尚未完成/, /OAuth access token/]],
  ['security-logs',
    [/IP address, User-Agent, request path and time/, /captcha.*screen.*time zone/s, /Rate limiting, QR-code.*bans.*particular anomalous accounts/, /not represent.*permanently.*automatically deleted/s],
    [/IP、User-Agent、请求路径和时间/, /验证码.*屏幕.*时区/, /限流、扫码.*封禁.*特定异常账户/, /不声称.*永久保存.*不声称.*自动删除/]],
  ['app-version',
    [/X-App-Version-Code/, /first\/latest version and access time/, /When native-client version recording is actually offered/, /do not use IMEI or an advertising tracking ID/],
    [/X-App-Version-Code/, /首次、最近版本和访问时间/, /在原生客户端版本记录功能实际开放后/, /不使用 IMEI 或广告跟踪 ID/]],
  ['payments',
    [/ifdian.net/, /does not receive.*card.*password/, /hashed, masked and encrypted recoverable ciphertext/, /redemption time, validity period, entitlements, original-image quota/, /audit records/, /order numbers/, /Refunds depend on applicable law/],
    [/ifdian.net/, /不.*接收支付卡信息或支付密码/, /哈希、掩码与可恢复的加密密文/, /兑换时间、有效期、权益、原图额度/, /审计记录/, /订单号/, /退款按适用法律/]],
  ['reading',
    [/TXT\/EPUB.*complete file.*COS/, /SHA-256 file checksum, title, author, format and size/, /not purely local/, /progress, bookmarks and notes/, /D1.*public when published/, /soft deletion and asynchronous/, /not intended for arbitrary public disclosure.*cannot be guaranteed absolutely secure/],
    [/TXT、EPUB.*完整文件.*COS/, /SHA-256 文件校验摘要、标题、作者、格式和大小/, /并非纯本地/, /进度、书签与笔记/, /D1.*发布后公开/, /软删除与异步/, /不供平台任意公开.*不能保证绝对安全/]],
  ['ai',
    [/age, region, body measurements, preferences and biography/, /aggregated usage reviews/, /Not all request fields.*checkboxes/, /sent when you use the feature/, /not through automatic daily listening/],
    [/年龄、地区、身体测量、偏好与简介/, /使用感受汇总/, /并非所有请求字段都受勾选控制/, /在使用功能时发送/, /不进行自动日常监听/]],
  ['tianditu',
    [/coordinates.*Tianditu.*reverse geocoding/, /cached locally/, /region.*uploaded with the post/],
    [/坐标.*天地图.*逆地理编码/, /本地缓存/, /地区.*随帖子上传/]],
  ['baidu',
    [/IP address.*Baidu Maps/, /Baidu Analytics uses cookies/, /device and browsing data/],
    [/IP.*百度地图/, /百度统计使用 cookies/, /设备与浏览数据/]],
  ['cloudflare',
    [/Pages, Workers, D1, KV, Durable Objects.*Queues/, /IP addresses, request content, database content and logs/, /across borders/, /not all data is guaranteed.*China.*applicable legal requirements and safeguards/s],
    [/Pages、Workers、D1、KV、Durable Objects.*Queues/, /IP、请求内容、数据库内容与日志/, /跨境传输/, /不保证.*中国.*适用法律要求与保障措施/]],
  ['tencent-cloud',
    [/COS in Shanghai/, /verification photos and novels/, /SES.*email addresses and email contents/],
    [/上海地域.*COS/, /认证照片与小说/, /SES.*邮箱地址与邮件内容/]],
  ['rights',
    [/verify account ownership/, /Complete self-service account closure and export are not currently available.*email/, /not.*immediately destroyed/, /necessary scope/, /third-party copies and backup cleanup/],
    [/身份核验/, /尚未提供完整的自助注销与导出.*邮箱申请/, /不意味着.*立即销毁/, /必要范围/, /第三方副本和备份清理/]],
];

for (const [id, enPatterns, zhPatterns] of verifiedFacts) {
  test(`${id} 已核实事实及限制在中英文中同时保留`, () => {
    enPatterns.forEach(pattern => assert.match(body(id, 'en'), pattern));
    zhPatterns.forEach(pattern => assert.match(body(id, 'zh'), pattern));
  });
}

test('留存与更新不作无依据的自动销毁或敏感授权承诺', () => {
  assert.match(body('retention', 'en'), /no unified automatic cleanup.*photos and logs/);
  assert.match(body('retention', 'zh'), /照片与日志没有统一自动清理机制/);
  assert.match(body('changes-contact', 'en'), /seek consent again.*Continued use is not a substitute/s);
  assert.match(body('changes-contact', 'zh'), /重新取得同意.*继续使用不能替代/s);
  assert.match(body('disclosure-roles', 'en'), /do not sell personal information/);
  assert.match(body('disclosure-roles', 'zh'), /不出售个人信息/);
  for (const language of ['en', 'zh']) assert.doesNotMatch(allText(language), /MiMo|September 23|2026年9月23日|industry-standard|自动删除所有|完全符合 GDPR/);
});

test('仅使用核实链接，不编造 NBW、天地图或 DeepSeek 隐私路径', () => {
  assert.deepEqual(byId('qq').links.map(l => l.href), [
    'https://wiki.connect.qq.com/qq互联sdk隐私保护声明',
    'https://wiki.connect.qq.com/开发者协议', 'https://privacy.qq.com/',
  ]);
  assert.deepEqual(byId('nbw').links.map(l => l.href), ['https://newbabyworld.top', 'mailto:admin@mail.newbabyworld.top']);
  assert.deepEqual(byId('tianditu').links.map(l => l.href), ['https://www.tianditu.gov.cn']);
  assert.deepEqual(byId('ai').links.map(l => l.href), ['https://www.deepseek.com']);
  for (const section of allSections) {
    section.links?.forEach(entry => assert.match(entry.href, /^(https:\/\/|mailto:)/));
  }
  assert.equal(byId('jiguang').links[0].href, 'https://www.jiguang.cn/license/privacy');
  assert.equal(byId('baidu').links[0].href, 'https://privacy.baidu.com/policy');
  assert.equal(byId('cloudflare').links[0].href, 'https://www.cloudflare.com/privacypolicy/');
  assert.equal(byId('tencent-cloud').links[0].href, 'https://cloud.tencent.com/document/product/301/1140');
});

test('页面默认中文、可访问切换、服务卡片与 CSS 变量，不使用宽表格', () => {
  assert.match(pageSource, /useState\(privacyPolicyMeta.defaultLanguage\)/);
  assert.match(pageSource, /aria-pressed=\{isChinese\}/);
  assert.match(pageSource, /aria-pressed=\{!isChinese\}/);
  assert.match(pageSource, /onClick=\{\(\) => setLanguage\('en'\)\}/);
  assert.match(pageSource, /aria-live="polite"/);
  assert.match(pageSource, /aria-controls="privacy-policy-document"/);
  assert.match(pageSource, /scroll-margin-top/);
  assert.match(pageSource, /focus-visible/);
  assert.match(pageSource, /overflow-wrap: anywhere/);
  assert.match(pageSource, /var\(--bg-card\)/);
  assert.doesNotMatch(pageSource, /<table\b|#[0-9a-fA-F]{3,8}\b|rgba?\(/);
});

for (const language of ['zh', 'en']) {
  test(`${language} 实际渲染全部正文、目录、唯一锚点及官方声明`, async () => {
    const html = await renderPage(language);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const entry of contents) {
      assert.ok(ids.includes(entry.id), `Missing rendered anchor ${entry.id}`);
      assert.ok(html.includes(`href="#${entry.id}"`), `Missing contents link ${entry.id}`);
      assert.ok(html.includes(`${entry.number}. ${entry.title[language]}`));
    }
    const decode = str => str.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
    const plain = decode(html.replace(/<[^>]*>/g, ''));
    allSections.forEach(section => section.paragraphs.forEach(p => assert.ok(plain.includes(p[language]), `Missing ${section.id} ${language} text`)));
    assert.ok(plain.includes(notice.en));
    assert.ok(plain.includes(notice.zh));
    assert.ok(plain.includes(sensitiveNotice[language]));
    assert.match(html, language === 'zh' ? /id="privacy-policy-document" lang="zh-CN"/ : /id="privacy-policy-document" lang="en"/);
    assert.match(html, /aria-pressed="true"/);
    assert.match(html, /class="privacy-policy-service"/);
    assert.doesNotMatch(html, /<table\b/);
    assert.ok(ids.includes('privacy-policy-top'));
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map(match => match[1]);
    targets.forEach(target => assert.ok(ids.includes(target)));
    assert.ok(html.includes('target="_blank" rel="noopener noreferrer"'));
  });
}
