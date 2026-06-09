/**
 * 邮箱部分隐藏工具
 * 完整：  zyongx123@gmail.com
 * 显示：  z********3@g***l.com
 */
export function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const atIdx = email.indexOf('@');
  if (atIdx < 0) return '***';
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (!domain) return '***';

  // 本地部分：首尾各保留 1 字符，中间替换为 *
  let maskedLocal;
  if (local.length <= 2) {
    maskedLocal = '*'.repeat(local.length);
  } else {
    const innerLen = Math.min(local.length - 2, 8);
    maskedLocal = local[0] + '*'.repeat(innerLen) + local[local.length - 1];
  }

  // 域名：保留首末字符 + TLD，中间替换
  const lastDot = domain.lastIndexOf('.');
  let maskedDomain;
  if (lastDot < 0) {
    if (domain.length <= 2) {
      maskedDomain = domain.length === 0 ? '*' : domain[0] + (domain.length === 2 ? domain[1] : '');
    } else {
      const innerLen = Math.min(domain.length - 2, 4);
      maskedDomain = domain[0] + '*'.repeat(innerLen) + domain[domain.length - 1];
    }
  } else {
    const tld = domain.slice(lastDot + 1);
    const main = domain.slice(0, lastDot);
    if (main.length <= 1) {
      maskedDomain = main + '.' + tld;
    } else {
      const innerLen = Math.min(main.length - 2, 4);
      maskedDomain = main[0] + '*'.repeat(innerLen) + main[main.length - 1] + '.' + tld;
    }
  }

  return `${maskedLocal}@${maskedDomain}`;
}
