import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { getNBWEndpointState, isNBWSensitiveURL, resolveNBWDisplayURL } from '../utils/nbwEndpoints.js';
import { useNBWEndpoints } from '../utils/useNBWEndpoints.js';

const TRUSTED_DOMAINS = [
  'github.com',
  'ifdian.net',
  'zhx-blog.top',
  'baidu.com',
  'abdl-space.top',
  'vercel.app',
  'cloudflare.com',
];

function getDomain(url) {
  try { return new URL(url).hostname; } catch {}
  // 相对路径 → 当前域名
  try { return new URL(url, window.location.origin).hostname; } catch {}
  return '';
}

function resolveUrl(url) {
  try { new URL(url); return url; } catch {}
  try { return new URL(url, window.location.origin).href; } catch {}
  return '';
}

function isTrusted(url) {
  const domain = getDomain(url);
  return TRUSTED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

export default function ExternalLink() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const rawUrl = params.get('url') || '';
  const sourceURL = resolveUrl(rawUrl);
  const { endpoints } = useNBWEndpoints();
  const sensitive = isNBWSensitiveURL(sourceURL);
  const url = sensitive ? undefined : resolveNBWDisplayURL(sourceURL, endpoints);
  const waiting = !url && !!sourceURL;
  const domain = getDomain(url || sourceURL);
  const trusted = isTrusted(url || sourceURL);
  const sponsorPurchase = domain === 'ifdian.net' && new URL(url).pathname === '/order/create' && new URL(url).searchParams.get('product_type') === '1';

  if (!sourceURL || !domain) {
    return (
      <PageLayout hero={{ icon: 'fa-link-slash', title: '无效链接', subtitle: '目标地址不存在' }}>
        <div className="card text-center py-8">
          <p className="text-sm mb-4" style={{ color: 'var(--text-light)' }}>无法解析目标链接</p>
          <button className="btn btn-outline" onClick={() => navigate('/')}>返回首页</button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout hero={{
      icon: trusted ? 'fa-up-right-from-square' : 'fa-triangle-exclamation',
      title: '即将离开 ABDL Space',
      subtitle: trusted ? '外部链接提醒' : '⚠️ 安全警告',
    }}>
      <div className="card max-w-md mx-auto text-center py-8">
        {!trusted && (
          <div className="mb-5 p-3 rounded-xl text-xs text-left" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
            <i className="fa-solid fa-shield-halved mr-1.5" />
            <strong>安全提醒：</strong>该链接指向未知网站，请注意保护个人信息和账户安全。
          </div>
        )}

        <div className="mb-2">
          <i className={`fa-solid ${trusted ? 'fa-arrow-up-right-from-square' : 'fa-exclamation-circle'} text-2xl`}
            style={{ color: trusted ? 'var(--primary-dark)' : '#ef4444' }} />
        </div>

        <p className="text-sm mb-2" style={{ color: 'var(--text-light)' }}>
          你即将跳转到：
        </p>
        <p className="text-sm font-semibold mb-1 break-all" style={{ color: 'var(--text)' }}>
          {domain}
        </p>
        <p className="text-xs mb-6 break-all" style={{ color: 'var(--text-muted)' }}>
          {waiting ? sensitive ? '授权链接不能从公开外链页继续，请从当前站点重新发起授权。' : '正在确认宝宝新天地地址，请刷新配置后继续。' : url}
        </p>

        {sponsorPurchase && (
          <div className="mb-5 text-sm" style={{ color: 'var(--text-light)' }}>
            <p className="mb-3">付款后请点击爱发电的私信按钮获取兑换码。返回本站不表示权益已激活，请回赞助者中心兑换。</p>
            <Link to="/sponsors" className="btn btn-outline">返回赞助者中心兑换</Link>
          </div>
        )}
        <div className="flex items-center justify-center gap-3">
          <button className="btn btn-outline" onClick={() => navigate('/')}>
            <i className="fa-solid fa-arrow-left" /> 返回首页
          </button>
          <button className="btn btn-primary" disabled={waiting} onClick={() => {
            const current = isNBWSensitiveURL(sourceURL) ? undefined : resolveNBWDisplayURL(sourceURL, getNBWEndpointState().endpoints);
            if (current) window.open(current, '_blank', 'noopener,noreferrer');
          }}>
            继续访问 <i className="fa-solid fa-arrow-up-right-from-square ml-1" />
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
