import { useState } from 'react';
import PageLayout from '../components/PageLayout';
import {
  privacyPolicyMeta,
  privacyPolicyNotice,
  privacyPolicySensitiveNotice,
  privacyPolicySections,
  privacyPolicyContents,
} from '../legal/privacyPolicy';

function PolicySection({ section, language, nested = false }) {
  const Heading = nested ? 'h3' : 'h2';
  const titleId = `${section.id}-title`;

  return (
    <section
      id={section.id}
      aria-labelledby={titleId}
      className={section.service ? 'privacy-policy-service' : 'privacy-policy-section'}
    >
      <Heading id={titleId} className={nested ? 'text-base font-bold' : 'text-lg font-bold'}>
        {section.number}. {section.title[language]}
      </Heading>
      {section.sensitive && (
        <p className="privacy-policy-sensitive font-semibold">
          {language === 'zh' ? '敏感信息 · 请仅提供必要内容，注意单独同意' : 'Sensitive information · minimize disclosure; separate consent matters'}
        </p>
      )}
      {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph[language]}</p>)}
      {section.links && (
        <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-3 list-none" aria-label={language === 'zh' ? '相关链接' : 'Related links'}>
          {section.links.map(link => (
            <li key={link.href}>
              <a href={link.href} {...(link.href.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {link.label[language]}{link.href.startsWith('https://') ? (language === 'zh' ? '（新窗口）' : ' (new window)') : ''}
              </a>
            </li>
          ))}
        </ul>
      )}
      {section.children?.map(child => <PolicySection key={child.id} section={child} language={language} nested />)}
    </section>
  );
}

export default function PrivacyPolicy() {
  const [language, setLanguage] = useState(privacyPolicyMeta.defaultLanguage);
  const isChinese = language === 'zh';

  return (
    <PageLayout hero={{ icon: 'fa-shield-halved', title: 'Privacy Policy / 隐私政策', subtitle: `更新 / 生效：${privacyPolicyMeta.updated} · 版本 ${privacyPolicyMeta.version} · 18+` }}>
      <style>{`
        .privacy-policy { color: var(--text); overflow-wrap: anywhere; line-height: 1.8; }
        .privacy-policy a { color: var(--link-color); text-decoration: underline; text-underline-offset: .2em; }
        .privacy-policy a:focus-visible, .privacy-policy button:focus-visible {
          outline: 2px solid var(--link-color); outline-offset: 4px;
        }
        .privacy-policy-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: 1rem; padding: 1rem; }
        .privacy-policy-notice { background: var(--warning-bg, var(--input-bg)); border: 2px solid var(--warning); }
        .privacy-policy-sensitive { border-left: 3px solid var(--warning); padding-left: .75rem; }
        .privacy-policy-section { margin-top: 1.75rem; }
        .privacy-policy-section, .privacy-policy-service, #privacy-policy-top { scroll-margin-top: 6rem; }
        .privacy-policy-service { margin-top: 1.25rem; background: var(--input-bg); border: 1px solid var(--border); border-radius: .75rem; padding: 1rem; }
        .privacy-policy-section p, .privacy-policy-service p { margin-top: .75rem; }
        .privacy-policy-reader { max-width: 76ch; margin-inline: auto; }
        .privacy-policy-toc { display: grid; gap: .25rem 1.5rem; }
        .privacy-policy-toc a { display: block; padding-block: .4rem; }
        .privacy-policy button { min-height: 44px; padding: .5rem 1rem; border: 1px solid var(--border); border-radius: .75rem; color: var(--text); background: var(--input-bg); }
        .privacy-policy button[aria-pressed="true"] { background: var(--primary-light); border-color: var(--link-color); font-weight: 700; }
        @media (min-width: 640px) {
          .privacy-policy-box { padding: 1.5rem; }
          .privacy-policy-toc { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
      <div className="privacy-policy space-y-5 text-sm" id="privacy-policy-top">
        <aside className="privacy-policy-box privacy-policy-notice space-y-2" aria-label="正式语言声明 / Official language notice">
          <h2 className="font-bold text-base">英文正式 · 中文 AI 参考 / English official · Chinese AI reference</h2>
          <p lang="zh-CN">{privacyPolicyNotice.zh}</p>
          <p lang="en">{privacyPolicyNotice.en}</p>
        </aside>

        <div className="flex flex-wrap gap-3" role="group" aria-label="阅读语言 / Reading language">
          <button type="button" lang="zh-CN" aria-pressed={isChinese} aria-controls="privacy-policy-document" onClick={() => setLanguage('zh')}>中文 · AI 参考</button>
          <button type="button" lang="en" aria-pressed={!isChinese} aria-controls="privacy-policy-document" onClick={() => setLanguage('en')}>English · Official</button>
        </div>
        <p aria-live="polite" lang={isChinese ? 'zh-CN' : 'en'} className="font-semibold">
          {isChinese ? '当前阅读：中文 AI 参考译文；正式版本请切换 English。' : 'Reading: English — the sole official version.'}
        </p>

        <div id="privacy-policy-document" lang={isChinese ? 'zh-CN' : 'en'} className="space-y-5">
          <div className="privacy-policy-box space-y-2">
            <p><strong>{isChinese ? '最后更新：' : 'Last updated: '}</strong><time dateTime={privacyPolicyMeta.updated}>{privacyPolicyMeta.updated}</time></p>
            <p><strong>{isChinese ? '生效日期：' : 'Effective date: '}</strong><time dateTime={privacyPolicyMeta.effective}>{privacyPolicyMeta.effective}</time></p>
            <p><strong>{isChinese ? '版本：' : 'Version: '}</strong>{privacyPolicyMeta.version} · {privacyPolicyMeta.operator} · 18+</p>
            <p><strong>{isChinese ? '联系：' : 'Contact: '}</strong><a href={`mailto:${privacyPolicyMeta.contact}`}>{privacyPolicyMeta.contact}</a></p>
          </div>

          <aside className="privacy-policy-box privacy-policy-notice" aria-label={isChinese ? '敏感信息提示' : 'Sensitive information notice'}>
            <p className="font-semibold">{privacyPolicySensitiveNotice[language]}</p>
          </aside>

          <nav className="privacy-policy-box" aria-labelledby="privacy-policy-contents-title">
            <h2 id="privacy-policy-contents-title" className="text-base font-bold mb-3">{isChinese ? '完整目录' : 'Complete contents'}</h2>
            <ol className="privacy-policy-toc list-none">
              {privacyPolicyContents.map(entry => (
                <li key={entry.id} style={{ paddingInlineStart: entry.number.includes('.') ? '1rem' : 0 }}>
                  <a href={`#${entry.id}`}>{entry.number}. {entry.title[language]}</a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="privacy-policy-box" aria-label={isChinese ? '隐私政策中文参考正文' : 'Official English privacy policy'}>
            <div className="privacy-policy-reader">
              {privacyPolicySections.map(section => <PolicySection key={section.id} section={section} language={language} />)}
              <p className="mt-6"><a href="#privacy-policy-top">{isChinese ? '返回顶部与语言选择' : 'Back to top and language selection'}</a></p>
            </div>
          </article>
        </div>
      </div>
    </PageLayout>
  );
}
