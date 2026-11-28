import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { appVersionAPI } from '../api';
import { useDownloadScreenshots } from './useDownloadScreenshots.js';
import { normalizeRelease } from './appDownloadRelease';
import { FeatureShowcase, HeroScreenshots, Icon, ScreenshotGallery } from './AppDownloadShowcase.jsx';
import './AppDownload.css';

const SCREENSHOT_FEATURES = ['community', 'rankings', 'reading'];
const OFFICIAL_PAGE = 'https://abdl-space.top/app';
const THEME_KEY = 'abdl-app-download-theme';
const THEMES = [['light', '浅色'], ['system', '跟随系统'], ['dark', '深色']];

const FEATURES = [
  {
    id: 'community', name: '社区动态', tone: 'pink', icon: 'comments',
    title: '打开广场，看看大家的日常',
    description: '一条动态、一张照片，或者一段认真写下的话。浏览社区里的分享，也随时记录自己的日常。',
    facts: [['浏览动态', '在首页浏览社区分享，关注感兴趣的人。'], ['发帖分享', '用文字和图片记录日常。'], ['评论互动', '在一条动态下评论和回复。']],
    alt: 'ABDL Space 广场与社区动态界面',
  },
  {
    id: 'rankings', name: '评分榜单', tone: 'blue', icon: 'ranking-star',
    title: '买之前，先看看大家怎么评',
    description: '在纸尿裤榜单上发现热门条目，打开详情看看评分和使用感受，再判断哪一款适合自己。',
    facts: [['浏览榜单', '从排名入手，快速发现条目。'], ['条目详情', '查看社区给出的评分与使用感受。'], ['分享体验', '给用过的产品留下自己的评价。']],
    alt: 'ABDL Space 纸尿裤排行榜与条目评分界面',
  },
  {
    id: 'reading', name: '小说阅读', tone: 'yellow', icon: 'book-open',
    title: '翻开一章，读一个新故事',
    description: '在小说广场发现作品，打开章节进入阅读页。小说功能在公开版中仍处于测试阶段。',
    facts: [['发现作品', '在小说广场浏览社区作品。'], ['按章阅读', '从作品目录打开想看的章节。'], ['个人书架', '把想继续读的作品留在书架。']],
    alt: 'ABDL Space 小说章节阅读界面',
  },
];
const FAQS = [
  ['支持哪些系统？', 'Android 8.0 及以上设备可安装 APK。iOS 版正在开发，目前可以通过浏览器使用网页版。'],
  ['安装时提示「未知来源」怎么办？', '确认安装包来自本页后，按手机系统提示为当前浏览器或文件管理器临时开启「安装未知应用」，安装完成后可关闭。'],
  ['如何获取最新版本？', '回到本页即可查看并下载最新发布的安装包，也可以在 App 内检查更新。'],
  ['现有账户能直接登录吗？', '可以。App 和网站使用同一个账户，打开 App 后按提示登录即可。'],
];

function useRelease() {
  const [attempt, setAttempt] = useState(0);
  const [release, setRelease] = useState({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => {
      setRelease({ status: 'error' });
      controller.abort();
    }, 8000);
    appVersionAPI.getLatest({ signal: controller.signal })
      .then(data => { if (active && !controller.signal.aborted) setRelease(normalizeRelease(data)); })
      .catch(() => { if (active && !controller.signal.aborted) setRelease({ status: 'error' }); })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  function retry() {
    setRelease({ status: 'loading' });
    setAttempt(previous => previous + 1);
  }
  return [release, retry];
}

function DownloadActions({ release, retry }) {
  const android = (label) => <><Icon name="android" brand /><span><small>{label}</small><strong>Android</strong></span></>;
  return (
    <div className="adl-actions">
      {release.status === 'ready' ? (
        <a className="adl-platform adl-android" href={release.downloadUrl} download aria-label="下载 Android 安装包">
          {android('直接下载安装包')}
        </a>
      ) : release.status === 'error' ? (
        <button type="button" className="adl-platform adl-android" onClick={retry}>
          {android('查询失败 · 点击重试')}
        </button>
      ) : (
        <span className="adl-platform adl-unavailable" aria-disabled="true">
          {android(release.status === 'loading' ? '正在查询安装包' : '暂无安装包')}
        </span>
      )}
      <span className="adl-platform adl-ios" aria-disabled="true">
        <Icon name="apple" brand /><span><small>正在开发</small><strong>iOS</strong></span>
      </span>
    </div>
  );
}

function ReleaseMeta({ release }) {
  const pending = { loading: '查询中', empty: '暂无安装包', error: '暂不可用' };
  return (
    <dl className="adl-meta" aria-live="polite">
      <div><dt>版本</dt><dd>{release.status === 'ready' ? release.version || '最新' : pending[release.status]}</dd></div>
      <div><dt>平台</dt><dd>Android</dd></div>
      {release.date && <div><dt>更新</dt><dd>{release.date}</dd></div>}
      {release.size && <div><dt>大小</dt><dd>{release.size}</dd></div>}
    </dl>
  );
}

export default function AppDownload() {
  const [release, retry] = useRelease();
  const header = useRef(null);
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      if (THEMES.some(([value]) => value === stored)) return stored;
    } catch { /* 浏览器禁用存储时仍可切换主题 */ }
    return 'system';
  });
  const screenshots = useDownloadScreenshots(theme);
  const images = Object.fromEntries(SCREENSHOT_FEATURES.map((key, index) => [FEATURES[index].id, screenshots[key]]));

  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: 'instant' });
  }, []);

  function changeTheme(value) {
    setTheme(value);
    try { localStorage.setItem(THEME_KEY, value); } catch { /* 不影响本次主题切换 */ }
  }

  return (
    <div className="app-landing" data-landing-theme={theme} id="top">
      <header className="adl-topbar" ref={header}>
        <div className="adl-wrap adl-topbar-inner">
          <a className="adl-brand adl-topbar-brand" href="#top">
            <img src="/app-icon.png" width="30" height="30" alt="" />
            <span>ABDL Space</span>
          </a>
          <a className="adl-button adl-primary adl-topbar-cta" href="#download">
            <Icon name="download" /><span>下载 App</span>
          </a>
        </div>
      </header>
      <main>
        <section className={`adl-hero${Object.values(images).some(Boolean) ? '' : ' adl-hero-no-images'}`} aria-labelledby="adl-title">
          <div className="adl-hero-copy">
            <p className="adl-hero-badge"><span aria-hidden="true" />ABDL Space App · 社区、评分与阅读</p>
            <h1 id="adl-title">宝宝们的日常<br />都在ABDL Space</h1>
            <p className="adl-intro">面向 ABDL 社区的移动端应用，提供社区动态、纸尿裤评分与榜单、小说等功能。</p>
            <DownloadActions release={release} retry={retry} />
            <ReleaseMeta release={release} />
          </div>
          <HeroScreenshots features={FEATURES} images={images} header={header} />
        </section>

        <FeatureShowcase features={FEATURES} images={images} header={header} />
        <ScreenshotGallery features={FEATURES} images={images} />

        <section className="adl-section adl-access" id="access">
          <div className="adl-wrap">
            <div className="adl-section-heading"><div><p className="adl-kicker">使用方式</p><h2>在线逛逛，或者装进手机</h2></div></div>
            <div className="adl-access-grid">
              <article className="adl-access-card">
                <Icon name="globe" /><p className="adl-kicker">Web 端</p><h3>访问网页版</h3>
                <p>无需安装，在浏览器里直接打开 ABDL Space。</p>
                <ul className="adl-access-list">
                  <li>不用下载任何文件</li>
                  <li>社区与榜单随时可看</li>
                </ul>
                <a className="adl-button adl-secondary" href="/">访问网页版 <Icon name="arrow-right" /></a>
              </article>
              <article className="adl-access-card adl-access-primary">
                <Icon name="mobile-screen-button" /><p className="adl-kicker">APP 端</p><h3>下载 Android 版</h3>
                <p>Android 8.0 及以上可安装，使用现有账户登录。</p>
                <ul className="adl-access-list">
                  <li>同一个账户继续使用</li>
                  <li>可在 App 内检查更新</li>
                </ul>
                <a className="adl-button adl-primary" href="#download">查看下载方式 <Icon name="arrow-right" /></a>
                <figure className="adl-qr">
                  <QRCodeSVG value={OFFICIAL_PAGE} size={88} marginSize={3} title="ABDL Space 官方下载页二维码" />
                  <figcaption><a href={OFFICIAL_PAGE}>手机扫码打开下载页</a><p>扫码查看最新版本和安装说明</p></figcaption>
                </figure>
              </article>
              <article className="adl-access-card">
                <Icon name="circle-question" /><p className="adl-kicker">安装帮助</p><h3>第一次安装 APK？</h3>
                <p>从系统下载列表打开安装包，按提示完成安装。</p>
                <ul className="adl-access-list">
                  <li>「未知来源」权限提示</li>
                  <li>安装完成后的登录说明</li>
                </ul>
                <a className="adl-button adl-secondary" href="#faq">查看安装帮助 <Icon name="arrow-right" /></a>
              </article>
            </div>
          </div>
        </section>

        <section className="adl-section adl-help" id="faq">
          <div className="adl-wrap adl-help-grid">
            <div>
              <p className="adl-kicker">常见问题</p><h2>下载前，你可能想知道</h2>
              <p className="adl-section-description">下载 APK 后，从系统下载列表打开。安装完成后，打开 App 并登录。</p>
              <p className="adl-help-contact">还有问题？<a href="/about">联系与反馈</a></p>
            </div>
            <div>
              {FAQS.map(([question, answer], index) => (
                <details className="adl-details" key={question} open={index === 0 ? true : undefined}>
                  <summary>{question}<Icon name="chevron-down" /></summary><p>{answer}</p>
                </details>
              ))}
              {release.changelog && <details className="adl-details"><summary>本次更新<Icon name="chevron-down" /></summary><p className="adl-changelog">{release.changelog}</p></details>}
            </div>
          </div>
        </section>

        <section className="adl-wrap adl-download" id="download" aria-labelledby="adl-download-title">
          <div className="adl-download-card">
            <img className="adl-download-logo" src="/app-icon.png" width="64" height="64" alt="" loading="lazy" />
            <h2 id="adl-download-title">在这里<br />探索全新世界</h2>
            <p className="adl-section-description">下载 Android 版，继续浏览社区、评分与小说。</p>
            <DownloadActions release={release} retry={retry} />
          </div>
        </section>
      </main>
      <footer className="adl-footer">
        <div className="adl-wrap adl-footer-grid">
          <div><a className="adl-brand" href="#top"><img src="/app-icon.png" width="32" height="32" alt="" />ABDL Space</a><p>社区动态、评分榜单与小说阅读。</p></div>
          <nav aria-label="页脚导航"><a href="/">网页版</a><a href="/about">关于</a><a href="/privacy">隐私政策</a><a href="/terms">用户协议</a></nav>
        </div>
        <div className="adl-wrap adl-footer-base">
          <span>© {new Date().getFullYear()} ABDL Space</span>
          <fieldset className="adl-themes"><legend className="sr-only">颜色主题</legend>
            {THEMES.map(([value, label]) => <label key={value}>
              <input type="radio" name="app-download-theme" value={value} checked={theme === value} onChange={() => changeTheme(value)} />
              <span>{label}</span>
            </label>)}
          </fieldset>
        </div>
      </footer>
    </div>
  );
}
