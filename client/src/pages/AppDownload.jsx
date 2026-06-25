import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import PageLayout from '../components/PageLayout';
import { appVersionAPI } from '../api';

// 功能亮点（避免 emoji，全部使用 Font Awesome 图标）
const FEATURES = [
  { icon: 'fa-gauge-high', title: '极速流畅', desc: '原生体验，丝滑交互，告别网页加载等待' },
  { icon: 'fa-shield-halved', title: '安全私密', desc: '账户与消息加密守护，隐私由你掌控' },
  { icon: 'fa-bell', title: '实时通知', desc: '点赞、评论、私信第一时间推送到手' },
  { icon: 'fa-wand-magic-sparkles', title: '智能推荐', desc: 'AI 为你匹配最合适的纸尿裤' },
  { icon: 'fa-trophy', title: '社区排行', desc: '随时查看评分榜单，发现热门之选' },
  { icon: 'fa-cloud-arrow-down', title: '持续更新', desc: '功能持续迭代，自动检查新版本' },
];

// 常见问题
const FAQS = [
  {
    q: '支持哪些系统？',
    a: '当前提供 Android 安装包（APK），适配 Android 8.0 及以上设备。iOS 版本正在规划中。',
  },
  {
    q: '安装时提示「未知来源」怎么办？',
    a: '这是系统对非应用商店安装包的安全提醒。在系统设置中允许「安装未知应用」即可继续，安装包经过安全检测，请放心使用。',
  },
  {
    q: '如何获取最新版本？',
    a: 'App 启动时会自动检查更新；也可随时回到本页面扫码或直接下载最新安装包。',
  },
  {
    q: '现有账户能直接登录吗？',
    a: '可以。App 与网站共享同一套账户体系，使用网站注册的邮箱或用户名直接登录即可。',
  },
];

export default function AppDownload() {
  const [version, setVersion] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    appVersionAPI
      .getLatest()
      .then((data) => {
        if (cancelled) return;
        setVersion(data || null);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // hasUpdate=true 表示有可下载版本
  const available = !!version?.hasUpdate;
  const downloadUrl = version?.downloadUrl || '';
  const versionName = version?.versionName || '';
  const changelog = version?.changelog || '';
  const releasedAt = version?.releasedAt || '';

  // 扫码内容：有版本时指向下载链接，无版本时指向本页面
  const qrValue = available ? downloadUrl : 'https://abdl-space.top/app';

  // 格式化发布时间
  const releaseDateText = releasedAt
    ? new Date(releasedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <PageLayout hero={{ icon: 'fa-mobile-screen', title: '下载 ABDL Space', subtitle: available && versionName ? `v${versionName}` : '移动客户端' }}>
      {/* ============ Hero 区：主下载卡 ============ */}
      <div className="card app-download-hero mb-5">
        <div className="app-download-hero-grid">
          {/* 左：文案 + 下载按钮 */}
          <div className="app-download-hero-text">
            <h2 className="app-download-title">
              随时随地，<br />感受温暖陪伴
            </h2>
            <p className="app-download-desc">
              专为 ABDL 群体打造的移动客户端，把社区、评分与推荐装进口袋。
            </p>

            {/* 版本状态徽章 */}
            <div className="app-download-meta">
              {loading ? (
                <span className="app-badge app-badge-neutral">
                  <i className="fa-solid fa-spinner fa-spin" /> 正在获取版本信息
                </span>
              ) : available ? (
                <>
                  <span className="app-badge app-badge-success">
                    <i className="fa-solid fa-circle-check" /> v{versionName}
                  </span>
                  {releaseDateText && (
                    <span className="app-badge app-badge-neutral">
                      <i className="fa-solid fa-calendar-day" /> {releaseDateText}
                    </span>
                  )}
                </>
              ) : (
                <span className="app-badge app-badge-accent">
                  <i className="fa-solid fa-rocket" /> 即将上线
                </span>
              )}
            </div>

            {/* 下载按钮区 —— 移动端主入口 */}
            <div className="app-download-actions">
              {available ? (
                <a
                  href={downloadUrl}
                  className="btn btn-primary app-download-btn"
                  download
                >
                  <i className="fa-brands fa-android" />
                  <span>下载 Android 安装包</span>
                </a>
              ) : (
                <button className="btn btn-primary app-download-btn" disabled>
                  <i className="fa-solid fa-hourglass-half" />
                  <span>安装包即将发布</span>
                </button>
              )}
              <a href="/" className="btn app-download-btn-secondary">
                <i className="fa-solid fa-globe" />
                <span>继续访问网页版</span>
              </a>
            </div>
          </div>

          {/* 右：二维码（仅 PC/平板显示） */}
          <div className="app-download-qr-wrap">
            <div className="app-download-qr">
              <div className="app-download-qr-frame">
                {loading ? (
                  <div className="app-qr-placeholder">
                    <i className="fa-solid fa-spinner fa-spin" />
                  </div>
                ) : (
                  <QRCodeSVG
                    value={qrValue}
                    size={168}
                    bgColor="#ffffff"
                    fgColor="#2C3E50"
                    level="M"
                    marginSize={0}
                  />
                )}
              </div>
              <div className="app-download-qr-label">
                <i className="fa-solid fa-qrcode" />
                <span>手机扫码下载</span>
              </div>
              <p className="app-download-qr-hint">
                使用相机或浏览器扫一扫
              </p>
            </div>
          </div>
        </div>

        {/* 更新日志摘要 */}
        {available && changelog && (
          <div className="app-download-changelog">
            <div className="app-download-changelog-title">
              <i className="fa-solid fa-bullhorn" />
              <span>本次更新</span>
            </div>
            <p className="app-download-changelog-text">{changelog}</p>
          </div>
        )}
      </div>

      {/* ============ 功能亮点 ============ */}
      <div className="card mb-5">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-star mr-2" style={{ color: 'var(--primary-dark)' }} />
          功能亮点
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="app-feature-item">
              <div className="app-feature-icon">
                <i className={`fa-solid ${f.icon}`} />
              </div>
              <div className="app-feature-text">
                <div className="app-feature-title">{f.title}</div>
                <div className="app-feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============ 安装步骤 ============ */}
      <div className="card mb-5">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-list-check mr-2" style={{ color: 'var(--primary-dark)' }} />
          安装步骤
        </h3>
        <div className="app-steps">
          <div className="app-step">
            <div className="app-step-num">1</div>
            <div className="app-step-body">
              <div className="app-step-title">下载安装包</div>
              <div className="app-step-desc">点击上方下载按钮，或用手机扫描二维码</div>
            </div>
          </div>
          <div className="app-step">
            <div className="app-step-num">2</div>
            <div className="app-step-body">
              <div className="app-step-title">允许安装</div>
              <div className="app-step-desc">在系统弹窗中选择「允许本次安装」</div>
            </div>
          </div>
          <div className="app-step">
            <div className="app-step-num">3</div>
            <div className="app-step-body">
              <div className="app-step-title">打开登录</div>
              <div className="app-step-desc">使用网站账户直接登录，开启温暖旅程</div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ 常见问题 ============ */}
      <div className="card">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-circle-question mr-2" style={{ color: 'var(--primary-dark)' }} />
          常见问题
        </h3>
        <div className="space-y-3">
          {FAQS.map((item) => (
            <details key={item.q} className="app-faq">
              <summary className="app-faq-q">
                <span>{item.q}</span>
                <i className="fa-solid fa-chevron-down app-faq-icon" />
              </summary>
              <div className="app-faq-a">{item.a}</div>
            </details>
          ))}
        </div>
        <p className="app-download-footer">
          <i className="fa-solid fa-circle-info" />
          遇到安装问题？欢迎在
          <a href="/about" style={{ color: 'var(--link-color)', margin: '0 4px' }}>关于页</a>
          联系我们反馈
        </p>
      </div>
    </PageLayout>
  );
}
