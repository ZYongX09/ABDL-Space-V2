import { useEffect } from 'react';
import { createPortal } from 'react-dom';

const POLICIES = {
  terms: {
    title: '用户协议',
    icon: 'fa-solid fa-file-contract',
    content: [
      '欢迎使用 ABDL Space。在使用本服务前，请仔细阅读以下条款。',
      '一、账户与使用：您应妥善保管账户信息，对账户下的所有行为负责。',
      '二、内容发布：您应遵守相关法律法规，不得发布违法、违规或侵犯他人权益的内容。',
      '三、隐私保护：我们重视您的隐私，按《隐私政策》处理您的个人信息。',
      '四、内测期间：本服务处于内测预热阶段，部分功能可能不稳定或调整，恕不另行通知。',
      '五、协议变更：本协议可能根据运营需要更新，更新后将通过站内公告同步。',
    ],
  },
  privacy: {
    title: '隐私政策',
    icon: 'fa-solid fa-shield-halved',
    content: [
      '我们重视您的隐私，承诺按照适用的法律法规保护您的个人信息。',
      '一、信息收集：注册时收集用户名、邮箱、密码（加密存储）等必要信息。',
      '二、信息使用：仅用于账户识别、服务提供与安全保护，不向第三方出售。',
      '三、Cookie 使用：使用必要 Cookie 维持登录状态，详情见《Cookie 政策》。',
      '四、统计与监控：使用第三方统计服务（百度统计）了解站点使用情况。',
      '五、您的权利：您可随时查看、修改、删除个人信息，或注销账户。',
    ],
  },
};

/**
 * 政策内嵌弹窗 — 用于内测预注册页面
 * 不提供任何页面跳转链接，仅显示当前阶段的简化说明
 */
export default function PolicyModal({ policyKey, onClose }) {
  const policy = POLICIES[policyKey];

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!policy) return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={policy.title}>
      <div
        className="modal miui-card-in"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '560px', maxHeight: '85vh', padding: '24px', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex items-center justify-between mb-4" style={{ flexShrink: 0 }}>
          <h3 className="font-bold text-lg flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <i className={policy.icon} style={{ color: 'var(--primary-dark)' }} />
            {policy.title}
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem', padding: 4 }}
            aria-label="关闭"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', color: 'var(--text-light)', fontSize: '0.875rem', lineHeight: 1.7, paddingRight: '4px' }}>
          {policy.content.map((p, i) => (
            <p key={i} className="mb-3" style={{ color: 'var(--text)' }}>{p}</p>
          ))}
          <p
            className="mt-4 pt-3"
            style={{ color: 'var(--text-muted)', fontSize: '0.75rem', borderTop: '1px solid var(--border)' }}
          >
            以上为内测预注册阶段的简化说明。完整版将在内测正式开放时同步。
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
