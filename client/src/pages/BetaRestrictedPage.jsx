import { useNavigate } from 'react-router-dom';
import { useBetaMode } from '../contexts/BetaModeContext';

const LOGO_ICON = 'https://img.abdl-space.top/file/1779879250278_ABDL_icon.svg';

export default function BetaRestrictedPage() {
  const navigate = useNavigate();
  const { config } = useBetaMode();

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="card miui-card-in max-w-md w-full"
        style={{ padding: '40px 32px', textAlign: 'center' }}
      >
        {/* 图标 */}
        <div
          className="mx-auto mb-6 miui-float"
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary-light), var(--primary))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px var(--primary-glow)',
          }}
        >
          <img
            src={LOGO_ICON}
            alt="ABDL Space"
            style={{ width: 48, height: 48 }}
          />
        </div>

        {/* 标题 */}
        <h1
          className="text-xl font-bold mb-3"
          style={{ color: 'var(--text)' }}
        >
          内测进行中
        </h1>

        {/* 描述 */}
        <p
          className="text-sm mb-6 leading-relaxed"
          style={{ color: 'var(--text-light)' }}
        >
          {config.message || '产品正在内测中，请登录后访问'}
        </p>

        {/* 提示信息 */}
        <div
          className="mb-6 p-3 rounded-xl"
          style={{
            background: 'var(--primary-light)',
            border: '1px solid var(--border)',
          }}
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-circle-info mr-1.5" style={{ color: 'var(--primary-dark)' }} />
            管理员可正常访问所有功能
          </p>
        </div>

        {/* 登录按钮 */}
        <button
          className="btn btn-primary w-full miui-press"
          onClick={() => navigate('/login', { state: { from: window.location.pathname } })}
        >
          <i className="fa-solid fa-right-to-bracket mr-2" />
          登录
        </button>

        {/* 返回首页 */}
        <button
          className="btn btn-ghost w-full mt-3"
          onClick={() => navigate('/')}
          style={{ color: 'var(--text-muted)' }}
        >
          <i className="fa-solid fa-house mr-2" />
          返回首页
        </button>
      </div>
    </div>
  );
}
