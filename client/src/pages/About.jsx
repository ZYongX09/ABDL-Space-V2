import PageLayout from '../components/PageLayout';

const VERSION = '2.6.1';
const LAST_UPDATE = '2026-05-18';

const CHANGELOG = [
  {
    version: '2.6.1',
    date: '2026-05-18',
    changes: [
      '关于页新增 GitHub 和开发者博客入口',
      '支持 Cloudflare Pages 部署',
    ],
  },
  {
    version: '2.6.0',
    date: '2026-05-17',
    changes: [
      '新增图片上传组件',
      '优化人机验证触发逻辑，减少频繁弹窗',
      '优化登录页安全验证体验',
    ],
  },
  {
    version: '2.5.1',
    date: '2026-05-16',
    changes: [
      '优化页面布局设计，优化用户体验',
      '接入百度统计',
      '更新隐私政策与用户协议',
    ],
  },
  {
    version: '2.5.0',
    date: '2026-05-16',
    changes: [
      '新增捐赠功能',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-05-16',
    changes: [
      '提升安全性与稳定性',
      '优化用户体验',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-05-15',
    changes: [
      '优化用户体验',
      '修复已知问题',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-05-15',
    changes: [
      '优化用户体验',
      '修复已知问题',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-05-15',
    changes: [
      '全新架构，全面重写',
      '新增三套主题：浅色 / 深色 / 多彩',
      '新增 AI 智能推荐',
      '新增纸尿裤对比功能',
      '新增使用感受系统',
      '新增用户等级与经验值',
      '新增 Wiki 与术语百科',
      '优化移动端体验',
      '优化页面切换动画',
      '修复已知问题',
    ],
  },
];

export default function About() {
  return (
    <PageLayout hero={{ icon: 'fa-circle-info', title: '关于', subtitle: `v${VERSION}` }}>
      {/* 项目简介 */}
      <div className="card mb-5">
        <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-baby mr-2" style={{ color: 'var(--primary-dark)' }} />
          ABDL Space
        </h3>
        <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--text-light)' }}>
          ABDL Space 是一个面向 ABDL 群体的中文社区平台，提供纸尿裤评价、排行榜、AI 推荐、论坛讨论等功能。
          致力于为爱好者打造一个温馨友好的交流空间。
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="https://github.com/ZYongX09/ABDL-Space-V2" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-80"
            style={{ background: '#24292e', textDecoration: 'none' }}>
            <i className="fa-brands fa-github" /> GitHub
          </a>
          <a href="https://zhx-blog.top" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-80"
            style={{ background: 'var(--primary-dark)', color: '#fff', textDecoration: 'none' }}>
            <i className="fa-solid fa-blog" /> ZhX 的博客
          </a>
        </div>
      </div>

      {/* 技术栈 */}
      <div className="card mb-5">
        <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-code mr-2" style={{ color: 'var(--primary-dark)' }} />
          技术栈
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {[
            ['React 18', 'fa-brands fa-react'],
            ['Vite', 'fa-solid fa-bolt'],
            ['Tailwind CSS', 'fa-solid fa-wind'],
            ['Font Awesome 6', 'fa-solid fa-icons'],
            ['Hono', 'fa-solid fa-server'],
            ['Cloudflare Workers', 'fa-solid fa-cloud'],
            ['Cloudflare D1', 'fa-solid fa-database'],
          ].map(([tech, icon]) => (
            <div key={tech} className="flex items-center gap-2">
              <i className={`${icon} w-5 text-center`} style={{ color: 'var(--primary-dark)' }} />
              <span>{tech}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 政策与条款 */}
      <div className="card mb-5">
        <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-file-contract mr-2" style={{ color: 'var(--primary-dark)' }} />
          政策与条款
        </h3>
        <div className="space-y-2">
          <a href="/privacy" className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80" style={{ background: 'var(--input-bg)', textDecoration: 'none' }}>
            <i className="fa-solid fa-shield-halved w-5 text-center" style={{ color: 'var(--primary-dark)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Privacy Policy</span>
            <i className="fa-solid fa-chevron-right ml-auto text-xs" style={{ color: 'var(--text-muted)' }} />
          </a>
          <a href="/terms" className="flex items-center gap-3 p-3 rounded-xl transition-all hover:opacity-80" style={{ background: 'var(--input-bg)', textDecoration: 'none' }}>
            <i className="fa-solid fa-file-contract w-5 text-center" style={{ color: 'var(--primary-dark)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>用户协议</span>
            <i className="fa-solid fa-chevron-right ml-auto text-xs" style={{ color: 'var(--text-muted)' }} />
          </a>
        </div>
      </div>

      {/* 支持我们 */}
      <div id="donate" className="card mb-5" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* 爱发电背景图标 */}
        <img
          src="https://static.afdiancdn.com/static/img/logo/logo.png"
          alt=""
          style={{
            position: 'absolute', top: -20, right: -20,
            width: 160, height: 160, opacity: 0.15,
            pointerEvents: 'none', userSelect: 'none',
            objectFit: 'contain',
          }}
        />
        <h3 className="font-bold mb-3" style={{ color: 'var(--text)', position: 'relative' }}>
          <i className="fa-solid fa-heart mr-2" style={{ color: 'var(--accent)' }} />
          支持我们
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-light)' }}>
          如果你觉得 ABDL Space 对你有帮助，欢迎捐赠我们哦~ 🍼
        </p>
        <div className="space-y-3">
          {/* 捐赠选择1 */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--input-bg)' }}>
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                给开发者买<span style={{ color: 'var(--primary-dark)', fontWeight: 800 }}>一片</span>裤裤
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>哇~好舒服的裤裤</div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-lg font-bold" style={{ color: 'var(--primary-dark)' }}>￥5</div>
              <a href="https://ifdian.net/order/create?plan_id=a9a8a704508c11f1be9a52540025c377&product_type=0" target="_blank" rel="noopener noreferrer">
                <img width="120" src="https://pic1.afdiancdn.com/static/img/welcome/button-sponsorme.png" alt="赞助" style={{ borderRadius: '0.5rem' }} />
              </a>
            </div>
          </div>
          {/* 捐赠选择2 */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--input-bg)' }}>
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                给开发者买<span style={{ color: 'var(--accent)', fontWeight: 800 }}>一包</span>裤裤
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>哇哦~好多好多裤裤呀~</div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="text-lg font-bold" style={{ color: 'var(--accent)' }}>￥20</div>
              <a href="https://ifdian.net/order/create?plan_id=bde9dab2508c11f1b80752540025c377&product_type=0" target="_blank" rel="noopener noreferrer">
                <img width="120" src="https://pic1.afdiancdn.com/static/img/welcome/button-sponsorme.png" alt="赞助" style={{ borderRadius: '0.5rem' }} />
              </a>
            </div>
          </div>
          {/* 捐赠选择3 */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--input-bg)' }}>
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                自定义捐赠
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>大老板~嘿嘿</div>
            </div>
            <div className="flex-shrink-0">
              <a href="https://ifdian.net/order/create?user_id=399f44cc508c11f18b7752540025c377" target="_blank" rel="noopener noreferrer">
                <img width="120" src="https://pic1.afdiancdn.com/static/img/welcome/button-sponsorme.png" alt="赞助" style={{ borderRadius: '0.5rem' }} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* 更新日志 */}
      <div className="card">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-clock-rotate-left mr-2" style={{ color: 'var(--primary-dark)' }} />
          更新日志
        </h3>
        <div className="space-y-5">
          {CHANGELOG.map(log => (
            <div key={log.version}>
              <div className="flex items-center gap-2 mb-2">
                <span className="tag">v{log.version}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{log.date}</span>
              </div>
              <ul className="space-y-1 text-sm" style={{ color: 'var(--text-light)' }}>
                {log.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="text-xs mt-5" style={{ color: 'var(--text-muted)' }}>
          最后更新: {LAST_UPDATE}
        </p>
      </div>
    </PageLayout>
  );
}
