import { useEffect, useRef } from 'react';
import { merchantAPI } from '../api.js';
import { observeViewableAd, supportsAdViewability } from './viewability.js';

export function useBillableImpression(adId, token, viewerId) {
  const card = useRef(null);
  const reported = useRef(null);
  useEffect(() => {
    if (!adId || typeof token !== 'string' || !token || !viewerId || !supportsAdViewability() || reported.current === token) return;
    return observeViewableAd(card.current, () => {
      reported.current = token;
      // Do not retry charges or use the reporting token in any other analytics event.
      void merchantAPI.billableImpression(adId, token).catch(() => {});
    });
  }, [adId, token, viewerId]);
  return card;
}
