export default function BiometricPrompt({ onSetup, onDismiss }) {
  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', padding: 24 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'var(--primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <i className="fa-solid fa-fingerprint" style={{ fontSize: 28, color: 'var(--primary)' }} />
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
          开启宝宝安全识别？
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          下次登录更方便，无需输入密码
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onDismiss} className="btn btn-outline" style={{ flex: 1 }}>
            稍后再说
          </button>
          <button onClick={onSetup} className="btn btn-primary" style={{ flex: 1 }}>
            立即设置
          </button>
        </div>
      </div>
    </div>
  )
}
