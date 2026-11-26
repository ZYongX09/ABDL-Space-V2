import test from 'node:test';
import assert from 'node:assert/strict';
import { observeViewableAd, shouldRequestAdViewability } from './viewability.js';

function fixture() {
  let time = 0, next = 0, reports = 0, observer;
  const element = { isConnected: true };
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: () => true });
  const win = new EventTarget();
  const jobs = new Map();
  class Observer {
    constructor(callback, options) { observer = this; assert.deepEqual(options, { threshold: [0.5] }); this.deliver = callback; this.records = []; }
    observe(target) { assert.equal(target, element); }
    disconnect() { this.disconnected = true; }
    takeRecords() { return this.records.splice(0); }
  }
  const cleanup = observeViewableAd(element, () => { reports++; }, {
    doc, win, Observer, now: () => time, schedule: (run, delay) => { jobs.set(++next, { run, at: time + delay }); return next; }, cancel: id => jobs.delete(id),
  });
  const advance = ms => {
    time += ms;
    for (const [id, job] of jobs) if (job.at <= time) { jobs.delete(id); job.run(); }
  };
  const entry = (ratio, width = 100) => ({ target: element, isIntersecting: ratio > 0, intersectionRatio: ratio, intersectionRect: { width, height: 100 } });
  return { element, doc, win, cleanup, advance, entry, get observer() { return observer; }, get reports() { return reports; } };
}

test('only the render-capable default first-page request opts into ad viewability', () => {
  const first = { page: 1, adViewability: true };
  assert.equal(shouldRequestAdViewability(first), true);
  for (const options of [{ page: 2 }, { search: 'test' }, { filter: 'following' }, { excludeNsfw: true }, { adViewability: false }]) {
    assert.equal(shouldRequestAdViewability({ ...first, ...options }), false);
  }
});

test('50% for a continuous 1 second; shorter intervals and zero-area cards never accrue', () => {
  const f = fixture();
  f.observer.deliver([f.entry(0.5, 0)]); f.advance(2000);
  f.observer.deliver([f.entry(0.5)]); f.advance(999);
  assert.equal(f.reports, 0);
  f.observer.deliver([f.entry(0.49), f.entry(0.5)]); f.advance(999);
  assert.equal(f.reports, 0);
  f.advance(1); assert.equal(f.reports, 1);
  f.observer.deliver([f.entry(1)]); f.advance(2000);
  assert.equal(f.reports, 1);
});

test('drain a queued fall below the threshold before reporting', () => {
  const f = fixture();
  f.observer.deliver([f.entry(1)]); f.advance(999);
  f.observer.records.push(f.entry(0.25), f.entry(0.75)); f.advance(1);
  assert.equal(f.reports, 0);
  f.advance(1000); assert.equal(f.reports, 1);
});

test('visibility, window focus and page lifecycle discard interrupted exposure and stale observer callbacks', () => {
  const f = fixture();
  f.observer.deliver([f.entry(1)]); f.advance(999);
  const old = f.observer;
  f.doc.visibilityState = 'hidden'; f.doc.dispatchEvent(new Event('visibilitychange')); f.advance(3000);
  f.doc.visibilityState = 'visible'; f.doc.dispatchEvent(new Event('visibilitychange'));
  old.deliver([f.entry(1)]); f.advance(2000);
  assert.equal(f.reports, 0);
  f.observer.deliver([f.entry(1)]); f.advance(999);
  f.win.dispatchEvent(new Event('blur')); f.win.dispatchEvent(new Event('focus')); f.advance(1000);
  assert.equal(f.reports, 0);
  f.observer.deliver([f.entry(1)]); f.advance(999);
  f.win.dispatchEvent(new Event('pagehide')); f.win.dispatchEvent(new Event('pageshow')); f.advance(1000);
  assert.equal(f.reports, 0);
  f.observer.deliver([f.entry(1)]); f.advance(1000);
  assert.equal(f.reports, 1);
});

test('unmounting or removing a card never dispatches a billable token', () => {
  for (const dispose of [f => f.cleanup(), f => { f.element.isConnected = false; }]) {
    const f = fixture(); f.observer.deliver([f.entry(1)]); f.advance(999);
    dispose(f); f.advance(1);
    assert.equal(f.reports, 0); f.cleanup();
  }
});
