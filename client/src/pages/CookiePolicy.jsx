import PageLayout from '../components/PageLayout';

const EN = () => {
  const s = { color: 'var(--text-light)' };
  const h = { color: 'var(--text)' };
  const link = { color: 'var(--link-color)' };
  const card = 'p-4 rounded-xl';
  const bg = { background: 'var(--input-bg)' };

  return (
    <div className="space-y-4 text-sm leading-relaxed" style={s}>
      <p><strong>Last Updated:</strong> May 15, 2026</p>

      <h2 className="text-lg font-bold pt-2" style={h}>1. Introduction</h2>
      <p>This Cookie Policy explains how ABDL Space ("we," "us," or "our") uses cookies and similar technologies when you visit our website at abdl-space.top (the "Website"). This policy should be read in conjunction with our Privacy Policy.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>2. What Are Cookies?</h2>
      <p>Cookies are small text files that are stored on your device when you visit a website. They are widely used to make websites work more efficiently and to provide information to website owners.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>3. Our Use of Storage Technologies</h2>
      <h3 className="text-base font-bold pt-1" style={h}>3.1 LocalStorage</h3>
      <p>ABDL Space primarily uses <strong>localStorage</strong> rather than traditional cookies. LocalStorage is a web storage mechanism that allows websites to store data locally within your web browser. Unlike cookies, localStorage data is not sent to the server with every HTTP request, persists until explicitly deleted, and has a larger storage capacity.</p>
      <p>We use localStorage for the following purposes:</p>
      <div className={card} style={bg}>
        <p><strong>JWT Token</strong> — Authentication and session management (Essential, until logout or expiration)</p>
        <p><strong>Theme Preference</strong> — Remembering your display settings such as dark/light mode (Functional, persistent until changed)</p>
        <p><strong>Offline Mode Data</strong> — Enabling limited functionality when you are offline (Functional, persistent until cleared)</p>
      </div>

      <h3 className="text-base font-bold pt-1" style={h}>3.2 Traditional Cookies</h3>
      <p>Our use of Baidu Analytics (百度统计) involves the use of traditional HTTP cookies. These cookies are set by Baidu's tracking code embedded in our pages and are used to collect anonymous website usage data. These cookies are managed by Baidu and are subject to <a href="https://privacy.baidu.com" style={{ color: 'var(--link-color)' }}>Baidu's Privacy Policy</a>.</p>

      <h3 className="text-base font-bold pt-1" style={h}>3.3 What We Do NOT Use</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>No third-party cookies</strong> (other than Baidu Analytics)</li>
        <li><strong>No advertising cookies</strong></li>
        <li><strong>No web beacons</strong></li>
        <li><strong>No fingerprinting</strong></li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>4. How to Control LocalStorage</h2>
      <p>Since we use localStorage rather than cookies, traditional cookie consent banners do not apply. You can manage localStorage through your browser's Developer Tools (F12 → Application → Local Storage). Clearing localStorage will log you out and reset your preferences.</p>
      <p>To opt out of Baidu Analytics tracking, you can install the <a href="https://tongji.baidu.com/web/welcome/jscode" style={{ color: 'var(--link-color)' }}>Baidu Analytics Opt-out Browser Add-on</a> or block Baidu's tracking scripts through your browser settings.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>5. Do Not Track Signals</h2>
      <p>Because we do not engage in tracking activities, our Website does not alter its behavior in response to DNT signals.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>6. Children's Privacy</h2>
      <p>Our Website is intended for users aged 16 and older. We do not knowingly collect data from children under 16.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>7. Changes to This Policy</h2>
      <p>We may update this Cookie Policy from time to time. We will notify you of any material changes by posting the updated policy on this page.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>8. Contact Us</h2>
      <p>If you have any questions, please contact us at <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a></p>
    </div>
  );
};

const ZH = () => {
  const s = { color: 'var(--text-light)' };
  const h = { color: 'var(--text)' };
  const link = { color: 'var(--link-color)' };
  const card = 'p-4 rounded-xl';
  const bg = { background: 'var(--input-bg)' };

  return (
    <div className="space-y-4 text-sm leading-relaxed" style={s}>
      <p><strong>最后更新日期：</strong>2026年5月15日</p>

      <h2 className="text-lg font-bold pt-2" style={h}>1. 引言</h2>
      <p>本Cookie政策说明了ABDL Space（"我们"）在您访问我们的网站 abdl-space.top（"本网站"）时如何使用Cookie及类似技术。本政策应与我们的隐私政策一并阅读。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>2. 什么是Cookie？</h2>
      <p>Cookie是在您访问网站时存储在您的设备上的小型文本文件。它们被广泛用于使网站更高效地运行，并向网站所有者提供信息。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>3. 我们使用的存储技术</h2>
      <h3 className="text-base font-bold pt-1" style={h}>3.1 本地存储（LocalStorage）</h3>
      <p>ABDL Space 主要使用<strong>本地存储（localStorage）</strong>而非传统的Cookie。本地存储是一种网络存储机制，允许网站在您的浏览器中本地存储数据。与Cookie不同，本地存储数据不会在每次HTTP请求时发送到服务器，在明确删除之前持续存在，且具有更大的存储容量。</p>
      <p>我们将本地存储用于以下目的：</p>
      <div className={card} style={bg}>
        <p><strong>JWT令牌</strong> — 身份验证和会话管理（必要，直至登出或过期）</p>
        <p><strong>主题偏好</strong> — 记住您的显示设置，如深色/浅色模式（功能性，持续至更改）</p>
        <p><strong>离线模式数据</strong> — 在离线状态下提供有限功能（功能性，持续至清除）</p>
      </div>

      <h3 className="text-base font-bold pt-1" style={h}>3.2 传统Cookie</h3>
      <p>我们使用百度统计（Baidu Analytics），这涉及使用传统 HTTP Cookie。这些 Cookie 由嵌入在我们页面中的百度跟踪代码设置，用于收集匿名网站使用数据。这些 Cookie 由百度管理，受<a href="https://privacy.baidu.com" style={{ color: 'var(--link-color)' }}>百度隐私政策</a>约束。</p>

      <h3 className="text-base font-bold pt-1" style={h}>3.3 我们未使用的技术</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>无第三方Cookie</strong>（百度统计除外）</li>
        <li><strong>无广告Cookie</strong></li>
        <li><strong>无网络信标</strong></li>
        <li><strong>无浏览器指纹</strong></li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>4. 如何控制本地存储</h2>
      <p>由于我们使用的是本地存储而非Cookie，传统的Cookie同意横幅不适用。您可以通过浏览器的开发者工具（F12 → Application → Local Storage）管理本地存储。清除本地存储将使您登出并重置偏好设置。</p>
      <p>如需退出百度统计追踪，您可以安装<a href="https://tongji.baidu.com/web/welcome/jscode" style={{ color: 'var(--link-color)' }}>百度统计退出浏览器插件</a>，或通过浏览器设置屏蔽百度的跟踪脚本。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>5. "请勿追踪"信号</h2>
      <p>由于我们不从事追踪活动，本网站不会因DNT信号而改变其行为。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>6. 儿童隐私</h2>
      <p>本网站面向16岁及以上的用户。我们不会故意收集16岁以下儿童的数据。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>7. 本政策的变更</h2>
      <p>我们可能会不时更新本Cookie政策。我们将在本页面发布更新后的政策，以通知您任何重大变更。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>8. 联系我们</h2>
      <p>如有任何疑问，请通过 <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a> 联系我们。</p>
    </div>
  );
};

export default function CookiePolicy() {
  return (
    <PageLayout hero={{ icon: 'fa-cookie-bite', title: 'Cookie Policy / Cookie 政策', subtitle: 'Last updated: May 15, 2026' }}>
      {/* 中文翻译声明 */}
      <div className="p-4 rounded-xl mb-5 flex items-start gap-3" style={{ background: 'var(--warning-bg, #FFF8E1)', border: '2px solid var(--warning)' }}>
        <i className="fa-solid fa-circle-exclamation mt-0.5 text-lg" style={{ color: 'var(--warning)' }} />
        <div className="text-sm">
          <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>
            声明 / Disclaimer
          </div>
          <p style={{ color: 'var(--text-light)' }}>
            <strong style={{ color: 'var(--danger)' }}>以下英文版本为本政策的唯一正式版本。</strong>中文版本由AI翻译生成，仅供参考。如中英文版本存在差异，以英文版本为准。
          </p>
          <p className="mt-1" style={{ color: 'var(--text-light)' }}>
            <strong style={{ color: 'var(--danger)' }}>The English version below is the sole official version of this policy.</strong> The Chinese version is generated by AI translation and is for reference only. In case of any discrepancy between the English and Chinese versions, the English version shall prevail.
          </p>
        </div>
      </div>

      {/* 英文原版 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--primary)', color: 'white' }}>ENGLISH — OFFICIAL</span>
        </div>
        <div className="card">
          <EN />
        </div>
      </div>

      {/* 中文翻译版 */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>中文 — AI翻译仅供参考</span>
        </div>
        <div className="card" style={{ opacity: 0.9 }}>
          <ZH />
        </div>
      </div>
    </PageLayout>
  );
}
