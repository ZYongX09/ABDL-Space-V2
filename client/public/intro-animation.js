/**
 * Intro Animation — Starfield + Logo Assembly
 */
(function () {
  'use strict';

  // Skip if already played this session (prevents re-trigger on /external redirects etc.)
  try { if (sessionStorage.getItem('intro_played')) { var ph0 = document.getElementById('intro-placeholder'); if (ph0) ph0.remove(); return; } } catch (e) {}

  if (window.__introMounted) {
    var ph0 = document.getElementById('intro-placeholder');
    if (ph0) ph0.remove();
    return;
  }

  var placeholder = document.getElementById('intro-placeholder');
  var FLY_DURATION = 4000;
  var SPREAD = 1200;
  var DEPTH = 2400;
  var STAR_COUNT = 1500;
  var LOGO_STAR_COUNT = 500;
  var LOGO_URL = '/intro/logo.svg';

  function createBezier(x1, y1, x2, y2) {
    function sampleCurveX(t) { return ((1 - 3*x2 + 3*x1)*t + (3*x2 - 6*x1))*t + 3*x1*t; }
    function sampleCurveY(t) { return ((1 - 3*y2 + 3*y1)*t + (3*y2 - 6*y1))*t + 3*y1*t; }
    function sampleCurveDerivativeX(t) { return (3*(1 - 3*x2 + 3*x1)*t + 2*(3*x2 - 6*x1))*t + 3*x1; }
    function solveCurveX(x) {
      var t = x;
      for (var i = 0; i < 8; i++) { var err = sampleCurveX(t) - x; if (Math.abs(err) < 1e-6) return t; t -= err / sampleCurveDerivativeX(t); }
      return t;
    }
    return function (x) { if (x <= 0) return 0; if (x >= 1) return 1; return sampleCurveY(solveCurveX(x)); };
  }
  var easeApple = createBezier(0.25, 0.1, 0, 1);

  // Check settings
  var fullAnim = true;
  try { fullAnim = localStorage.getItem('abdl_intro_full_anim') !== 'false'; } catch (e) {}

  var overlay = document.createElement('div');
  overlay.id = 'intro-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;opacity:1;transition:opacity 0.8s ease;';

  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  overlay.appendChild(canvas);

  var titleWrap = document.createElement('div');
  titleWrap.style.cssText = 'position:absolute;bottom:40px;left:50%;transform:translateX(-50%);text-align:center;width:90%;max-width:600px;pointer-events:none;';

  var title = document.createElement('h1');
  title.textContent = 'ABDL Space';
  title.style.cssText = 'font-size:2rem;font-weight:700;color:#fff;margin:0;opacity:0;transform:translateY(20px);transition:all 0.8s cubic-bezier(0.25,0.1,0,1);font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

  var subtitle = document.createElement('p');
  subtitle.textContent = '探索全新世界';
  subtitle.style.cssText = 'font-size:0.9rem;color:rgba(255,255,255,0.5);margin-top:8px;opacity:0;transition:opacity 0.6s ease 0.4s;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);
  overlay.appendChild(titleWrap);

  var progressBar = document.createElement('div');
  progressBar.style.cssText = 'position:absolute;bottom:0;left:0;height:2px;background:linear-gradient(90deg,#A8D8F0,#FFB7C5);transition:width 0.1s linear;width:0%;';
  overlay.appendChild(progressBar);

  // Skip buttons — top right
  var isMobile = /Android|iPhone|iPod/i.test(navigator.userAgent) && !/iPad|Tablet/i.test(navigator.userAgent);
  if (fullAnim) {
    var skipWrap = document.createElement('div');
    skipWrap.style.cssText = 'position:absolute;top:16px;right:16px;display:flex;gap:8px;opacity:0;transition:opacity 0.6s ease 1s;pointer-events:auto;z-index:10;';

    // 永久关闭 — desktop only
    if (!isMobile) {
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '永久关闭';
      closeBtn.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.2);font-size:11px;padding:6px 12px;border-radius:20px;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,sans-serif;transition:all 0.2s;';
      closeBtn.onmouseenter = function(){closeBtn.style.color='rgba(255,255,255,0.5)';closeBtn.style.borderColor='rgba(255,255,255,0.15)';};
      closeBtn.onmouseleave = function(){closeBtn.style.color='rgba(255,255,255,0.2)';closeBtn.style.borderColor='rgba(255,255,255,0.06)';};
      closeBtn.onclick = function(){try{localStorage.setItem('abdl_intro_full_anim','false');}catch(e){}fadeOutAndCleanup();};
      skipWrap.appendChild(closeBtn);
    }

    var skipBtn = document.createElement('button');
    skipBtn.textContent = '跳过';
    skipBtn.style.cssText = 'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.35);font-size:12px;padding:6px 14px;border-radius:20px;cursor:pointer;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font-family:-apple-system,BlinkMacSystemFont,sans-serif;transition:all 0.2s;letter-spacing:0.5px;';
    skipBtn.onmouseenter = function(){skipBtn.style.background='rgba(255,255,255,0.12)';skipBtn.style.color='rgba(255,255,255,0.6)';skipBtn.style.borderColor='rgba(255,255,255,0.2)';};
    skipBtn.onmouseleave = function(){skipBtn.style.background='rgba(255,255,255,0.06)';skipBtn.style.color='rgba(255,255,255,0.35)';skipBtn.style.borderColor='rgba(255,255,255,0.1)';};
    skipBtn.onclick = function(){fadeOutAndCleanup();};

    skipWrap.appendChild(skipBtn);
    overlay.appendChild(skipWrap);
    requestAnimationFrame(function(){skipWrap.style.opacity='1';});
  }

  document.body.appendChild(overlay);
  if (placeholder) placeholder.remove();

  var mq = window.matchMedia('(max-width: 768px)');
  function applyMobile(e) {
    if (e.matches) {
      title.style.fontSize = '1.4rem';
      subtitle.style.fontSize = '0.8rem';
      subtitle.style.marginTop = '4px';
      titleWrap.style.bottom = '24px';
      progressBar.style.height = '1px';
    }
  }
  applyMobile(mq);
  mq.addEventListener('change', applyMobile);

  var W, H;
  var ctx = canvas.getContext('2d');
  function resize() { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; }
  window.addEventListener('resize', resize);
  resize();

  var stars = [];
  var cameraZ = 0, cameraX = 0, cameraY = 0;
  var animProgress = 0, isAnimating = false, isComplete = false;
  var mouseDown = false, mouseX = 0, mouseY = 0, dragVelX = 0, dragVelY = 0;

  function Star(x, y, z, tx, ty, tz) {
    this.x = x; this.y = y; this.z = z; this.targetX = tx; this.targetY = ty; this.targetZ = tz;
    this.rx = x; this.ry = y; this.rz = z;
    this.size = 0.5 + Math.random() * 2; this.brightness = 0.3 + Math.random() * 0.7;
    this.twinkleSpeed = 0.5 + Math.random() * 2; this.twinkleOffset = Math.random() * Math.PI * 2;
    this.isLogo = tx !== undefined;
  }

  // Pre-allocated sort buffer to avoid GC pressure
  var sortBuf = [];

  var logoPointsCache = null;
  function loadLogoPoints(count) {
    if (logoPointsCache) return Promise.resolve(logoPointsCache);
    return fetch(LOGO_URL).then(function (r) { return r.text(); }).then(function (svg) {
      var doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      var paths = doc.querySelectorAll('path');
      var vb = doc.querySelector('svg').getAttribute('viewBox');
      var vbW = 8669, vbH = 8669;
      if (vb) { var p = vb.split(/[\s,]+/).map(Number); vbW = p[2]; vbH = p[3]; }
      var sz = 600, off = document.createElement('canvas');
      off.width = sz; off.height = sz;
      var oc = off.getContext('2d');
      oc.save(); oc.scale(sz / vbW, sz / vbH);
      for (var k = 0; k < paths.length; k++) { var d = paths[k].getAttribute('d'); if (d) oc.fill(new Path2D(d)); }
      oc.restore();
      var img = oc.getImageData(0, 0, sz, sz);
      var filled = new Uint8Array(sz * sz);
      for (var y = 0; y < sz; y++) for (var x = 0; x < sz; x++) if (img.data[(y * sz + x) * 4 + 3] > 64) filled[y * sz + x] = 1;
      var ep = [], fp = [];
      for (var y = 1; y < sz - 1; y += 2) for (var x = 1; x < sz - 1; x += 2) {
        if (!filled[y * sz + x]) continue;
        var ie = !filled[(y-1)*sz+x] || !filled[(y+1)*sz+x] || !filled[y*sz+x-1] || !filled[y*sz+x+1];
        var px = (x - sz/2) * 0.5, py = (y - sz/2) * 0.5;
        if (ie) ep.push({x:px,y:py}); else fp.push({x:px,y:py});
      }
      var res = [], ec = Math.floor(count * 0.8), es = Math.max(1, Math.floor(ep.length / ec));
      for (var i = 0; i < ep.length && res.length < ec; i += es) res.push(ep[i]);
      var fs = Math.max(1, Math.floor(fp.length / (count - ec)));
      for (var i = 0; i < fp.length && res.length < count; i += fs) res.push(fp[i]);
      while (res.length < count) { if (ep.length === 0) { var a = (res.length/count)*Math.PI*2; res.push({x:Math.cos(a)*100,y:Math.sin(a)*100}); } else res.push(ep[Math.floor(Math.random()*ep.length)]); }
      logoPointsCache = res.slice(0, count); return logoPointsCache;
    }).catch(function () {
      var r = []; for (var i = 0; i < count; i++) { var a = (i/count)*Math.PI*2; r.push({x:Math.cos(a)*100,y:Math.sin(a)*100}); }
      logoPointsCache = r; return r;
    });
  }

  function initStars() {
    stars = [];
    return loadLogoPoints(LOGO_STAR_COUNT).then(function (lp) {
      for (var i = 0; i < LOGO_STAR_COUNT; i++) stars.push(new Star((Math.random()-0.5)*SPREAD, (Math.random()-0.5)*SPREAD, Math.random()*DEPTH, lp[i].x, lp[i].y, 0));
      for (var i = 0; i < STAR_COUNT - LOGO_STAR_COUNT; i++) stars.push(new Star((Math.random()-0.5)*SPREAD*2, (Math.random()-0.5)*SPREAD*2, Math.random()*DEPTH));
    });
  }

  var rafId = null, lastTime = 0;
  var fov = 600, fovInv = 1 / fov;

  function tick(time) {
    var dt = Math.min(time - lastTime, 50); lastTime = time; var sec = time * 0.001;
    ctx.clearRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W*0.5, H*0.5, 0, W*0.5, H*0.5, Math.max(W, H) * 0.7);
    g.addColorStop(0, '#0a0a12'); g.addColorStop(1, '#000000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Update positions
    var len = stars.length;
    for (var i = 0; i < len; i++) {
      var s = stars[i];
      if (s.isLogo) {
        var t = animProgress;
        s.rx = s.x + (s.targetX - s.x) * t;
        s.ry = s.y + (s.targetY - s.y) * t;
        s.rz = s.z + (0 - s.z) * t + cameraZ;
      } else {
        s.rx = s.x; s.ry = s.y; s.rz = s.z + cameraZ;
      }
      s._sortZ = s.rz;
    }

    // Sort by z (reuse buffer)
    sortBuf.length = len;
    for (var i = 0; i < len; i++) sortBuf[i] = i;
    sortBuf.sort(function (a, b) { return stars[b]._sortZ - stars[a]._sortZ; });

    var hw = W * 0.5, hh = H * 0.5;
    for (var n = 0; n < len; n++) {
      var s = stars[sortBuf[n]], z = s.rz;
      if (z < -fov + 100) continue;
      var sc = fov / (fov + z), sx = hw + (s.rx - cameraX) * sc, sy = hh + (s.ry - cameraY) * sc;
      if (sx < -50 || sx > W + 50 || sy < -50 || sy > H + 50) continue;

      var tw = 0.5 + 0.5 * Math.sin(sec * s.twinkleSpeed + s.twinkleOffset);
      var al = s.brightness * tw * sc;
      if (s.isLogo && animProgress > 0.3) { al = Math.max(al, ((animProgress - 0.3) * 1.4286) * sc); }
      var sz = s.size * sc;

      if (s.isLogo && animProgress > 0.5) {
        var hue = 200 + ((s.targetX + 150) * 0.00333) * 140;
        ctx.fillStyle = 'hsla(' + hue + ',80%,75%,' + Math.min(1, al) + ')';
      } else {
        ctx.fillStyle = 'rgba(200,210,240,' + Math.min(1, al) + ')';
      }
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.5, sz), 0, 6.2832); ctx.fill();
    }

    // Connections
    if (animProgress > 0.6) {
      var la = (animProgress - 0.6) * 0.375;
      ctx.strokeStyle = 'rgba(168,216,240,' + la + ')';
      ctx.lineWidth = 0.5;
      var prevAx = -999, prevAy = -999;
      for (var n = 0; n < len; n++) {
        var s = stars[sortBuf[n]];
        if (!s.isLogo || s.rz <= -fov + 100) continue;
        var ax = hw + (s.rx - cameraX) * (fov / (fov + s.rz));
        var ay = hh + (s.ry - cameraY) * (fov / (fov + s.rz));
        if (Math.hypot(ax - prevAx, ay - prevAy) < 40) {
          ctx.beginPath(); ctx.moveTo(prevAx, prevAy); ctx.lineTo(ax, ay); ctx.stroke();
        }
        prevAx = ax; prevAy = ay;
      }
    }

    if (!mouseDown && !isAnimating) { cameraX += dragVelX * 0.3; cameraY += dragVelY * 0.3; dragVelX *= 0.92; dragVelY *= 0.92; cameraX *= 0.98; cameraY *= 0.98; }
    rafId = requestAnimationFrame(tick);
  }

  var cleaned = false, fadeOutTimer = null, failsafeTimer = null;

  function cleanup() {
    if (cleaned) return; cleaned = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    window.removeEventListener('resize', resize);
    mq.removeEventListener('change', applyMobile);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchend', onTouchEnd);
    if (failsafeTimer) { clearTimeout(failsafeTimer); failsafeTimer = null; }
    if (fadeOutTimer) { clearTimeout(fadeOutTimer); fadeOutTimer = null; }
    window.__introMounted = true;
    try { sessionStorage.setItem('intro_played', '1'); } catch (e) {}
  }

  function fadeOutAndCleanup() {
    if (cleaned) return;
    overlay.style.opacity = '0';
    fadeOutTimer = setTimeout(function () { if (overlay.parentNode) overlay.remove(); cleanup(); }, 800);
  }

  window.__introReady = function () {};

  function startFly() {
    if (isAnimating) return;
    isAnimating = true; animProgress = 0;
    var startTime = performance.now();
    function flyTick() {
      var elapsed = performance.now() - startTime;
      var cp = Math.min(1, elapsed / FLY_DURATION);
      cameraZ = -DEPTH * (1 - easeApple(cp));
      var ms = 0.4;
      animProgress = cp >= ms ? Math.min(1, (cp - ms) * 1.6667) : 0;
      progressBar.style.width = (cp * 100) + '%';
      if (cp < 1) { requestAnimationFrame(flyTick); }
      else {
        animProgress = 1; isAnimating = false; isComplete = true;
        overlay.style.pointerEvents = 'none';
        setTimeout(function () { title.style.opacity='1'; title.style.transform='translateY(0)'; subtitle.style.opacity='1'; }, 300);
        setTimeout(fadeOutAndCleanup, 2000);
      }
    }
    requestAnimationFrame(flyTick);
  }

  function onMouseUp() { mouseDown = false; }
  function onTouchEnd() { mouseDown = false; }
  overlay.addEventListener('mousedown', function (e) { if (!isComplete) return; mouseDown=true; mouseX=e.clientX; mouseY=e.clientY; });
  overlay.addEventListener('mousemove', function (e) { if (!mouseDown) return; var dx=e.clientX-mouseX, dy=e.clientY-mouseY; cameraX-=dx*0.5; cameraY-=dy*0.5; dragVelX=dx; dragVelY=dy; mouseX=e.clientX; mouseY=e.clientY; });
  window.addEventListener('mouseup', onMouseUp);
  overlay.addEventListener('touchstart', function (e) { if (!isComplete) return; mouseDown=true; mouseX=e.touches[0].clientX; mouseY=e.touches[0].clientY; }, {passive:true});
  overlay.addEventListener('touchmove', function (e) { if (!mouseDown) return; var dx=e.touches[0].clientX-mouseX, dy=e.touches[0].clientY-mouseY; cameraX-=dx*0.5; cameraY-=dy*0.5; dragVelX=dx; dragVelY=dy; mouseX=e.touches[0].clientX; mouseY=e.touches[0].clientY; }, {passive:true});
  window.addEventListener('touchend', onTouchEnd);

  initStars().then(function () { lastTime = performance.now(); rafId = requestAnimationFrame(tick); startFly(); });

  failsafeTimer = setTimeout(function () { if (!cleaned && overlay.parentNode) fadeOutAndCleanup(); }, 15000);
  setTimeout(function () { if (!cleaned && overlay.parentNode) fadeOutAndCleanup(); }, 8000);
})();
