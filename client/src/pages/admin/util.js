/**
 * 管理控制台通用工具 — 时间/数字格式化（兼容 D1 文本时间戳与 unix 秒）
 */

// 解析后端返回的时间：'YYYY-MM-DD HH:MM:SS'（UTC 文本）、ISO、或 unix 秒
export function parseTs(v) {
  if (!v) return null;
  if (typeof v === 'number') return new Date(v * 1000);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v)) return new Date(v.replace(' ', 'T') + 'Z');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(v + 'T00:00:00Z');
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');

export function fmtDT(v, withYear = false) {
  const d = parseTs(v);
  if (!d) return '-';
  if (withYear) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtFull(v) {
  const d = parseTs(v);
  if (!d) return '-';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relTime(v) {
  const d = parseTs(v);
  if (!d) return '-';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return fmtDT(v, true);
}

export function fmtNum(n) {
  const x = Number(n) || 0;
  if (x >= 1000000) return (x / 1000000).toFixed(1) + 'M';
  if (x >= 10000) return (x / 10000).toFixed(1) + '万';
  if (x >= 1000) return (x / 1000).toFixed(1) + 'k';
  return String(x);
}

/** 变化率：cur 相对 prev 的百分比（prev<=0 时返回 null 表示无参照） */
export function pctDelta(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (p <= 0) return c > 0 ? null : 0;
  return Math.round(((c - p) / p) * 100);
}

/** 在 [min,max] 间取归一化位置（图表用） */
export function clamp01(v, min, max) {
  if (max === min) return 0.5;
  return (v - min) / (max - min);
}