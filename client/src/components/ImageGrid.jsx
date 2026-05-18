import { useState } from 'react';

export default function ImageGrid({ images = [] }) {
  const [lightbox, setLightbox] = useState(null);
  if (!images.length) return null;

  // 兼容字符串数组和 { image_url } 对象数组
  const urls = images.map(img => typeof img === 'string' ? img : img?.image_url || img?.src || '');
  const count = Math.min(urls.length, 4);

  const gridClass = count === 1 ? 'img-grid-1'
    : count === 2 ? 'img-grid-2'
    : count === 3 ? 'img-grid-3'
    : 'img-grid-4';

  return (
    <>
      <div className={`img-grid ${gridClass}`}>
        {urls.slice(0, 4).map((url, i) => (
          <div
            key={i}
            className="img-grid-item"
            onClick={() => setLightbox(i)}
          >
            <img src={url} alt="" loading="lazy" />
            {i === 3 && urls.length > 4 && (
              <div className="img-grid-more">+{urls.length - 4}</div>
            )}
          </div>
        ))}
      </div>

      {lightbox !== null && (
        <div className="img-lightbox" onClick={() => setLightbox(null)}>
          <button className="img-lightbox-close" onClick={() => setLightbox(null)}>
            <i className="fa-solid fa-xmark" />
          </button>
          <img src={urls[lightbox]} alt="" />
          {urls.length > 1 && (
            <div className="img-lightbox-nav">
              <button onClick={e => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span>{lightbox + 1} / {urls.length}</span>
              <button onClick={e => { e.stopPropagation(); setLightbox((lightbox + 1) % images.length); }}>
                <i className="fa-solid fa-chevron-right" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
