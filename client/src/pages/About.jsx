import PageLayout from '../components/PageLayout';

const VERSION = '2.4.0';
const LAST_UPDATE = '2026-05-16';

const CHANGELOG = [
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
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-light)' }}>
          ABDL Space 是一个面向 ABDL 群体的中文社区平台，提供纸尿裤评价、排行榜、AI 推荐、论坛讨论等功能。
          致力于为爱好者打造一个温馨友好的交流空间。
        </p>
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
            ['Node.js', 'fa-brands fa-node-js'],
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
