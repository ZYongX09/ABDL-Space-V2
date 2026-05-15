import PageLayout from '../components/PageLayout';

const EN = () => {
  const s = { color: 'var(--text-light)' };
  const h = { color: 'var(--text)' };
  const link = { color: 'var(--link-color)' };

  return (
    <div className="space-y-4 text-sm leading-relaxed" style={s}>
      <p><strong>Last Updated:</strong> May 15, 2026</p>

      <h2 className="text-lg font-bold pt-2" style={h}>1. Introduction</h2>
      <p>Welcome to ABDL Space ("we," "us," or "our"). We operate the website abdl-space.top (the "Website"), a diaper review and community platform. This Privacy Policy explains how we collect, use, store, and protect your personal information when you use our Website.</p>
      <p>By registering an account, logging in, or otherwise using the Website, you agree to the terms of this Privacy Policy. <strong>Your consent is obtained through an explicit checkbox during the registration or login process.</strong> If you do not agree, please do not use the Website.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>2. Information We Collect</h2>
      <h3 className="text-base font-bold pt-1" style={h}>2.1 Information You Provide Directly</h3>
      <p><strong>Account Registration:</strong> Email address, username, password (stored in hashed form).</p>
      <p><strong>Profile Information (optional):</strong> Age, region/location, weight, waist circumference, hip circumference, style preferences, personal bio, profile avatar.</p>
      <p><strong>Community Activity:</strong> Forum posts and comments, likes on posts and comments, diaper ratings (6 dimensions, scored 1–10 stars), usage reviews (5 dimensions, scored −5 to +5), private messages sent to other users.</p>

      <h3 className="text-base font-bold pt-1" style={h}>2.2 AI Recommendation Data</h3>
      <p>When you choose to use our AI-powered recommendation feature, you may elect to send certain body measurement data (such as weight, waist circumference, and hip circumference) to DeepSeek's AI API for processing. <strong>This data is only transmitted when you explicitly opt in and confirm your consent.</strong> You are not required to use this feature to access the Website.</p>

      <h3 className="text-base font-bold pt-1" style={h}>2.3 Information We Do NOT Collect</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>No analytics data</strong> — We do not use Google Analytics or any analytics service.</li>
        <li><strong>No advertising identifiers</strong></li>
        <li><strong>No web beacons or pixels</strong></li>
        <li><strong>No device fingerprinting</strong></li>
        <li><strong>No location tracking</strong></li>
        <li><strong>No third-party cookies</strong></li>
      </ul>

      <h3 className="text-base font-bold pt-1" style={h}>2.4 Automatic Data Collection</h3>
      <p>We do <strong>not</strong> automatically collect data through analytics tools or tracking technologies. Our server logs may temporarily record standard HTTP request information (such as IP address and browser user-agent) for operational and security purposes, but this data is not used for profiling, advertising, or long-term tracking.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>3. How We Use Your Information</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Account management</strong> — Create and maintain your account, authenticate your identity.</li>
        <li><strong>Community features</strong> — Enable forum participation, ratings, reviews, private messaging.</li>
        <li><strong>AI recommendations</strong> — Process your body measurement data through DeepSeek's AI API when you explicitly opt in.</li>
        <li><strong>Service improvement</strong> — Understand how our community uses the Website and improve features.</li>
        <li><strong>Security</strong> — Detect, prevent, and address fraud, abuse, and security issues.</li>
        <li><strong>Legal compliance</strong> — Comply with applicable laws, regulations, and legal processes.</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>4. Legal Bases for Processing (EEA/UK Users)</h2>
      <p>If you are located in the European Economic Area (EEA) or the United Kingdom (UK), we process your personal data based on: contract performance (Art. 6(1)(b) GDPR), consent (Art. 6(1)(a) GDPR), legitimate interests (Art. 6(1)(f) GDPR), and legal obligation (Art. 6(1)(c) GDPR).</p>

      <h2 className="text-lg font-bold pt-2" style={h}>5. Data Sharing and Disclosure</h2>
      <h3 className="text-base font-bold pt-1" style={h}>5.1 Third-Party Services</h3>
      <p>We share data with the following third-party service providers:</p>
      <div className="p-3 rounded-xl" style={{ background: 'var(--input-bg)' }}>
        <p><strong>DeepSeek AI</strong> — Body measurement data (only with your explicit consent) — AI-powered diaper recommendations.</p>
      </div>
      <h3 className="text-base font-bold pt-1" style={h}>5.2 What We Do NOT Do</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li>We do <strong>not</strong> sell your personal data to third parties.</li>
        <li>We do <strong>not</strong> share your data with advertisers or advertising networks.</li>
        <li>We do <strong>not</strong> share your data with data brokers.</li>
      </ul>
      <h3 className="text-base font-bold pt-1" style={h}>5.3 Other Disclosures</h3>
      <p>We may disclose your information if required by law, to protect safety, or in connection with a business transfer (merger, acquisition, or sale of assets).</p>

      <h2 className="text-lg font-bold pt-2" style={h}>6. Data Storage and Security</h2>
      <p>Your data is stored on secure servers. We implement industry-standard security measures including password hashing, encrypted data transmission (HTTPS/TLS), and access controls.</p>
      <p><strong>Data Retention:</strong> Account data is retained while your account is active. Community content may persist after account deletion to maintain community integrity. AI recommendation data is subject to DeepSeek's retention policies. Server logs are automatically deleted after a short operational period.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>7. Your Rights</h2>
      <p><strong>All users:</strong> Access, correction, deletion, and export of your data.</p>
      <p><strong>EEA/UK users (GDPR):</strong> Right to restrict processing, object, data portability, withdraw consent, and lodge a complaint with a supervisory authority.</p>
      <p><strong>California residents (CCPA/CPRA):</strong> Right to know, delete, and opt out of sale/sharing. We do not sell or share personal information as defined by CCPA/CPRA.</p>
      <p>To exercise any rights, contact us at <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a>.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>8. Children's Privacy</h2>
      <p>Our Website is intended for users aged 16 and older. We do not knowingly collect personal information from children under 16.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>9. International Data Transfers</h2>
      <p>If you access the Website from outside the jurisdiction where our servers are located, your data may be transferred across international borders. We rely on appropriate safeguards for such transfers.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>10. Third-Party Links</h2>
      <p>The Website may contain links to third-party websites. We are not responsible for the privacy practices or content of those websites.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>11. Changes to This Policy</h2>
      <p>We may update this Privacy Policy from time to time. When we make material changes, we will notify you by posting the updated policy on this page with a revised "Last Updated" date.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>12. Contact Us</h2>
      <p>If you have any questions about this Privacy Policy, please contact us at <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a></p>
    </div>
  );
};

const ZH = () => {
  const s = { color: 'var(--text-light)' };
  const h = { color: 'var(--text)' };
  const link = { color: 'var(--link-color)' };

  return (
    <div className="space-y-4 text-sm leading-relaxed" style={s}>
      <p><strong>最后更新日期：</strong>2026年5月15日</p>

      <h2 className="text-lg font-bold pt-2" style={h}>1. 引言</h2>
      <p>欢迎访问ABDL Space（"我们"）。我们运营网站 abdl-space.top（"本网站"），这是一个纸尿裤评价与社区平台。本隐私政策说明了您在使用本网站时，我们如何收集、使用、存储和保护您的个人信息。</p>
      <p>注册账户、登录或以其他方式使用本网站即表示您同意本隐私政策的条款。<strong>您的同意通过注册或登录流程中的明确勾选操作获取。</strong>如果您不同意，请勿使用本网站。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>2. 我们收集的信息</h2>
      <h3 className="text-base font-bold pt-1" style={h}>2.1 您直接提供的信息</h3>
      <p><strong>账户注册：</strong>电子邮箱地址、用户名、密码（以哈希形式存储）。</p>
      <p><strong>个人资料信息（可选）：</strong>年龄、地区/所在地、体重、腰围、臀围、风格偏好、个人简介、头像。</p>
      <p><strong>社区活动：</strong>论坛帖子和评论、对帖子和评论的点赞、纸尿裤评分（6个维度，1-10星）、使用感受评价（5个维度，-5至+5分）、发送给其他用户的私信。</p>

      <h3 className="text-base font-bold pt-1" style={h}>2.2 AI推荐数据</h3>
      <p>当您选择使用我们的AI推荐功能时，您可以选择将某些身体测量数据（如体重、腰围和臀围）发送给DeepSeek的AI API进行处理。<strong>此数据仅在您明确选择并确认同意后才会传输。</strong>您无需使用此功能即可访问本网站。</p>

      <h3 className="text-base font-bold pt-1" style={h}>2.3 我们不收集的信息</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>无分析数据</strong> — 我们不使用Google Analytics或任何分析服务。</li>
        <li><strong>无广告标识符</strong></li>
        <li><strong>无网络信标或像素</strong></li>
        <li><strong>无设备指纹</strong></li>
        <li><strong>无位置追踪</strong></li>
        <li><strong>无第三方Cookie</strong></li>
      </ul>

      <h3 className="text-base font-bold pt-1" style={h}>2.4 自动数据收集</h3>
      <p>我们<strong>不会</strong>通过分析工具或追踪技术自动收集数据。我们的服务器日志可能会临时记录标准HTTP请求信息（如IP地址和浏览器用户代理），用于运营和安全目的，但这些数据不会用于用户画像、广告投放或长期追踪。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>3. 我们如何使用您的信息</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>账户管理</strong> — 创建和维护您的账户、验证您的身份。</li>
        <li><strong>社区功能</strong> — 支持论坛参与、评分、评价、私信。</li>
        <li><strong>AI推荐</strong> — 在您明确选择同意后，通过DeepSeek的AI API处理您的身体测量数据。</li>
        <li><strong>服务改进</strong> — 了解社区如何使用本网站，改进功能。</li>
        <li><strong>安全</strong> — 检测、预防和处理欺诈、滥用和安全问题。</li>
        <li><strong>法律合规</strong> — 遵守适用的法律法规和法律程序。</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>4. 数据处理的法律依据（欧洲经济区/英国用户）</h2>
      <p>如果您位于欧洲经济区（EEA）或英国（UK），我们基于以下法律依据处理您的个人数据：合同履行（GDPR第6条第1款b项）、同意（GDPR第6条第1款a项）、合法权益（GDPR第6条第1款f项）、法律义务（GDPR第6条第1款c项）。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>5. 数据共享与披露</h2>
      <h3 className="text-base font-bold pt-1" style={h}>5.1 第三方服务</h3>
      <p>我们与以下第三方服务提供商共享数据：</p>
      <div className="p-3 rounded-xl" style={{ background: 'var(--input-bg)' }}>
        <p><strong>DeepSeek AI</strong> — 身体测量数据（仅在您明确同意后）— AI纸尿裤推荐。</p>
      </div>
      <h3 className="text-base font-bold pt-1" style={h}>5.2 我们不做的事情</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li>我们<strong>不会</strong>向第三方出售您的个人数据。</li>
        <li>我们<strong>不会</strong>与广告商或广告网络共享您的数据。</li>
        <li>我们<strong>不会</strong>与数据经纪商共享您的数据。</li>
      </ul>
      <h3 className="text-base font-bold pt-1" style={h}>5.3 其他披露情形</h3>
      <p>在法律要求、保护安全或业务转让（合并、收购或资产出售）的情况下，我们可能会披露您的信息。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>6. 数据存储与安全</h2>
      <p>您的数据存储在安全的服务器上。我们实施行业标准的安全措施，包括密码哈希、加密数据传输（HTTPS/TLS）和访问控制。</p>
      <p><strong>数据保留：</strong>账户数据在账户活跃期间保留。社区内容可能在账户删除后继续保留以维护社区完整性。AI推荐数据受DeepSeek的保留政策约束。服务器日志在短期运营期后自动删除。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>7. 您的权利</h2>
      <p><strong>所有用户：</strong>访问、更正、删除和导出您的数据。</p>
      <p><strong>欧洲经济区/英国用户（GDPR）：</strong>限制处理权、反对权、数据可携权、撤回同意权、投诉权。</p>
      <p><strong>加利福尼亚州居民（CCPA/CPRA）：</strong>知情权、删除权、退出出售/共享权。我们不会按照CCPA/CPRA的定义出售或共享个人信息。</p>
      <p>如需行使任何权利，请通过 <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a> 联系我们。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>8. 儿童隐私</h2>
      <p>本网站面向16岁及以上的用户。我们不会故意收集16岁以下儿童的个人信息。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>9. 国际数据传输</h2>
      <p>如果您从我们服务器所在地以外的司法管辖区访问本网站，您的数据可能会被跨境传输。我们依赖适当的保障措施进行此类传输。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>10. 第三方链接</h2>
      <p>本网站可能包含指向第三方网站的链接。我们不对这些网站的隐私做法或内容负责。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>11. 本政策的变更</h2>
      <p>我们可能会不时更新本隐私政策。当我们做出重大变更时，将在本页面发布更新后的政策并修订"最后更新日期"。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>12. 联系我们</h2>
      <p>如果您对本隐私政策有任何疑问，请通过 <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a> 联系我们。</p>
    </div>
  );
};

export default function PrivacyPolicy() {
  return (
    <PageLayout hero={{ icon: 'fa-shield-halved', title: 'Privacy Policy / 隐私政策', subtitle: 'Last updated: May 15, 2026' }}>
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
