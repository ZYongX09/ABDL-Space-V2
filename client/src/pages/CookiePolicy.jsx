import PageLayout from '../components/PageLayout';

const EN = () => {
  const s = { color: 'var(--text-light)' };
  const h = { color: 'var(--text)' };
  const link = { color: 'var(--link-color)' };
  const table = { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' };
  const th = { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid var(--border)', color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' };
  const td = { padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-light)' };

  return (
    <div className="space-y-5 text-sm leading-relaxed" style={s}>
      <p><strong>Last Updated:</strong> May 18, 2026</p>

      <h2 className="text-lg font-bold pt-2" style={h}>1. Introduction</h2>
      <p>This Cookie Policy explains how ABDL Space ("we," "us," or "our") uses cookies and similar technologies when you visit our website at abdl-space.top (the "Website"). This policy should be read in conjunction with our Privacy Policy.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>2. What Are Cookies?</h2>
      <p>Cookies are small text files that are stored on your device when you visit a website. They are widely used to make websites work more efficiently and to provide information to website owners.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>3. Cookies We Use</h2>

      <h3 className="text-base font-bold pt-2" style={h}>3.1 Essential Storage (localStorage)</h3>
      <p>We use localStorage (not traditional cookies) for essential functionality. This data is stored locally in your browser and is not sent to servers automatically.</p>
      <div className="overflow-x-auto mt-3">
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Purpose</th>
              <th style={th}>Duration</th>
              <th style={th}>Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}><code>token</code></td>
              <td style={td}>Authentication (JWT)</td>
              <td style={td}>Until logout / expiration</td>
              <td style={td}>Essential</td>
            </tr>
            <tr>
              <td style={td}><code>abdl_theme</code></td>
              <td style={td}>Theme preference (light/dark/colorful)</td>
              <td style={td}>Persistent</td>
              <td style={td}>Functional</td>
            </tr>
            <tr>
              <td style={td}><code>cookie_consent</code></td>
              <td style={td}>Cookie consent status</td>
              <td style={td}>Persistent</td>
              <td style={td}>Essential</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-base font-bold pt-2" style={h}>3.2 Third-Party Cookies — Baidu Analytics (百度统计)</h3>
      <p>We use Baidu Analytics to understand how visitors use our Website. Baidu Analytics uses cookies to collect anonymous browsing data.</p>
      <div className="overflow-x-auto mt-3">
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Cookie</th>
              <th style={th}>Provider</th>
              <th style={th}>Purpose</th>
              <th style={th}>Duration</th>
              <th style={th}>Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}><code>_hmt_*</code></td>
              <td style={td}>Baidu (百度)</td>
              <td style={td}>Website traffic analysis</td>
              <td style={td}>Session / 2 years</td>
              <td style={td}>Analytics</td>
            </tr>
            <tr>
              <td style={td}><code>Hm_lpvt_*</code></td>
              <td style={td}>Baidu (百度)</td>
              <td style={td}>Last visit timestamp</td>
              <td style={td}>Session</td>
              <td style={td}>Analytics</td>
            </tr>
            <tr>
              <td style={td}><code>Hm_lvt_*</code></td>
              <td style={td}>Baidu (百度)</td>
              <td style={td}>Visit count tracking</td>
              <td style={td}>1 year</td>
              <td style={td}>Analytics</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2">Baidu Analytics does not collect personally identifiable information. For more information, see <a href="https://privacy.baidu.com" style={link}>Baidu's Privacy Policy</a>.</p>
      <p className="mt-2"><strong>Baidu Analytics is only loaded after you accept cookies.</strong> If you reject cookies, Baidu Analytics scripts will not be loaded or executed.</p>

      <h3 className="text-base font-bold pt-2" style={h}>3.3 What We Do NOT Use</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li>No advertising cookies</li>
        <li>No social media tracking cookies</li>
        <li>No web beacons or fingerprinting</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>4. Your Choices</h2>
      <p>When you first visit our Website, a cookie consent banner will appear allowing you to:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Accept</strong> — Enable all cookies including Baidu Analytics</li>
        <li><strong>Reject</strong> — Only essential cookies (localStorage) will be used; Baidu Analytics will not load</li>
      </ul>
      <p className="mt-2">You can change your preference at any time by clearing the <code>cookie_consent</code> entry in localStorage via your browser's Developer Tools (F12 → Application → Local Storage).</p>

      <h2 className="text-lg font-bold pt-2" style={h}>5. Changes to This Policy</h2>
      <p>We may update this Cookie Policy from time to time. We will notify you of any material changes by posting the updated policy on this page.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>6. Contact Us</h2>
      <p>If you have any questions, please contact us at <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a></p>
    </div>
  );
};

const ZH = () => {
  const s = { color: 'var(--text-light)' };
  const h = { color: 'var(--text)' };
  const link = { color: 'var(--link-color)' };
  const table = { width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' };
  const th = { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid var(--border)', color: 'var(--text)', fontWeight: 700, whiteSpace: 'nowrap' };
  const td = { padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-light)' };

  return (
    <div className="space-y-5 text-sm leading-relaxed" style={s}>
      <p><strong>最后更新日期：</strong>2026年5月18日</p>

      <h2 className="text-lg font-bold pt-2" style={h}>1. 引言</h2>
      <p>本Cookie政策说明了ABDL Space（"我们"）在您访问我们的网站 abdl-space.top（"本网站"）时如何使用Cookie及类似技术。本政策应与我们的隐私政策一并阅读。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>2. 什么是Cookie？</h2>
      <p>Cookie是在您访问网站时存储在您设备上的小型文本文件，用于使网站更高效地运行并向网站所有者提供信息。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>3. 我们使用的Cookie</h2>

      <h3 className="text-base font-bold pt-2" style={h}>3.1 必要存储（localStorage）</h3>
      <p>我们使用 localStorage（非传统Cookie）来提供基本功能。这些数据存储在您的浏览器本地，不会自动发送到服务器。</p>
      <div className="overflow-x-auto mt-3">
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>名称</th>
              <th style={th}>用途</th>
              <th style={th}>有效期</th>
              <th style={th}>类型</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}><code>token</code></td>
              <td style={td}>身份验证（JWT）</td>
              <td style={td}>登出或过期</td>
              <td style={td}>必要</td>
            </tr>
            <tr>
              <td style={td}><code>abdl_theme</code></td>
              <td style={td}>主题偏好（浅色/深色/多彩）</td>
              <td style={td}>持久</td>
              <td style={td}>功能性</td>
            </tr>
            <tr>
              <td style={td}><code>cookie_consent</code></td>
              <td style={td}>Cookie同意状态</td>
              <td style={td}>持久</td>
              <td style={td}>必要</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 className="text-base font-bold pt-2" style={h}>3.2 第三方Cookie — 百度统计（Baidu Analytics）</h3>
      <p>我们使用百度统计来了解访问者如何使用本网站。百度统计使用Cookie收集匿名浏览数据。</p>
      <div className="overflow-x-auto mt-3">
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Cookie</th>
              <th style={th}>提供方</th>
              <th style={th}>用途</th>
              <th style={th}>有效期</th>
              <th style={th}>类型</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}><code>_hmt_*</code></td>
              <td style={td}>百度</td>
              <td style={td}>网站流量分析</td>
              <td style={td}>会话 / 2年</td>
              <td style={td}>分析</td>
            </tr>
            <tr>
              <td style={td}><code>Hm_lpvt_*</code></td>
              <td style={td}>百度</td>
              <td style={td}>最后访问时间</td>
              <td style={td}>会话</td>
              <td style={td}>分析</td>
            </tr>
            <tr>
              <td style={td}><code>Hm_lvt_*</code></td>
              <td style={td}>百度</td>
              <td style={td}>访问次数统计</td>
              <td style={td}>1年</td>
              <td style={td}>分析</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2">百度统计不会收集可直接识别您个人身份的信息。更多信息请参阅<a href="https://privacy.baidu.com" style={link}>百度隐私政策</a>。</p>
      <p className="mt-2"><strong>百度统计仅在您接受Cookie后才会加载。</strong>如果您拒绝Cookie，百度统计脚本将不会加载或执行。</p>

      <h3 className="text-base font-bold pt-2" style={h}>3.3 我们未使用的技术</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li>无广告Cookie</li>
        <li>无社交媒体追踪Cookie</li>
        <li>无网络信标或浏览器指纹</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>4. 您的选择</h2>
      <p>当您首次访问本网站时，会出现Cookie同意横幅，您可以选择：</p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>接受</strong> — 启用所有Cookie，包括百度统计</li>
        <li><strong>拒绝</strong> — 仅使用必要Cookie（localStorage），百度统计不会加载</li>
      </ul>
      <p className="mt-2">您可以随时通过浏览器开发者工具（F12 → Application → Local Storage）清除 <code>cookie_consent</code> 条目来更改您的偏好。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>5. 本政策的变更</h2>
      <p>我们可能会不时更新本Cookie政策。我们将在本页面发布更新后的政策，以通知您任何重大变更。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>6. 联系我们</h2>
      <p>如有任何疑问，请通过 <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a> 联系我们。</p>
    </div>
  );
};

export default function CookiePolicy() {
  return (
    <PageLayout hero={{ icon: 'fa-cookie-bite', title: 'Cookie Policy / Cookie 政策', subtitle: 'Last updated: May 18, 2026' }}>
      {/* 声明 */}
      <div className="p-4 rounded-xl mb-5 flex items-start gap-3" style={{ background: 'var(--warning-bg, #FFF8E1)', border: '2px solid var(--warning)' }}>
        <i className="fa-solid fa-circle-exclamation mt-0.5 text-lg" style={{ color: 'var(--warning)' }} />
        <div className="text-sm">
          <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>声明 / Disclaimer</div>
          <p style={{ color: 'var(--text-light)' }}>
            <strong style={{ color: 'var(--danger)' }}>以下英文版本为本政策的唯一正式版本。</strong>中文版本由AI翻译生成，仅供参考。如中英文版本存在差异，以英文版本为准。
          </p>
          <p className="mt-1" style={{ color: 'var(--text-light)' }}>
            <strong style={{ color: 'var(--danger)' }}>The English version below is the sole official version of this policy.</strong> The Chinese version is generated by AI translation and is for reference only. In case of any discrepancy between the English and Chinese versions, the English version shall prevail.
          </p>
        </div>
      </div>

      {/* 英文版 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--primary)', color: 'white' }}>ENGLISH — OFFICIAL</span>
        </div>
        <div className="card"><EN /></div>
      </div>

      {/* 中文版 */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>中文 — AI翻译仅供参考</span>
        </div>
        <div className="card" style={{ opacity: 0.9 }}><ZH /></div>
      </div>
    </PageLayout>
  );
}
