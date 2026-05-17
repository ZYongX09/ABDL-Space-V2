/**
 * RichContent - 识别文本中的 URL，渲染为带图标的超链接
 */
import { useMemo } from 'react';

// 常见顶级域名
const TLDS = 'com|net|org|cn|top|xyz|io|dev|app|co|me|cc|info|edu|gov|mil|club|online|site|tech|store|blog|work|live|video|social|design|shop|icu|ltd|fun|space|host|press|link|click|buzz|pro|vip|wang|ren|中国|公司|网络';

// 从文本中提取所有 URL
function extractUrls(text) {
  const results = [];
  // 匹配 https?:// 开头的 URL
  const re1 = /https?:\/\/[^\s<>"'`,;)}\]]+/gi;
  let m;
  while ((m = re1.exec(text)) !== null) {
    results.push({ index: m.index, raw: m[0] });
  }
  // 匹配 www. 开头的 URL
  const re2 = /www\.[^\s<>"'`,;)}\]]+/gi;
  while ((m = re2.exec(text)) !== null) {
    // 避免重复（如果已经被 re1 匹配过）
    if (!results.some(r => r.index <= m.index && r.index + r.raw.length >= m.index + m[0].length)) {
      results.push({ index: m.index, raw: m[0] });
    }
  }
  // 匹配裸域名（如 example.com/path）
  const domainRe = new RegExp(`(?:^|[\\s<>"'\`,;)}\\]])([a-zA-Z0-9][a-zA-Z0-9-]*\\.(?:${TLDS})(?:/[^\\s<>"'\`,;)}\\]]*)?)`, 'gi');
  while ((m = domainRe.exec(text)) !== null) {
    const url = m[1];
    const idx = m.index + m[0].length - url.length;
    // 避免重复
    if (!results.some(r => r.index <= idx && r.index + r.raw.length >= idx + url.length)) {
      results.push({ index: idx, raw: url });
    }
  }
  // 按位置排序
  results.sort((a, b) => a.index - b.index);
  return results;
}

// 清理 URL 末尾的标点符号
function cleanUrl(url) {
  // 逐步去掉末尾的标点，直到最后一个有效字符
  let cleaned = url;
  while (cleaned.length > 0 && /[.,;:!?)}\]'"_~]$/.test(cleaned)) {
    // 但如果末尾是 ) 且 URL 中有 (，可能是合法的括号匹配
    if (cleaned.endsWith(')') && (cleaned.match(/\(/g) || []).length < (cleaned.match(/\)/g) || []).length) {
      cleaned = cleaned.slice(0, -1);
    } else if (cleaned.endsWith(')')) {
      break;
    } else {
      cleaned = cleaned.slice(0, -1);
    }
  }
  return cleaned;
}

function getDomain(url) {
  try {
    const fullUrl = url.startsWith('http') ? url : 'https://' + url;
    return new URL(fullUrl).hostname.replace(/^www\./, '');
  } catch { return ''; }
}

function normalizeUrl(url) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return 'https://' + url;
}

function LinkChunk({ url }) {
  const domain = getDomain(url);
  const href = normalizeUrl(url);
  return (
    <a
      href={href}
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

    const urls = extractUrls(text);
    if (urls.length === 0) return [{ type: 'text', value: text }];

    const result = [];
    let lastIndex = 0;

    for (const { index, raw } of urls) {
      const cleaned = cleanUrl(raw);
      if (cleaned.length === 0) continue;

      // URL 前的纯文本
      if (index > lastIndex) {
        result.push({ type: 'text', value: text.slice(lastIndex, index) });
      }
      result.push({ type: 'link', value: cleaned });
      lastIndex = index + cleaned.length;
    }

    // 剩余纯文本
    if (lastIndex < text.length) {
      result.push({ type: 'text', value: text.slice(lastIndex) });
    }

    return result;
  }, [text]);

  if (parts.length === 0) return <span className={className} style={style}>{text}</span>;

  // 检查是否包含链接，如果没有链接则直接返回纯文本 span
  const hasLinks = parts.some(p => p.type === 'link');
  if (!hasLinks) return <span className={className} style={style}>{text}</span>;

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
