import { useEffect, useRef } from 'react';
import { merchantAPI } from '../api';
import { buildMediaPreviewUrl } from '../utils/mediaUrl';
import { useBillableImpression } from '../merchant/useBillableImpression.js';
import '../pages/merchant.css';

export default function AdvertisementCard({ ad, placement = 'feed', viewerId }) {
  const tracked = useRef(null);
  const adId = ad?.id || ad?.ad_id;
  const token = placement === 'feed' ? ad?.billable_impression_token : null;
  const impressionId = ad?.impression_id;
  const card = useBillableImpression(adId, token, viewerId);
  const imageUrl = ad?.images?.[0]?.preview_url || buildMediaPreviewUrl(ad?.image_url || ad?.imageUrl || '');
  const targetUrl = ad?.url || ad?.target_url || ad?.targetUrl;
  const title = ad?.title || '推广内容';
  const body = ad?.body || ad?.content || ad?.text || '';
  const name = ad?.display_name || ad?.merchant_name;
  const label = ad?.official || ad?.ad_type === 'official' || ad?.ad_type === 'system' ? '官方推广' : '商家推广';

  useEffect(() => {
    // The legacy impression is analytics only; a separate visible receipt can be billed.
    if (!adId || tracked.current === (impressionId || adId)) return;
    tracked.current = impressionId || adId;
    merchantAPI.event({ adId, eventType: 'impression', placement, impressionId });
  }, [adId, placement, impressionId, token]);

  const track = (eventType) => merchantAPI.event({ adId, eventType, placement });
  const openTarget = (event) => {
    if (!targetUrl) return;
    event.preventDefault();
    track('link_click');
    track('ad_navigation');
    window.location.href = targetUrl;
  };

  return (
    <article className="ad-card card" data-ad-id={adId} ref={card}>
      <div className="ad-card-label"><i className="fa-solid fa-bullhorn" aria-hidden="true" /> {label}{name ? ` · ${name}` : ''}</div>
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
