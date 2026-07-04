import { useNavigate, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { startNBWBind } from '../utils/nbwOAuth';

const NBW_LOGO = 'https://img.abdl-space.top/file/nbwlogo.png';

/**
 * NBWBindGuidePage — 注册完成后 NBW 绑定引导页
 * 三个选项：绑定已有 / 一键注册 / 跳过
 */
export default function NBWBindGuidePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const handleBindExisting = async () => {
    try {
      await startNBWBind();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleOneClickRegister = () => {
    navigate('/nbw-one-click-register');
  };

  const handleSkip = () => {
    navigate('/');
  };

  return (
    <PageLayout hero={{ icon: 'fa-link', title: '绑定宝宝新天地账户', subtitle: '深度合作平台，绑定后可使用更多功能' }}>
      <div className="card max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-5 p-3 rounded-lg" style={{ background: 'var(--input-bg)' }}>
          <img src={NBW_LOGO} alt="" className="w-10 h-10 rounded-lg object-contain" />
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>宝宝新天地 (NBW)</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>ABDL Space 深度合作平台</div>
          </div>
        </div>

        <p className="text-sm mb-5" style={{ color: 'var(--text-light)' }}>
          绑定宝宝新天地账户后，您可以在 ABDL Space 发帖并同步到宝宝新天地社区，享受更多互动体验。
        </p>

        <div className="mb-4 p-3 rounded-xl flex items-center gap-2" style={{ background: 'rgba(var(--danger-rgb, 211, 47, 47), 0.08)', border: '1px solid rgba(var(--danger-rgb, 211, 47, 47), 0.2)' }}>
          <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--danger)' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}>
            未绑定宝宝新天地账户将无法发帖
          </span>
        </div>

        <div className="space-y-3">
          {/* 选项1：绑定已有 NBW 账号 */}
          <button
            className="w-full flex items-center gap-3 p-4 rounded-lg transition-all hover:opacity-80"
            style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', cursor: 'pointer' }}
            onClick={handleBindExisting}
          >
            <i className="fa-solid fa-link text-lg" style={{ color: 'var(--primary-dark)' }} />
            <div className="text-left">
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>绑定已有 NBW 账号</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>如果您已有宝宝新天地账号，直接授权绑定</div>
            </div>
          </button>

          {/* 选项2：一键注册 NBW 新账号 */}
          <button
            className="w-full flex items-center gap-3 p-4 rounded-lg transition-all hover:opacity-80"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', cursor: 'pointer' }}
            onClick={handleOneClickRegister}
          >
            <i className="fa-solid fa-user-plus text-lg" style={{ color: 'var(--text-muted)' }} />
            <div className="text-left">
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>一键注册 NBW 新账号</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>快速创建宝宝新天地账号并绑定</div>
            </div>
          </button>

          {/* 选项3：暂时跳过 */}
          <button
            className="w-full flex items-center justify-center gap-2 p-3 rounded-lg transition-all hover:opacity-80"
            style={{ background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)' }}
            onClick={handleSkip}
          >
            <span className="text-sm">暂时跳过</span>
          </button>
        </div>

        <div className="mt-5 text-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            您可以稍后在 <Link to="/settings" style={{ color: 'var(--link-color)' }}>设置</Link> 中绑定
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
