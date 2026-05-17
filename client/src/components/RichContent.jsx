/**
 * RichContent - 识别文本中的 URL，渲染为带图标的超链接
 */
import { useMemo } from 'react';

// 常见顶级域名
const TLDS = 'com|net|org|cn|top|xyz|io|dev|app|co|me|cc|info|edu|gov|mil|club|online|site|tech|store|blog|work|live|video|social|design|shop|icu|ltd|fun|space|host|press|link|click|buzz|pro|vip|wang|ren';

// 清理 URL 末尾的标点符号
function cleanUrl(url) {
  let s = url;
  // 循环去掉末尾标点
  for (let i = 0; i < 10; i++) {
    if (s.length === 0) break;
    const ch = s[s.length - 1];
    // 直接去掉的标点
    if ('.,;:!?_~'.includes(ch)) { s = s.slice(0, -1); continue; }
    // 括号：只有多余的右括号才去掉
    if (ch === ')') {
      const opens = (s.match(/\(/g) || []).length;
      const closes = (s.match(/\)/g) || []).length;
      if (closes > opens) { s = s.slice(0, -1); continue; }
    }
    // 方括号、花括号同理
    if (ch === ']') {
      const opens = (s.match(/\[/g) || []).length;
      const closes = (s.match(/\]/g) || []).length;
      if (closes > opens) { s = s.slice(0, -1); continue; }
    }
    if (ch === '}') {
      const opens = (s.match(/{/g) || []).length;
      const closes = (s.match(/}/g) || []).length;
      if (closes > opens) { s = s.slice(0, -1); continue; }
    }
    // 引号：直接去掉
    if (ch === '"' || ch === "'" || ch === '`') { s = s.slice(0, -1); continue; }
    // 其他字符不动
    break;
  }
  return s;
}

// 从文本中提取所有 URL
function extractUrls(text) {
  const results = [];

  // 1) https?:// 开头
  const re1 = /https?:\/\/[^\s<>"'`,;)}\]]+/gi;
  let m;
  while ((m = re1.exec(text)) !== null) {
    results.push({ index: m.index, raw: m[0] });
  }

  // 2) www. 开头
  const re2 = /www\.[^\s<>"'`,;)}\]]+/gi;
  while ((m = re2.exec(text)) !== null) {
    const already = results.some(r => r.index <= m.index && r.index + r.raw.length >= m.index + m[0].length);
    if (!already) results.push({ index: m.index, raw: m[0] });
  }

  // 3) 裸域名（前面必须是空白或行首）
  const domainRe = new RegExp(`(?:^|\\s)([a-zA-Z0-9][a-zA-Z0-9-]*\\.(?:${TLDS})(?:/[^\\s<>"'\`,;)}\\]]*)?)`, 'gi');
  while ((m = domainRe.exec(text)) !== null) {
    const url = m[1];
    const idx = m.index + m[0].length - url.length;
    const already = results.some(r => r.index <= idx && r.index + r.raw.length >= idx + url.length);
    if (!already) results.push({ index: idx, raw: url });
  }

  // 按位置排序
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

      // URL 前的纯文本
      if (index > lastIndex) {
        result.push({ type: 'text', value: text.slice(lastIndex, index) });
      }
      result.push({ type: 'link', value: cleaned });
      // 关键：用 cleaned 的实际长度推进 lastIndex
      lastIndex = index + cleaned.length;
    }

    // 剩余纯文本
    if (lastIndex < text.length) {
      result.push({ type: 'text', value: text.slice(lastIndex) });
    }

    return result;
  }, [text]);

  // 没有链接直接返回纯文本
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
