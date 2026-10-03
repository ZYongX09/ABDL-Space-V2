import PageLayout from '../components/PageLayout';
import { termsOfService } from '../legal/termsOfService.js';

export default function TermsOfService() {
  const text = { color: 'var(--text-light)' };
  const heading = { color: 'var(--text)' };
  const link = { color: 'var(--link-color)' };

  return (
    <PageLayout hero={{
      icon: 'fa-file-contract',
      title: termsOfService.title,
      subtitle: `最后更新：${termsOfService.updatedAt} · 版本 ${termsOfService.version}`,
    }}>
      <article className="card space-y-6 text-sm leading-relaxed break-words" style={text} aria-label="用户协议正文">
        <header id="terms-top" style={{ scrollMarginTop: '6rem' }}>
          <p><strong style={heading}>版本：</strong>{termsOfService.version}</p>
          <p><strong style={heading}>更新日期：</strong><time dateTime={termsOfService.updatedAt}>{termsOfService.updatedAt}</time></p>
          <p><strong style={heading}>生效日期：</strong><time dateTime={termsOfService.effectiveAt}>{termsOfService.effectiveAt}</time></p>
          <p><strong style={heading}>运营方：</strong>{termsOfService.operator}</p>
        </header>

        <aside className="p-4 rounded-xl space-y-2" style={{ background: 'var(--primary-light)' }} aria-labelledby="terms-notice-title">
          <h2 id="terms-notice-title" className="text-lg font-bold" style={heading}>重要提示</h2>
          {termsOfService.notices.map(notice => <p key={notice}><strong style={heading}>{notice}</strong></p>)}
        </aside>

        <nav aria-labelledby="terms-directory-title">
          <h2 id="terms-directory-title" className="text-lg font-bold mb-3" style={heading}>协议目录</h2>
          <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {termsOfService.sections.map(section => (
              <li key={section.id}>
                <a className="underline underline-offset-4 inline-block py-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href={`#terms-${section.id}`} style={link}>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {termsOfService.sections.map((section, sectionIndex) => (
          <section key={section.id} id={`terms-${section.id}`} className="space-y-3" style={{ scrollMarginTop: '6rem' }} aria-labelledby={`terms-${section.id}-title`}>
            <h2 id={`terms-${section.id}-title`} className="text-lg font-bold pt-2" style={heading}>{section.title}</h2>
            {section.clauses.map((clause, clauseIndex) => (
              <p key={clauseIndex}>
                {clause.important ? (
                  <strong style={heading}>{sectionIndex + 1}.{clauseIndex + 1} {clause.text}</strong>
                ) : (
                  <>{sectionIndex + 1}.{clauseIndex + 1} {clause.text}</>
                )}
              </p>
            ))}
          </section>
        ))}

        <footer className="space-y-3">
          <p>
            信息处理详情请参阅{' '}
            <a href="/privacy" className="underline underline-offset-4" style={link}>《隐私政策》</a>{' '}和{' '}
            <a href="/cookies" className="underline underline-offset-4" style={link}>《Cookie政策》</a>。
          </p>
          <p>联系邮箱：<a href={`mailto:${termsOfService.email}`} className="underline underline-offset-4" style={link}>{termsOfService.email}</a></p>
          <p className="p-4 rounded-xl font-bold" style={{ ...heading, background: 'var(--primary-light)' }}>{termsOfService.closingNotice}</p>
          <a href="#terms-top" className="underline underline-offset-4 inline-block py-2" style={link}>返回协议顶部</a>
        </footer>
      </article>
    </PageLayout>
  );
}
