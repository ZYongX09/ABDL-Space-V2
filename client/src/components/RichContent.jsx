/**
 * RichContent - 识别文本中的 URL，渲染为带图标的超链接
 */
import { useMemo } from 'react';

// 常见顶级域名
const TLDS = 'com|net|org|cn|top|xyz|io|dev|app|co|me|cc|info|edu|gov|mil|club|online|site|tech|store|blog|work|live|video|social|design|shop|icu|ltd|fun|space|host|press|link|click|buzz|pro|vip|wang|ren';

// 需要从 URL 末尾剥离的字符
const TRAILING_PUNCT = '.,;:!?_~。，；：！？、';

// 清理 URL 末尾的标点符号
function cleanUrl(url) {
  let s = url;
  for (let i = 0; i < 20; i++) {
    if (s.length === 0) break;
    const ch = s[s.length - 1];
    if (TRAILING_PUNCT.includes(ch)) { s = s.slice(0, -1); continue; }
    if (ch === ')') {
      if ((s.match(/\)/g) || []).length > (s.match(/\(/g) || []).length) { s = s.slice(0, -1); continue; }
    }
    if (ch === ']') {
      if ((s.match(/\]/g) || []).length > (s.match(/\[/g) || []).length) { s = s.slice(0, -1); continue; }
    }
    if (ch === '}') {
      if ((s.match(/}/g) || []).length > (s.match(/{/g) || []).length) { s = s.slice(0, -1); continue; }
    }
    if (ch === '"' || ch === "'" || ch === '`') { s = s.slice(0, -1); continue; }
    break;
  }
  return s;
}

// 从文本中提取所有 URL
function extractUrls(text) {
  const results = [];
  let m;

  // 1) https?:// 开头
  const re1 = /https?:\/\/[^\s<>"'`,;)}\]\u3000-\u303f\uff00-\uffef\u4e00-\u9fff]+/gi;
  while ((m = re1.exec(text)) !== null) {
    results.push({ index: m.index, raw: m[0] });
  }

  // 2) www. 开头
  const re2 = /www\.[^\s<>"'`,;)}\]\u3000-\u303f\uff00-\uffef\u4e00-\u9fff]+/gi;
  while ((m = re2.exec(text)) !== null) {
    const already = results.some(r => r.index <= m.index && r.index + r.raw.length >= m.index + m[0].length);
    if (!already) results.push({ index: m.index, raw: m[0] });
  }

  // 3) 裸域名：前面是行首、空白、中文字符或常见标点
  //    中文字符范围: \u4e00-\u9fff (CJK统一汉字), \u3000-\u303f (CJK标点), \uff00-\uffef (全角符号)
  const delim = '(?:^|[\\s\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef.,;:!?(\\[{"])';
  const domainBody = `[a-zA-Z0-9][a-zA-Z0-9-]*\\.(?:${TLDS})(?:/[^\\s<>"'\`,;)}\\]]*)?`;
  const domainRe = new RegExp(delim + '(' + domainBody + ')', 'gi');
  while ((m = domainRe.exec(text)) !== null) {
    const url = m[1];
    const idx = m.index + m[0].length - url.length;
    const already = results.some(r => r.index <= idx && r.index + r.raw.length >= idx + url.length);
    if (!already) results.push({ index: idx, raw: url });
  }

  results.sort((a, b) => a.index - b.index);
  return results;
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
    if (urls.length === 0) return [];

    const result = [];
    let lastIndex = 0;

    for (const { index, raw } of urls) {
      const cleaned = cleanUrl(raw);
      if (cleaned.length === 0) continue;

      if (index > lastIndex) {
        result.push({ type: 'text', value: text.slice(lastIndex, index) });
      }
      result.push({ type: 'link', value: cleaned });
      lastIndex = index + cleaned.length;
    }

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
