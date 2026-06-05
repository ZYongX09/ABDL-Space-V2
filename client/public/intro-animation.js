/**
 * Intro Animation — Starfield + Logo Assembly
 * Runs on every full page load, before React hydrates.
 * The target page loads in background while animation plays.
 * Skipped on SPA in-page navigation (React already mounted).
 */
(function () {
  'use strict';

  // Skip if already mounted (SPA navigation)
  if (window.__introMounted) {
    var ph = document.getElementById('intro-placeholder');
    if (ph) ph.parentNode.removeChild(ph);
    return;
  }

  // Remove static placeholder (animation takes over)
  var placeholder = document.getElementById('intro-placeholder');

  var FLY_DURATION = 4000;
  var SPREAD = 1500;
  var DEPTH = 3000;
  var STAR_COUNT = 2000;
  var LOGO_STAR_COUNT = 600;
  var LOGO_URL = 'https://img.abdl-space.top/file/1779879250278_ABDL_icon.svg';

  // --- Bezier easing ---
  function createBezier(x1, y1, x2, y2) {
    function sampleCurveX(t) { return ((1 - 3*x2 + 3*x1)*t + (3*x2 - 6*x1))*t + 3*x1*t; }
    function sampleCurveY(t) { return ((1 - 3*y2 + 3*y1)*t + (3*y2 - 6*y1))*t + 3*y1*t; }
    function sampleCurveDerivativeX(t) { return (3*(1 - 3*x2 + 3*x1)*t + 2*(3*x2 - 6*x1))*t + 3*x1; }
    function solveCurveX(x) {
      var t = x;
      for (var i = 0; i < 8; i++) {
        var err = sampleCurveX(t) - x;
        if (Math.abs(err) < 1e-6) return t;
        t -= err / sampleCurveDerivativeX(t);
      }
      return t;
    }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      return sampleCurveY(solveCurveX(x));
    };
  }
  var easeApple = createBezier(0.25, 0.1, 0, 1);

  // --- Build overlay ---
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

  document.body.appendChild(overlay);
  if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);

  // --- Responsive ---
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

  // --- Canvas setup ---
  var W, H;
  var ctx = canvas.getContext('2d');
  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // --- Stars ---
  var stars = [];
  var cameraZ = 0, cameraX = 0, cameraY = 0;
  var animProgress = 0, isAnimating = false, isComplete = false;
  var mouseDown = false, mouseX = 0, mouseY = 0, dragVelX = 0, dragVelY = 0;

  function Star(x, y, z, targetX, targetY, targetZ) {
    this.x = x; this.y = y; this.z = z;
    this.targetX = targetX; this.targetY = targetY; this.targetZ = targetZ;
    this.rx = x; this.ry = y; this.rz = z;
    this.size = 0.5 + Math.random() * 2;
    this.brightness = 0.3 + Math.random() * 0.7;
    this.twinkleSpeed = 0.5 + Math.random() * 2;
    this.twinkleOffset = Math.random() * Math.PI * 2;
    this.isLogo = targetX !== undefined;
  }

  // --- Load logo ---
  var logoPointsCache = null;

  function loadLogoPoints(count) {
    if (logoPointsCache) return Promise.resolve(logoPointsCache);
    return fetch(LOGO_URL)
      .then(function (res) { return res.text(); })
      .then(function (svgText) {
        var parser = new DOMParser();
        var doc = parser.parseFromString(svgText, 'image/svg+xml');
        var paths = doc.querySelectorAll('path');
        var viewBox = doc.querySelector('svg').getAttribute('viewBox');
        var vbW = 8669, vbH = 8669;
        if (viewBox) {
          var parts = viewBox.split(/[\s,]+/).map(Number);
          vbW = parts[2]; vbH = parts[3];
        }
        var sampleSize = 600;
        var offscreen = document.createElement('canvas');
        offscreen.width = sampleSize; offscreen.height = sampleSize;
        var octx = offscreen.getContext('2d');
        octx.clearRect(0, 0, sampleSize, sampleSize);
        octx.save();
        octx.scale(sampleSize / vbW, sampleSize / vbH);
        for (var k = 0; k < paths.length; k++) {
          var d = paths[k].getAttribute('d');
          if (d) octx.fill(new Path2D(d));
        }
        octx.restore();

        var imgData = octx.getImageData(0, 0, sampleSize, sampleSize);
        var filled = new Uint8Array(sampleSize * sampleSize);
        for (var y = 0; y < sampleSize; y++) {
          for (var x = 0; x < sampleSize; x++) {
            if (imgData.data[(y * sampleSize + x) * 4 + 3] > 64) filled[y * sampleSize + x] = 1;
          }
        }

        var edgePoints = [], fillPoints = [];
        for (var y = 1; y < sampleSize - 1; y += 2) {
          for (var x = 1; x < sampleSize - 1; x += 2) {
            if (!filled[y * sampleSize + x]) continue;
            var isEdge = !filled[(y-1)*sampleSize+x] || !filled[(y+1)*sampleSize+x] ||
                         !filled[y*sampleSize+x-1] || !filled[y*sampleSize+x+1];
            var px = (x - sampleSize/2) * 0.5;
            var py = (y - sampleSize/2) * 0.5;
            if (isEdge) edgePoints.push({ x: px, y: py });
            else fillPoints.push({ x: px, y: py });
          }
        }

        var result = [];
        var edgeCount = Math.floor(count * 0.8);
        var edgeStep = Math.max(1, Math.floor(edgePoints.length / edgeCount));
        for (var i = 0; i < edgePoints.length && result.length < edgeCount; i += edgeStep) result.push(edgePoints[i]);
        var fillStep = Math.max(1, Math.floor(fillPoints.length / (count - edgeCount)));
        for (var i = 0; i < fillPoints.length && result.length < count; i += fillStep) result.push(fillPoints[i]);
        while (result.length < count) {
          if (edgePoints.length === 0) {
            var angle = (result.length / count) * Math.PI * 2;
            result.push({ x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 });
          } else {
            result.push(edgePoints[Math.floor(Math.random() * edgePoints.length)]);
          }
        }

        logoPointsCache = result.slice(0, count);
        return logoPointsCache;
      })
      .catch(function (err) {
        console.warn('[intro-animation] Logo SVG fetch failed, using fallback circle:', err);
        var result = [];
        for (var i = 0; i < count; i++) {
          var angle = (i / count) * Math.PI * 2;
          result.push({ x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 });
        }
        logoPointsCache = result;
        return result;
      });
  }

  // --- Init stars ---
  function initStars() {
    stars = [];
    return loadLogoPoints(LOGO_STAR_COUNT).then(function (logoPoints) {
      for (var i = 0; i < LOGO_STAR_COUNT; i++) {
        var lp = logoPoints[i];
        stars.push(new Star(
          (Math.random()-0.5)*SPREAD, (Math.random()-0.5)*SPREAD, Math.random()*DEPTH,
          lp.x, lp.y, 0
        ));
      }
      for (var i = 0; i < STAR_COUNT - LOGO_STAR_COUNT; i++) {
        stars.push(new Star(
          (Math.random()-0.5)*SPREAD*2, (Math.random()-0.5)*SPREAD*2, Math.random()*DEPTH
        ));
      }
    });
  }

  // --- RAF loop ---
  var rafId = null;
  var lastTime = 0;

  function tick(time) {
    var delta = Math.min(time - lastTime, 50);
    lastTime = time;
    var sec = time / 1000;

    ctx.clearRect(0, 0, W, H);
    var grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, '#0a0a12');
    grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    var fov = 600;
    var sorted = stars.map(function (s) {
      if (s.isLogo) {
        var t = animProgress;
        s.rx = s.x + (s.targetX - s.x) * t;
        s.ry = s.y + (s.targetY - s.y) * t;
        s.rz = s.z + (0 - s.z) * t + cameraZ;
      } else {
        s.rx = s.x; s.ry = s.y; s.rz = s.z + cameraZ;
      }
      return s;
    }).sort(function (a, b) { return b.rz - a.rz; });

    for (var i = 0; i < sorted.length; i++) {
      var star = sorted[i];
      var z = star.rz;
      if (z < -fov + 100) continue;
      var scale = fov / (fov + z);
      var sx = W/2 + (star.rx - cameraX) * scale;
      var sy = H/2 + (star.ry - cameraY) * scale;
      if (sx < -50 || sx > W+50 || sy < -50 || sy > H+50) continue;

      var twinkle = 0.5 + 0.5 * Math.sin(sec * star.twinkleSpeed + star.twinkleOffset);
      var alpha = star.brightness * twinkle * scale;
      if (star.isLogo && animProgress > 0.3) {
        var logoAlpha = (animProgress - 0.3) / 0.7;
        alpha = Math.max(alpha, logoAlpha * scale);
      }
      var size = star.size * scale;

      if (star.isLogo && animProgress > 0.5) {
        var t = (star.targetX + 150) / 300;
        var hue = 200 + t * 140;
        ctx.fillStyle = 'hsla(' + hue + ', 80%, 75%, ' + Math.min(1, alpha) + ')';
      } else {
        ctx.fillStyle = 'rgba(200, 210, 240, ' + Math.min(1, alpha) + ')';
      }
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.5, size), 0, Math.PI * 2);
      ctx.fill();
    }

    // Connections
    if (animProgress > 0.6) {
      var lineAlpha = (animProgress - 0.6) / 0.4 * 0.15;
      ctx.strokeStyle = 'rgba(168, 216, 240, ' + lineAlpha + ')';
      ctx.lineWidth = 0.5;
      var logoStars = sorted.filter(function (s) { return s.isLogo && s.rz > -fov + 100; });
      for (var i = 0; i < logoStars.length; i++) {
        var a = logoStars[i];
        var ax = W/2 + (a.rx - cameraX) * (fov / (fov + a.rz));
        var ay = H/2 + (a.ry - cameraY) * (fov / (fov + a.rz));
        for (var j = i + 1; j < Math.min(i + 8, logoStars.length); j++) {
          var b = logoStars[j];
          var bx = W/2 + (b.rx - cameraX) * (fov / (fov + b.rz));
          var by = H/2 + (b.ry - cameraY) * (fov / (fov + b.rz));
          if (Math.hypot(ax - bx, ay - by) < 40) {
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          }
        }
      }
    }

    // Momentum
    if (!mouseDown && !isAnimating) {
      cameraX += dragVelX * 0.3;
      cameraY += dragVelY * 0.3;
      dragVelX *= 0.92; dragVelY *= 0.92;
      cameraX *= 0.98; cameraY *= 0.98;
    }

    rafId = requestAnimationFrame(tick);
  }

  // --- State ---
  var reactReady = false;
  var fullAnim = true;
  try { fullAnim = localStorage.getItem('abdl_intro_full_anim') !== 'false'; } catch (e) {}
  var skipBtnWrap = null;
  var skipBtnTimer = null;
  var dismissTimer = null;
  var fadeOutTimer = null;
  var failsafeTimer = null;
  var cleaned = false;

  // --- Cleanup ---
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    window.removeEventListener('resize', resize);
    mq.removeEventListener('change', applyMobile);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchend', onTouchEnd);
    if (failsafeTimer) { clearTimeout(failsafeTimer); failsafeTimer = null; }
    if (fadeOutTimer) { clearTimeout(fadeOutTimer); fadeOutTimer = null; }
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
    if (skipBtnTimer) { clearTimeout(skipBtnTimer); skipBtnTimer = null; }
    window.__introMounted = true;
  }

  // --- Fade out ---
  function fadeOutAndCleanup() {
    if (cleaned) return;
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
    if (skipBtnTimer) { clearTimeout(skipBtnTimer); skipBtnTimer = null; }
    overlay.style.opacity = '0';
    fadeOutTimer = setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      cleanup();
    }, 800);
  }

  function shouldShowButtons() {
    try { return !!localStorage.getItem('abdl_active_account'); } catch (e) { return false; }
  }

  // --- Skip/close buttons ---
  function showSkipButtons() {
    if (skipBtnWrap || cleaned) return;

    skipBtnWrap = document.createElement('div');
    skipBtnWrap.style.cssText = 'position:absolute;bottom:80px;right:20px;display:flex;flex-direction:column;gap:6px;align-items:flex-end;opacity:0;transition:opacity 0.6s ease;pointer-events:auto;z-index:10;';

    var skipBtn = document.createElement('button');
    skipBtn.textContent = '跳过动画';
    skipBtn.style.cssText = 'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.4);font-size:12px;padding:5px 12px;border-radius:16px;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font-family:-apple-system,BlinkMacSystemFont,sans-serif;transition:background 0.2s,color 0.2s;';
    skipBtn.onmouseenter = function () { skipBtn.style.background = 'rgba(255,255,255,0.15)'; skipBtn.style.color = 'rgba(255,255,255,0.7)'; };
    skipBtn.onmouseleave = function () { skipBtn.style.background = 'rgba(255,255,255,0.08)'; skipBtn.style.color = 'rgba(255,255,255,0.4)'; };
    skipBtn.onclick = function () { fadeOutAndCleanup(); };

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '永久关闭动画';
    closeBtn.style.cssText = 'background:transparent;border:none;color:rgba(255,255,255,0.2);font-size:11px;padding:3px 8px;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,sans-serif;transition:color 0.2s;text-decoration:underline;text-underline-offset:2px;';
    closeBtn.onmouseenter = function () { closeBtn.style.color = 'rgba(255,255,255,0.5)'; };
    closeBtn.onmouseleave = function () { closeBtn.style.color = 'rgba(255,255,255,0.2)'; };
    closeBtn.onclick = function () {
      try { localStorage.setItem('abdl_intro_full_anim', 'false'); } catch (e) {}
      fadeOutAndCleanup();
    };

    skipBtnWrap.appendChild(skipBtn);
    skipBtnWrap.appendChild(closeBtn);
    overlay.appendChild(skipBtnWrap);
    overlay.style.pointerEvents = 'auto';
    requestAnimationFrame(function () { skipBtnWrap.style.opacity = '1'; });
  }

  // --- Central finish logic ---
  // Called whenever a major state change happens (animation done OR React ready)
  function scheduleFinish() {
    if (cleaned) return;

    // Case 1: Animation still playing + React ready → show skip buttons
    if (isAnimating && reactReady && fullAnim && shouldShowButtons()) {
      if (!skipBtnWrap && !skipBtnTimer) {
        skipBtnTimer = setTimeout(showSkipButtons, 500);
      }
      return; // Wait for animation to end
    }

    // Case 2: Animation done + React ready → enter page
    if (isComplete && reactReady) {
      if (skipBtnWrap) return; // Buttons showing, let user decide
      dismissTimer = setTimeout(fadeOutAndCleanup, 1000);
      return;
    }

    // Case 3: Animation done + React NOT ready → wait (do nothing, __introReady will call again)
    // Case 4: Animation playing + React NOT ready → wait (do nothing)
  }

  // --- Fly animation ---
  function startFly() {
    if (isAnimating) return;
    isAnimating = true;
    animProgress = 0;

    var startTime = performance.now();

    function flyTick() {
      var elapsed = performance.now() - startTime;
      var cameraProgress = Math.min(1, elapsed / FLY_DURATION);
      cameraZ = -DEPTH * (1 - easeApple(cameraProgress));

      var morphStart = 0.4;
      if (cameraProgress >= morphStart) {
        animProgress = Math.min(1, (cameraProgress - morphStart) / (1 - morphStart));
      } else {
        animProgress = 0;
      }

      progressBar.style.width = (cameraProgress * 100) + '%';

      if (cameraProgress < 1) {
        requestAnimationFrame(flyTick);
      } else {
        animProgress = 1;
        isAnimating = false;
        isComplete = true;
        overlay.style.pointerEvents = 'none';
        setTimeout(function () {
          title.style.opacity = '1';
          title.style.transform = 'translateY(0)';
          subtitle.style.opacity = '1';
        }, 300);
        // Animation done → check if we can finish
        scheduleFinish();
      }
    }
    requestAnimationFrame(flyTick);
  }

  // --- React ready callback ---
  window.__introReady = function () {
    reactReady = true;
    // React ready → check if we can finish
    scheduleFinish();
  };

  // --- Input handlers ---
  function onMouseUp() { mouseDown = false; }
  function onTouchEnd() { mouseDown = false; }

  overlay.addEventListener('mousedown', function (e) {
    if (!isComplete) return;
    mouseDown = true; mouseX = e.clientX; mouseY = e.clientY;
  });
  overlay.addEventListener('mousemove', function (e) {
    if (!mouseDown) return;
    var dx = e.clientX - mouseX, dy = e.clientY - mouseY;
    cameraX -= dx * 0.5; cameraY -= dy * 0.5;
    dragVelX = dx; dragVelY = dy;
    mouseX = e.clientX; mouseY = e.clientY;
  });
  window.addEventListener('mouseup', onMouseUp);

  overlay.addEventListener('touchstart', function (e) {
    if (!isComplete) return;
    mouseDown = true;
    mouseX = e.touches[0].clientX; mouseY = e.touches[0].clientY;
  }, { passive: true });
  overlay.addEventListener('touchmove', function (e) {
    if (!mouseDown) return;
    var dx = e.touches[0].clientX - mouseX, dy = e.touches[0].clientY - mouseY;
    cameraX -= dx * 0.5; cameraY -= dy * 0.5;
    dragVelX = dx; dragVelY = dy;
    mouseX = e.touches[0].clientX; mouseY = e.touches[0].clientY;
  }, { passive: true });
  window.addEventListener('touchend', onTouchEnd);

  // --- Boot ---
  initStars().then(function () {
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
    startFly();
  });

  // Failsafe
  failsafeTimer = setTimeout(function () {
    if (overlay.parentNode) fadeOutAndCleanup();
  }, 15000);
})();
