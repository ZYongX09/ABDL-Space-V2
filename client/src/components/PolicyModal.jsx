import { useEffect } from 'react';
import { createPortal } from 'react-dom';

const POLICIES = {
  terms: {
    title: '用户协议',
    icon: 'fa-solid fa-file-contract',
    content: [
      '摘要版本：2026.10（2026年10月3日）。本服务仅向年满18周岁的成年人开放，请阅读下方完整用户协议。',
      '一、账户与使用：您应妥善保管账户信息，对账户下的所有行为负责。',
      '二、内容发布：您应遵守相关法律法规，不得发布违法、违规或侵犯他人权益的内容。',
      '三、隐私保护：我们重视您的隐私，按《隐私政策》处理您的个人信息。',
      '四、功能规则：第三方登录、宝宝认证、内容同步、云端小说及付费兑换依实际开放情况提供；付费权益以购买说明为准，依法处理争议。',
      '五、协议变更：重大变更将适当告知，依法需要同意的会另行征求同意；可通过 zhx589@outlook.com 申请注销或提出异议。',
    ],
  },
  privacy: {
    title: '隐私政策',
    icon: 'fa-solid fa-shield-halved',
    content: [
      '摘要版本：2026.10（2026年10月3日）。本说明不能替代完整隐私政策；英文为正式版本，中文为参考译文。',
      '一、必要信息：处理用户名、邮箱、密码哈希、登录凭证，以及提供服务和防滥用所需的网络、安全和使用记录。',
      '二、功能信息：QQ/宝宝新天地授权、认证照片与审核QQ、AI推荐、内容同步、推送、付费兑换及小说云端上传会涉及相应数据与第三方；不使用这些可选功能不必提供相应资料。',
      '三、本地与系统处理：Cookie和本地存储用于登录、偏好与缓存；App本地安全锁不向本站上传指纹或面容模板，Passkey公钥等认证资料会保存于服务端。',
      '四、第三方与公开：百度统计处理网页访问数据；App推送SDK可处理设备和网络信息；公开帖子和宝宝新天地同步副本可能被第三方保存。',
      '五、您的权利：可通过已有设置或 zhx589@outlook.com 申请查阅、更正、删除、副本、撤回授权及注销；退出、解绑或取消认证不等于删除历史数据，本站不承诺自动即时清除全部资料。',
    ],
  },
};

/**
 * 政策内嵌弹窗 — 用于内测预注册页面
 * 同时提供摘要与完整政策阅读入口
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
            以上仅为阅读摘要，请在确认同意前阅读完整政策。
          </p>
          <a
            href={policyKey === 'terms' ? '/terms' : policyKey === 'minor' ? '/minor-protection' : '/privacy'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 font-bold underline"
            style={{ color: 'var(--link-color)' }}
          >
            阅读完整{policy.title}（新窗口）
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
