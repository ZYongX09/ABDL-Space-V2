import { useEffect, useRef, useState } from 'react';
import { adjacentGalleryId, featureAtReadingLine, galleryEdges, heroDeadline, heroIntroVisible, heroRemaining, nextGalleryOffset, watchHeroImages } from './appDownloadPresentation.js';

const HERO_POSITIONS = ['center', 'left', 'right'];
const HERO_WAIT_MS = 900;
const HERO_RUN_MS = 760;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const DESKTOP_FEATURES = '(min-width: 761px) and (min-height: 640px)';
const EMPTY_EDGES = { overflow: false, start: true, end: true };
const number = value => String(value).padStart(2, '0');

export function Icon({ name, brand = false }) {
  return <i className={`fa-${brand ? 'brands' : 'solid'} fa-${name}`} aria-hidden="true" />;
}

function ScreenImage({ feature, image, decorative = false, loading, onError }) {
  return <img src={image.url} width={image.width} height={image.height} alt={decorative ? '' : feature.alt}
    loading={loading} decoding="async" onError={onError} />;
}

function Phone({ feature, image, decorative = false, loading }) {
  const [failedSource, setFailedSource] = useState(null);
  if (failedSource === image.url) return null;
  // 外扩边框不占布局，机身与截图同比例。
  return <span className="adl-phone" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
    <ScreenImage key={image.url} feature={feature} image={image} decorative={decorative} loading={loading}
      onError={() => setFailedSource(image.url)} />
  </span>;
}

export function HeroScreenshots({ features, images, header }) {
  const stage = useRef(null);
  const spent = useRef(false);
  const deadline = useRef(null);
  const [intro, setIntro] = useState(null);
  const present = features.filter(feature => images[feature.id]);
  const sources = JSON.stringify(present.map(({ id }) => [id, images[id].url]));

  useEffect(() => {
    if (spent.current) { setIntro(null); return; }
    const element = stage.current;
    if (!element) return;
    const motion = window.matchMedia(REDUCED_MOTION);
    const eligible = () => {
      const { top, bottom } = element.getBoundingClientRect();
      return heroIntroVisible({ reduced: motion.matches, hidden: document.hidden, hash: window.location.hash,
        top, bottom, headerBottom: header.current?.getBoundingClientRect().bottom ?? 0, viewportHeight: window.innerHeight });
    };
    if (!eligible()) { spent.current = true; return; }

    const controller = new AbortController();
    const { signal } = controller;
    let endTimer;
    function finish() {
      spent.current = true;
      controller.abort();
      window.clearTimeout(endTimer);
      setIntro(null);
    }
    const check = () => { if (!eligible()) finish(); };
    window.addEventListener('scroll', check, { passive: true, signal });
    window.addEventListener('resize', check, { signal });
    window.addEventListener('hashchange', check, { signal });
    document.addEventListener('visibilitychange', check, { signal });
    motion.addEventListener('change', check, { signal });

    const photos = Array.from(element.querySelectorAll('img'));
    deadline.current = heroDeadline(deadline.current, HERO_WAIT_MS);
    watchHeroImages(photos, { signal, timeout: heroRemaining(deadline.current) }).then(ready => {
      if (signal.aborted) return;
      const positions = ready.flatMap((ok, index) => ok ? [photos[index].closest('[data-hero-position]')?.dataset.heroPosition] : []);
      if (!eligible() || !positions.length) { finish(); return; }
      spent.current = true;
      setIntro({ sources, positions });
      endTimer = window.setTimeout(finish, HERO_RUN_MS);
    });
    return () => { controller.abort(); window.clearTimeout(endTimer); };
  }, [sources, header]);

  if (!present.length) return null;
  return <div ref={stage} className="adl-hero-stage" aria-hidden="true">
    {present.map((feature, index) => {
      const image = images[feature.id];
      const position = HERO_POSITIONS[index];
      const entering = intro?.sources === sources && intro.positions.includes(position);
      return <div className={`adl-hero-phone adl-hero-phone-${position}`} key={position} data-hero-position={position}
        data-enter={entering || undefined} style={{ '--adl-phone-ratio': image.width / image.height }}>
        <Phone feature={feature} image={image} decorative />
      </div>;
    })}
  </div>;
}

export function FeatureShowcase({ features, images, header }) {
  const [active, setActive] = useState(0);
  const section = useRef(null);
  const articles = useRef([]);
  const feature = features[active];
  const image = images[feature.id];
  const hasImages = features.some(({ id }) => images[id]);

  useEffect(() => {
    if (!hasImages) return;
    const desktop = window.matchMedia(DESKTOP_FEATURES);
    const element = section.current;
    let frame = 0;
    function sync() {
      if (!desktop.matches || frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const viewport = window.innerHeight;
        const headerBottom = header.current?.getBoundingClientRect().bottom ?? 0;
        if (!desktop.matches || viewport <= headerBottom) return;
        const bounds = element.getBoundingClientRect();
        if (bounds.top >= viewport || bounds.bottom <= headerBottom) return;
        setActive(featureAtReadingLine(articles.current.map(article => article?.getBoundingClientRect().top ?? Infinity), headerBottom, viewport));
      });
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(element);
    if (header.current) observer?.observe(header.current);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    desktop.addEventListener('change', sync);
    sync();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      desktop.removeEventListener('change', sync);
      observer?.disconnect();
    };
  }, [hasImages, header]);

  return (
    <section ref={section} className={`adl-wrap adl-features${hasImages ? '' : ' adl-features-text'}`} id="features" aria-label="功能">
      <div className="adl-feature-copy">
        {features.map((entry, index) => (
          <article id={`feature-${entry.id}`} data-tone={entry.tone} data-active={index === active || undefined}
            ref={element => { articles.current[index] = element; }} key={entry.id}>
            <div className="adl-feature-text">
              <p className="adl-kicker"><span>{number(index + 1)}</span>{entry.name}</p>
              <h2>{entry.title}</h2>
              <p className="adl-section-description">{entry.description}</p>
              <dl className="adl-feature-facts">
                {entry.facts.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}
              </dl>
            </div>
            {images[entry.id] && <div className="adl-feature-mobile" style={{ '--adl-phone-ratio': images[entry.id].width / images[entry.id].height }}>
              <Phone feature={entry} image={images[entry.id]} loading="lazy" />
            </div>}
          </article>
        ))}
      </div>
      {hasImages && <div className="adl-feature-stage" data-tone={feature.tone}>
        <div className="adl-feature-art">
          {image && <div className="adl-feature-preview" key={feature.id} style={{ '--adl-phone-ratio': image.width / image.height }}>
            <Phone feature={feature} image={image} loading="lazy" />
          </div>}
        </div>
        <p className="adl-feature-index"><b>{number(active + 1)}</b> / {number(features.length)}&nbsp; {feature.name}</p>
        <nav className="adl-feature-nav" aria-label="功能章节">
          {features.map((entry, index) => (
            <a key={entry.id} href={`#feature-${entry.id}`} aria-label={entry.name} title={entry.name}
              aria-current={index === active ? 'location' : undefined}><span /></a>
          ))}
        </nav>
      </div>}
    </section>
  );
}

export function ScreenshotGallery({ features, images }) {
  const gallery = features.filter(({ id }) => images[id]);
  const count = gallery.length;
  const heading = useRef(null);
  const rail = useRef(null);
  const track = useRef(null);
  const controls = useRef(null);
  const dialog = useRef(null);
  const opener = useRef(null);
  const [selected, setSelected] = useState(null);
  const [edges, setEdges] = useState(EMPTY_EDGES);
  const selectedFeature = gallery.find(({ id }) => id === selected);
  const selectedImage = selectedFeature ? images[selected] : null;

  useEffect(() => {
    const element = rail.current;
    if (!element) { setEdges(EMPTY_EDGES); return; }
    function sync() {
      const { overflow, start, end } = galleryEdges(element.scrollLeft, element.clientWidth, element.scrollWidth);
      const canScroll = count > 1 && overflow;
      if (!canScroll && controls.current?.contains(document.activeElement)) heading.current?.focus({ preventScroll: true });
      setEdges(previous => previous.overflow === canScroll && previous.start === start && previous.end === end ? previous : { overflow: canScroll, start, end });
    }
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(sync) : null;
    observer?.observe(element);
    observer?.observe(track.current);
    element.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
    return () => {
      observer?.disconnect();
      element.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, [count]);

  useEffect(() => {
    if (selected && !selectedFeature && dialog.current?.open) dialog.current.close();
  }, [selected, selectedFeature]);

  function moveRail(direction) {
    const element = rail.current;
    if (!element) return;
    const left = element.getBoundingClientRect().left;
    const padding = parseFloat(getComputedStyle(element).scrollPaddingLeft) || 0;
    const current = element.scrollLeft;
    const { maximum, start, end } = galleryEdges(current, element.clientWidth, element.scrollWidth);
    if (direction < 0 ? start : end) return;
    const offsets = Array.from(track.current.children, card => card.getBoundingClientRect().left - left + current - padding);
    element.scrollTo({ left: nextGalleryOffset(offsets, current, maximum, direction) });
  }

  function open(feature, event) {
    opener.current = event.currentTarget;
    setSelected(feature.id);
    dialog.current.showModal();
  }

  function close() {
    setSelected(null);
    const target = opener.current?.isConnected ? opener.current : heading.current;
    target?.focus({ preventScroll: true });
    opener.current = null;
  }

  function step(direction) {
    setSelected(previous => adjacentGalleryId(gallery.map(({ id }) => id), previous, direction));
  }

  function onDialogKey(event) {
    if (count < 2 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    step(event.key === 'ArrowLeft' ? -1 : 1);
  }

  return (
    <section className="adl-section adl-gallery" id="screenshots" aria-labelledby="adl-gallery-title">
      <div className="adl-wrap">
        <div className="adl-section-heading adl-gallery-heading">
          <div><p className="adl-kicker">界面</p><h2 id="adl-gallery-title" ref={heading} tabIndex={-1}>打开 App，会看到什么？</h2></div>
          <div className="adl-gallery-actions" ref={controls} hidden={!edges.overflow}>
            <button type="button" aria-label="向左浏览截图" aria-controls="adl-gallery-rail" aria-disabled={edges.start} onClick={() => moveRail(-1)}><Icon name="arrow-left" /></button>
            <button type="button" aria-label="向右浏览截图" aria-controls="adl-gallery-rail" aria-disabled={edges.end} onClick={() => moveRail(1)}><Icon name="arrow-right" /></button>
          </div>
        </div>
        {count ? (
          <div className="adl-gallery-rail" id="adl-gallery-rail" ref={rail}>
            <div className="adl-gallery-track" ref={track}>
              {gallery.map(feature => <button type="button" key={feature.id} className="adl-gallery-card" data-tone={feature.tone}
                aria-label={`放大：${feature.name}`} onClick={event => open(feature, event)}>
                <Phone feature={feature} image={images[feature.id]} decorative loading="lazy" /><b>{feature.name}</b>
              </button>)}
            </div>
          </div>
        ) : (
          <div className="adl-gallery-empty" role="status"><Icon name="images" /><p>暂无可展示的实机截图。</p></div>
        )}
        <dialog className="adl-lightbox" ref={dialog} aria-label="实机截图" onClose={close} onKeyDown={onDialogKey}>
          <div className="adl-lightbox-heading">
            <p aria-live="polite">{selectedFeature?.name}</p>
            <form method="dialog"><button type="submit" aria-label="关闭截图" autoFocus><Icon name="xmark" /></button></form>
          </div>
          {selectedImage && <ScreenImage key={selectedImage.url} feature={selectedFeature} image={selectedImage} />}
          {selectedFeature && count > 1 && <div className="adl-lightbox-actions">
            <button type="button" aria-label="上一张截图" onClick={() => step(-1)}><Icon name="chevron-left" /></button>
            <span aria-label="截图进度">{gallery.indexOf(selectedFeature) + 1} / {count}</span>
            <button type="button" aria-label="下一张截图" onClick={() => step(1)}><Icon name="chevron-right" /></button>
          </div>}
        </dialog>
      </div>
    </section>
  );
}
