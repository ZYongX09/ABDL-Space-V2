import { useState } from 'react';

export default function ImageGrid({ images = [] }) {
  const [lightbox, setLightbox] = useState(null);
  if (!images.length) return null;

  const count = Math.min(images.length, 4);

  const gridClass = count === 1 ? 'img-grid-1'
    : count === 2 ? 'img-grid-2'
    : count === 3 ? 'img-grid-3'
    : 'img-grid-4';

  return (
    <>
      <div className={`img-grid ${gridClass}`}>
        {images.slice(0, 4).map((url, i) => (
          <div
            key={i}
            className="img-grid-item"
            onClick={() => setLightbox(i)}
          >
            <img src={url} alt="" loading="lazy" />
            {i === 3 && images.length > 4 && (
              <div className="img-grid-more">+{images.length - 4}</div>
            )}
          </div>
        ))}
      </div>

      {lightbox !== null && (
        <div className="img-lightbox" onClick={() => setLightbox(null)}>
          <button className="img-lightbox-close" onClick={() => setLightbox(null)}>
            <i className="fa-solid fa-xmark" />
          </button>
          <img src={images[lightbox]} alt="" />
          {images.length > 1 && (
            <div className="img-lightbox-nav">
              <button onClick={e => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}>
                <i className="fa-solid fa-chevron-left" />
              </button>
              <span>{lightbox + 1} / {images.length}</span>
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
