import { useSearchParams, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';

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
  try { return new URL(url).hostname; } catch { return ''; }
}

function isTrusted(url) {
  const domain = getDomain(url);
  return TRUSTED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d));
}

export default function ExternalLink() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const url = params.get('url') || '';
  const domain = getDomain(url);
  const trusted = isTrusted(url);

  if (!url || !domain) {
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
          {url}
        </p>

        <div className="flex items-center justify-center gap-3">
          <button className="btn btn-outline" onClick={() => navigate('/')}>
            <i className="fa-solid fa-arrow-left" /> 返回首页
          </button>
          <button className="btn btn-primary" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>
            继续访问 <i className="fa-solid fa-arrow-up-right-from-square ml-1" />
          </button>
        </div>
      </div>
    </PageLayout>
  );
}
