import { useEffect, useRef } from 'react';
import { merchantAPI } from '../api';

export default function AdvertisementCard({ ad, placement = 'feed' }) {
  const tracked = useRef(false);
  const adId = ad?.id || ad?.ad_id;
  const imageUrl = ad?.image_url || ad?.imageUrl;
  const targetUrl = ad?.url || ad?.target_url || ad?.targetUrl;
  const title = ad?.title || '推广内容';
  const body = ad?.content || ad?.text || '';

  useEffect(() => {
    if (!adId || tracked.current) return;
    tracked.current = true;
    merchantAPI.event({ adId, eventType: 'impression', placement });
  }, [adId, placement]);

  const track = (eventType) => merchantAPI.event({ adId, eventType, placement });
  const openTarget = (event) => {
    if (!targetUrl) return;
    event.preventDefault();
    track('link_click');
    track('ad_navigation');
    window.location.href = targetUrl;
  };

  return (
    <article className="ad-card card" data-ad-id={adId}>
      <div className="ad-card-label"><i className="fa-solid fa-bullhorn" aria-hidden="true" /> 推广</div>
      <div className="ad-card-content">
        <div className="ad-card-copy">
          <h3>{title}</h3>
          {body && <p>{body}</p>}
          {targetUrl && (
            <a className="ad-card-link" href={targetUrl} onClick={openTarget} rel="noreferrer">
              查看详情 <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
            </a>
          )}
        </div>
        {imageUrl && (
          <button type="button" className="ad-card-image-button" onClick={() => track('image_view')} aria-label={`查看${title}图片`}>
            <img src={imageUrl} alt={title} loading="lazy" />
          </button>
        )}
      </div>
    </article>
  );
}
