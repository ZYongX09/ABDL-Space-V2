/**
 * RichContent - 识别文本中的 URL，渲染为带图标的超链接
 */
import { useMemo } from 'react';

// URL 正则
const URL_RE = /(https?:\/\/[^\s<>"'`,;)}\]]+)/gi;

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function LinkChunk({ url }) {
  const domain = getDomain(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium transition-all hover:opacity-80"
      style={{
        background: 'var(--input-bg)',
        color: 'var(--link-color)',
        textDecoration: 'none',
        border: '1px solid var(--border)',
        verticalAlign: 'baseline',
      }}
    >
      <i className="fa-solid fa-link" style={{ fontSize: '0.65rem' }} />
      <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {domain}
      </span>
    </a>
  );
}

export default function RichContent({ text, className, style }) {
  const parts = useMemo(() => {
    if (!text) return [];
    const result = [];
    let lastIndex = 0;
    let match;

    // 重置正则状态
    URL_RE.lastIndex = 0;

    while ((match = URL_RE.exec(text)) !== null) {
      // URL 前的纯文本
      if (match.index > lastIndex) {
        result.push({ type: 'text', value: text.slice(lastIndex, match.index) });
      }
      result.push({ type: 'link', value: match[1] });
      lastIndex = match.index + match[0].length;
    }

    // 剩余纯文本
    if (lastIndex < text.length) {
      result.push({ type: 'text', value: text.slice(lastIndex) });
    }

    return result;
  }, [text]);

  if (parts.length === 0) return <span className={className} style={style}>{text}</span>;

  return (
    <span className={className} style={style}>
      {parts.map((p, i) =>
        p.type === 'link'
          ? <LinkChunk key={i} url={p.value} />
          : <span key={i}>{p.value}</span>
      )}
    </span>
  );
}
