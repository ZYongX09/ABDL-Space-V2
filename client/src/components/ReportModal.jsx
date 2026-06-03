import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { reportsAPI } from '../api';

const REASONS = [
  { value: 'nsfw', label: '敏感/色情内容', icon: 'fa-solid fa-eye-slash' },
  { value: 'spam', label: '垃圾广告', icon: 'fa-solid fa-ban' },
  { value: 'other', label: '其他原因', icon: 'fa-solid fa-flag' },
];

export default function ReportModal({ targetType, targetId, onClose }) {
  const { user } = useAuth();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // BUG-676: ESC key to close + BUG-678: lock body scroll + BUG-542: side effects in useEffect
  useEffect(() => {
    if (!user) {
      toast.error('请先登录');
      onClose();
      return;
    }
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, user, toast]);

  if (!user) return null;

  const handleSubmit = async () => {
    if (!reason) { toast.error('请选择举报原因'); return; }
    setSubmitting(true);
    try {
      await reportsAPI.submit({
        target_type: targetType,
        target_id: targetId,
        reason,
        description: description.trim() || undefined,
      });
      toast.success('举报已提交，感谢您的反馈');
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="举报">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', padding: '24px' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--danger)' }} />
            举报内容
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {REASONS.map(r => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
              style={{
                background: reason === r.value ? 'var(--primary-light)' : 'var(--input-bg)',
                border: reason === r.value ? '2px solid var(--primary)' : '2px solid transparent',
                color: 'var(--text)',
              }}
            >
              <i className={r.icon} style={{ color: reason === r.value ? 'var(--primary-dark)' : 'var(--text-muted)', width: '20px', textAlign: 'center' }} />
              <span className="text-sm font-semibold">{r.label}</span>
            </button>
          ))}
        </div>

        <textarea
          className="form-control mb-4"
          placeholder="补充说明（可选）"
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          style={{ resize: 'none', fontSize: '0.85rem' }}
        />

        <div className="flex gap-2 justify-end">
          <button className="btn btn-outline btn-sm" onClick={onClose}>取消</button>
          <button
            className="btn btn-sm"
            onClick={handleSubmit}
            disabled={!reason || submitting}
            style={{ background: 'var(--danger)', color: 'white' }}
          >
            {submitting ? <><i className="fa-solid fa-spinner fa-spin mr-1" />提交中...</> : '提交举报'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
