// Only decoded images join the intro; a slow or failed image cannot block the page.
export function watchHeroImages(images, { signal, timeout = 900 } = {}) {
  if (!images.length || signal?.aborted) return Promise.resolve([]);
  return new Promise(resolve => {
    const decoded = images.map(() => false);
    const pending = new Set(images.keys());
    const cleanup = [];
    let done = false;
    const finish = cancelled => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      cleanup.forEach(remove => remove());
      resolve(cancelled ? [] : decoded);
    };
    const cancel = () => finish(true);
    const timer = setTimeout(() => finish(false), timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    images.forEach((image, index) => {
      const settle = ready => {
        if (done || !pending.delete(index)) return;
        decoded[index] = ready;
        if (!pending.size) finish(false);
      };
      const loaded = () => settle(image.naturalWidth > 0);
      const failed = () => settle(false);
      if (image.complete && !image.naturalWidth) failed();
      else if (typeof image.decode === 'function') Promise.resolve().then(() => image.decode()).then(loaded, failed);
      else if (image.complete) loaded();
      else {
        image.addEventListener('load', loaded, { once: true });
        image.addEventListener('error', failed, { once: true });
        cleanup.push(() => {
          image.removeEventListener('load', loaded);
          image.removeEventListener('error', failed);
        });
      }
    });
  });
}

export function heroIntroVisible({ reduced, hidden, hash, top, bottom, headerBottom, viewportHeight }) {
  return !reduced && !hidden && (!hash || hash === '#top') && top < viewportHeight && bottom > headerBottom;
}

/** One deadline per mount: a late manifest cannot delay the intro forever. */
export function heroDeadline(previous, wait) {
  return previous ?? Date.now() + wait;
}

export function heroRemaining(deadline) {
  return Math.max(0, deadline - Date.now());
}

export function featureAtReadingLine(tops, headerBottom, viewportHeight) {
  const line = headerBottom + Math.max(0, viewportHeight - headerBottom) * 0.3;
  for (let index = tops.length - 1; index > 0; index--) {
    if (tops[index] <= line) return index;
  }
  return 0;
}

const EDGE_TOLERANCE = 2;

export function galleryEdges(current, visible, content) {
  const maximum = Math.max(0, content - visible);
  return { maximum, overflow: maximum > EDGE_TOLERANCE, start: current <= EDGE_TOLERANCE, end: current >= maximum - EDGE_TOLERANCE };
}

export function nextGalleryOffset(offsets, current, maximum, direction) {
  const positions = offsets.map(offset => Math.max(0, Math.min(offset, maximum)));
  if (direction > 0) return positions.find(offset => offset > current + EDGE_TOLERANCE) ?? maximum;
  for (let index = positions.length - 1; index >= 0; index--) {
    if (positions[index] < current - EDGE_TOLERANCE) return positions[index];
  }
  return 0;
}

export function adjacentGalleryId(ids, selected, direction) {
  const index = ids.indexOf(selected);
  return ids.length > 1 && index >= 0 ? ids[(index + direction + ids.length) % ids.length] : selected;
}
