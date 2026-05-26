import PageLayout from '../components/PageLayout';

const EN = () => {
  const s = { color: 'var(--text-light)' };
  const h = { color: 'var(--text)' };
  const link = { color: 'var(--link-color)' };

  return (
    <div className="space-y-4 text-sm leading-relaxed" style={s}>
      <p><strong>Last Updated:</strong> May 26, 2026</p>

      <h2 className="text-lg font-bold pt-2" style={h}>1. Introduction</h2>
      <p>ABDL Space ("we," "us," or "our") is committed to protecting the personal information of minors. This Policy supplements our Privacy Policy and describes the additional measures we take to safeguard the personal information of users who are minors under applicable law.</p>
      <p>This Policy applies to all products and services provided by ABDL Space (including the website abdl-space.top and its mobile version m.abdl-space.top).</p>

      <h2 className="text-lg font-bold pt-2" style={h}>2. Our Commitment</h2>
      <p>In principle, our products and services are primarily intended for adult users. Minor users should only use our products and services, or provide personal information to us, after obtaining verifiable consent from their parent or legal guardian. We can only reasonably infer whether a user is a minor based on the information they submit to us.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>3. How We Identify Minor Users</h2>
      <p>We do not implement mandatory age verification mechanisms. Instead, we rely on the following methods to identify potential minor users:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Self-declaration during the registration process;</li>
        <li>Information provided in the user's profile (such as age);</li>
        <li>Other reasonable indicators submitted by the user during the use of our services.</li>
      </ul>
      <p>If we identify or reasonably suspect that a user is a minor, we may request additional verification of parental or guardian consent.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>4. Information We Collect from Minor Users</h2>
      <p>If a minor user is permitted to use our services with parental or guardian consent, we collect the same categories of information as described in our Privacy Policy, including:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Account registration information (email address, username, hashed password);</li>
        <li>Optional profile information;</li>
        <li>Community activity data (posts, comments, ratings, reviews, private messages);</li>
        <li>Standard web browsing data collected through Baidu Analytics;</li>
        <li>Third-party account information if the user chooses to log in via NewBabyWorld (宝宝新天地) OAuth.</li>
      </ul>
      <p>We do not knowingly collect personal information from minors beyond what is necessary to provide our services.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>5. How We Use Minor Users' Information</h2>
      <p>We use the personal information of minor users for the same purposes described in our Privacy Policy, including:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Account management and identity verification;</li>
        <li>Enabling community features (forum participation, ratings, reviews, messaging);</li>
        <li>Service improvement through aggregated analytics;</li>
        <li>Security and fraud prevention;</li>
        <li>Legal compliance.</li>
      </ul>
      <p>We will not use a minor's personal information for purposes beyond those necessary to provide the relevant services without additional parental or guardian consent.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>6. Information Sharing and Disclosure</h2>
      <p>We apply the same data sharing practices for minor users as described in our Privacy Policy. Specifically:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>We do <strong>not</strong> sell the personal information of any users, including minors;</li>
        <li>We do <strong>not</strong> share personal information with advertisers or advertising networks;</li>
        <li>Body measurement data is only transmitted to DeepSeek's AI API when the user explicitly opts in (AI recommendation feature);</li>
        <li>Standard web browsing data is collected by Baidu Analytics in aggregated form;</li>
        <li>Third-party account data is processed by NewBabyWorld (宝宝新天地) when the user chooses OAuth login.</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>7. Information Storage and Security</h2>
      <p>We store minor users' personal information using the same security measures described in our Privacy Policy, including password hashing, encrypted data transmission (HTTPS/TLS), and access controls. We retain minor users' data only for as long as necessary to provide our services or as required by law.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>8. Rights of Parents and Guardians</h2>
      <p>Parents or legal guardians of minor users have the following rights regarding their child's personal information:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Right to Access:</strong> Request a copy of the personal information we have collected about their child;</li>
        <li><strong>Right to Correction:</strong> Request correction of inaccurate personal information;</li>
        <li><strong>Right to Deletion:</strong> Request deletion of their child's personal information and account;</li>
        <li><strong>Right to Restrict Processing:</strong> Request that we limit how we process their child's personal information;</li>
        <li><strong>Right to Withdraw Consent:</strong> Withdraw previously granted consent at any time.</li>
      </ul>
      <p>To exercise any of these rights, please contact us at <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a>. We will respond to your request within a reasonable timeframe and in accordance with applicable law.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>9. Measures When a Minor Is Identified</h2>
      <p>If we discover that a user is a minor who has not obtained verifiable parental or guardian consent, we will take the following measures:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Promptly restrict the minor user's access to services that require personal information;</li>
        <li>Notify the minor user's parent or guardian (if contact information is available);</li>
        <li>Delete the minor's personal information within a reasonable timeframe, except where retention is required by law;</li>
        <li>Terminate the minor's account if parental or guardian consent cannot be obtained.</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>10. Recommendations for Parents and Guardians</h2>
      <p>We encourage parents and guardians to:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Guide minors in understanding and using our services;</li>
        <li>Supervise minors' online activities and interactions;</li>
        <li>Help minors understand the importance of protecting personal information;</li>
        <li>Contact us promptly if they believe their child has provided personal information without consent.</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>11. Updates to This Policy</h2>
      <p>We may update this Policy from time to time. When we make material changes, we will notify users by posting the updated policy on this page with a revised "Last Updated" date. We encourage parents and guardians to review this Policy periodically.</p>

      <h2 className="text-lg font-bold pt-2" style={h}>12. Contact Us</h2>
      <p>If you have any questions about this Policy or wish to exercise any rights regarding a minor's personal information, please contact us at:</p>
      <p><strong>Email:</strong> <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a></p>
    </div>
  );
};

const ZH = () => {
  const s = { color: 'var(--text-light)' };
  const h = { color: 'var(--text)' };
  const link = { color: 'var(--link-color)' };

  return (
    <div className="space-y-4 text-sm leading-relaxed" style={s}>
      <p><strong>最后更新日期：</strong>2026年5月26日</p>

      <h2 className="text-lg font-bold pt-2" style={h}>1. 引言</h2>
      <p>ABDL Space（"我们"）致力于保护未成年人的个人信息。本政策是对我们隐私政策的补充，描述了我们为保护未成年用户的个人信息所采取的额外措施。</p>
      <p>本政策适用于ABDL Space提供的所有产品和服务（包括网站 abdl-space.top 及其移动版本 m.abdl-space.top）。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>2. 我们的承诺</h2>
      <p>原则上，我们的产品和服务主要面向成年用户。未成年人用户应当在获取其父母或法定监护人的同意后，使用我们的产品和服务或向我们提供信息。我们仅能通过用户提交的信息合理地推测其是否为未成年人。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>3. 我们如何识别未成年用户</h2>
      <p>我们不实施强制性的年龄验证机制。我们通过以下方式识别潜在的未成年用户：</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>注册流程中的自我声明；</li>
        <li>用户个人资料中提供的信息（如年龄）；</li>
        <li>用户在使用我们服务过程中提交的其他合理指标。</li>
      </ul>
      <p>如果我们识别或合理怀疑某用户为未成年人，我们可能会要求提供额外的父母或监护人同意验证。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>4. 我们收集未成年用户的哪些信息</h2>
      <p>在获得父母或监护人同意的前提下，未成年用户可以使用我们的服务。我们收集与隐私政策中所述相同类别的信息，包括：</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>账户注册信息（电子邮箱地址、用户名、哈希加密密码）；</li>
        <li>可选的个人资料信息；</li>
        <li>社区活动数据（帖子、评论、评分、使用感受、私信）；</li>
        <li>通过百度统计收集的标准网络浏览数据；</li>
        <li>用户选择通过宝宝新天地（NewBabyWorld）OAuth 登录时的第三方账户信息。</li>
      </ul>
      <p>我们不会故意收集超出提供服务所必需范围的未成年人个人信息。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>5. 我们如何使用未成年用户的信息</h2>
      <p>我们将未成年用户的个人信息用于隐私政策中所述的相同目的，包括：</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>账户管理和身份验证；</li>
        <li>启用社区功能（广场参与、评分、使用感受、私信）；</li>
        <li>通过汇总分析数据改进服务；</li>
        <li>安全和反欺诈；</li>
        <li>法律合规。</li>
      </ul>
      <p>未经父母或监护人的额外同意，我们不会将未成年人的个人信息用于超出提供相关服务所必需的目的。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>6. 信息共享与披露</h2>
      <p>我们对未成年用户适用与隐私政策中所述相同的数据共享实践。具体而言：</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>我们<strong>不会</strong>出售任何用户（包括未成年人）的个人信息；</li>
        <li>我们<strong>不会</strong>与广告商或广告网络共享个人信息；</li>
        <li>身体测量数据仅在用户明确选择同意后才会传输给 DeepSeek 的 AI API（AI 推荐功能）；</li>
        <li>标准网络浏览数据由百度统计以汇总形式收集；</li>
        <li>用户选择通过宝宝新天地（NewBabyWorld）OAuth 登录时，第三方账户数据由宝宝新天地处理。</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>7. 信息存储与安全</h2>
      <p>我们使用与隐私政策中所述相同的安全措施存储未成年用户的个人信息，包括密码哈希、加密数据传输（HTTPS/TLS）和访问控制。我们仅在提供服务所必需或法律要求的期限内保留未成年用户的数据。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>8. 父母和监护人的权利</h2>
      <p>未成年用户的父母或法定监护人对其子女的个人信息享有以下权利：</p>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>查阅权：</strong>请求获取我们已收集的其子女个人信息的副本；</li>
        <li><strong>更正权：</strong>请求更正不准确的个人信息；</li>
        <li><strong>删除权：</strong>请求删除其子女的个人信息和账户；</li>
        <li><strong>限制处理权：</strong>请求限制我们对其子女个人信息的处理方式；</li>
        <li><strong>撤回同意权：</strong>随时撤回先前授予的同意。</li>
      </ul>
      <p>如需行使上述任何权利，请通过 <a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a> 联系我们。我们将在合理的时间内并依据适用法律回复您的请求。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>9. 发现未成年人时的处理措施</h2>
      <p>如果我们发现某用户为未成年人且未获得其父母或监护人的可验证同意，我们将采取以下措施：</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>及时限制该未成年用户访问需要个人信息的服务；</li>
        <li>通知该未成年用户的父母或监护人（如有联系方式）；</li>
        <li>在合理时间内删除该未成年人的个人信息，法律要求保留的除外；</li>
        <li>如无法获得父母或监护人的同意，将终止该未成年人的账户。</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>10. 对父母和监护人的建议</h2>
      <p>我们鼓励父母和监护人：</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>指导未成年人理解并使用我们的服务；</li>
        <li>监督未成年人的网络活动和互动；</li>
        <li>帮助未成年人理解保护个人信息的重要性；</li>
        <li>如认为其子女在未经同意的情况下提供了个人信息，请及时联系我们。</li>
      </ul>

      <h2 className="text-lg font-bold pt-2" style={h}>11. 本政策的更新</h2>
      <p>我们可能会不时更新本政策。当我们做出重大变更时，将在本页面发布更新后的政策并修订"最后更新日期"。我们鼓励父母和监护人定期审阅本政策。</p>

      <h2 className="text-lg font-bold pt-2" style={h}>12. 联系我们</h2>
      <p>如果您对本政策有任何疑问，或希望就未成年人的个人信息行使任何权利，请通过以下方式联系我们：</p>
      <p><strong>电子邮箱：</strong><a href="mailto:zhx589@outlook.com" style={link}>zhx589@outlook.com</a></p>
    </div>
  );
};

export default function MinorProtection() {
  return (
    <PageLayout hero={{ icon: 'fa-child', title: '未成年人个人信息保护政策 / Minor Personal Information Protection Policy', subtitle: '最后更新：2026年5月26日' }}>
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

      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'var(--primary)', color: 'white' }}>ENGLISH — OFFICIAL</span>
        </div>
        <div className="card">
          <EN />
        </div>
      </div>

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
