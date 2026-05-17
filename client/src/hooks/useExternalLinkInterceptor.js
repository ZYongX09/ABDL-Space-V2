import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * 全局劫持所有外链 <a> 标签
 * 点击时跳转到 /external?url=... 提醒页
 */
export function useExternalLinkInterceptor() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      // 找到最近的 <a> 标签
      const a = e.target.closest('a');
      if (!a) return;

      const href = a.getAttribute('href');
      if (!href) return;

      // 跳过已经是 external 链接的
      if (href.startsWith('/external')) return;

      // 跳过站内链接、锚点、javascript:、mailto:、tel:
      if (
        href.startsWith('#') ||
        href.startsWith('javascript:') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) return;

      // 判断是否外链：有 target="_blank" 或 href 以 http 开头且不是当前域名
      const isExternal =
        a.target === '_blank' ||
        (href.startsWith('http') && !href.startsWith(window.location.origin));

      if (!isExternal) return;

      // 拦截，跳转到提醒页
      e.preventDefault();
      e.stopPropagation();
      navigate(`/external?url=${encodeURIComponent(href)}`);
    };

    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [navigate]);
}
