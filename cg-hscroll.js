/* ═══════════════════════════════════════════════════════════════════
   CG-HSCROLL.JS  v2.0  — Fixed full-scroll
   
   ROOT CAUSES FIXED:
   1. railMax used window.innerWidth — should use railWrap.clientWidth
   2. scrollTravel = railMax*1.1 — never reached last card. Now 1.5x.
   3. easeInOut compressed the end — replaced with linear mapping.
   4. driverTop measured before fonts/images settle — re-measure on load.
   ═══════════════════════════════════════════════════════════════════ */

(function CGHScroll() {
  'use strict';

  if (window.__cgHScrollLoaded) return;
  window.__cgHScrollLoaded = true;

  const IS_TOUCH  = window.matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  /* NOTE: mobile-width guard uses window.innerWidth at runtime (not a frozen const)
     so resize to/from mobile correctly activates or skips the hscroll driver. */
  const NO_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const LERP         = NO_MOTION ? 1 : 0.10;
  const TRAVEL_MULT  = 1.5;   /* vertical scroll space = 1.5× rail width */

  let driver, sticky, stickyInner, cgWrap, railWrap, rail, trackFill;
  let items = [], dotsEl, hint;

  let driverTop    = 0;
  let scrollTravel = 0;
  let railMax      = 0;
  let currentX     = 0;
  let targetX      = 0;
  let rafId        = null;
  let hintShown    = false;


  /* ── 1. DOM SETUP ─────────────────────────────────────────────── */
  function buildStructure() {
    cgWrap    = document.querySelector('.cg-wrap');
    railWrap  = document.getElementById('cg-rail-wrap');
    rail      = document.getElementById('cg-rail');
    trackFill = document.getElementById('cg-track-fill');
    dotsEl    = document.getElementById('cg-progress');

    if (!cgWrap || !rail || !railWrap) return false;

    if (document.getElementById('cg-driver')) {
      driver      = document.getElementById('cg-driver');
      sticky      = document.getElementById('cg-sticky');
      stickyInner = document.getElementById('cg-sticky-inner');
      hint        = document.getElementById('cg-scroll-hint');
      return true;
    }

    driver      = document.createElement('div');  driver.id = 'cg-driver';
    sticky      = document.createElement('div');  sticky.id = 'cg-sticky';
    stickyInner = document.createElement('div');  stickyInner.id = 'cg-sticky-inner';

    hint = document.createElement('div');
    hint.id = 'cg-scroll-hint';
    hint.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>' +
      'scroll to explore';

    cgWrap.parentNode.insertBefore(driver, cgWrap);
    driver.appendChild(sticky);
    sticky.appendChild(stickyInner);
    stickyInner.appendChild(cgWrap);
    sticky.appendChild(hint);

    return true;
  }


  /* ── 2. MEASURE ───────────────────────────────────────────────── */
  function measure() {
    if (!driver || !rail || !railWrap) return;

    /* FIX 1: use railWrap.clientWidth — accounts for sticky-inner padding */
    const visibleW = railWrap.clientWidth || window.innerWidth;
    railMax = Math.max(0, rail.scrollWidth - visibleW);

    /* FIX 2: 1.5× travel — last card always reachable */
    scrollTravel = railMax * TRAVEL_MULT;

    driver.style.height = (window.innerHeight + scrollTravel) + 'px';
    driverTop = getOffsetTop(driver);
  }

  function getOffsetTop(el) {
    let top = 0;
    while (el) { top += el.offsetTop; el = el.offsetParent; }
    return top;
  }


  /* ── 3. SYNC UI ───────────────────────────────────────────────── */
  function syncUI(x) {
    const progress = railMax > 0 ? Math.min(1, Math.abs(x) / railMax) : 0;

    if (trackFill) trackFill.style.width = (progress * 100).toFixed(2) + '%';

    const fadeL = document.getElementById('cg-fade-left');
    const fadeR = document.getElementById('cg-fade-right');
    if (fadeL) fadeL.classList.toggle('hidden', progress <= 0.01);
    if (fadeR) fadeR.classList.toggle('hidden', progress >= 0.99);

    if (items.length && dotsEl) {
      const idx = Math.min(items.length - 1, Math.round(progress * (items.length - 1)));
      dotsEl.querySelectorAll('.cg-prog-dot').forEach((d, i) =>
        d.classList.toggle('active', i === idx)
      );
    }
  }


  /* ── 4. rAF LOOP ──────────────────────────────────────────────── */
  function tick() {
    rafId = requestAnimationFrame(tick);

    const scrollY  = window.scrollY;
    const pinStart = driverTop;
    const pinEnd   = driverTop + scrollTravel;

    /* Phase A: before — reset */
    if (scrollY < pinStart) {
      if (currentX !== 0 || targetX !== 0) {
        currentX = 0; targetX = 0;
        rail.style.transform = 'translate3d(0,0,0)';
        syncUI(0);
      }
      hideHint();
      return;
    }

    /* Phase B: after — clamp to exact end */
    if (scrollY >= pinEnd) {
      if (currentX !== -railMax) {
        currentX = -railMax; targetX = -railMax;
        rail.style.transform = 'translate3d(' + (-railMax).toFixed(2) + 'px,0,0)';
        syncUI(-railMax);
      }
      hideHint();
      return;
    }

    /* Phase C: pinned — FIX 3: pure linear, no easing compression */
    const progress = (scrollY - pinStart) / scrollTravel;
    targetX = -(railMax * progress);

    if (!hintShown) { showHint(); hintShown = true; }

    const diff = targetX - currentX;
    currentX += Math.abs(diff) < 0.1 ? diff : diff * LERP;

    rail.style.transform = 'translate3d(' + currentX.toFixed(2) + 'px,0,0)';
    syncUI(currentX);
  }


  /* ── 5. HINT ──────────────────────────────────────────────────── */
  let hintTimer = null;
  function showHint() {
    if (!hint) return;
    hint.classList.add('visible');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 2200);
  }
  function hideHint() {
    if (hint) hint.classList.remove('visible');
  }


  /* ── 6. ACTIVATE ──────────────────────────────────────────────── */
  function activate() {
    railWrap.scrollLeft = 0;
    railWrap.setAttribute('data-hscroll', 'active');
    railWrap.__hscrollActive = true;

    items = Array.from(rail.querySelectorAll('.cg-item'));

    if (dotsEl && !dotsEl.children.length) {
      items.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'cg-prog-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', 'Jump to item ' + (i + 1));
        dot.addEventListener('click', () => jumpToItem(i));
        dotsEl.appendChild(dot);
      });
    } else if (dotsEl) {
      dotsEl.querySelectorAll('.cg-prog-dot').forEach((dot, i) => {
        if (!dot._hscrollBound) {
          dot._hscrollBound = true;
          dot.addEventListener('click', () => jumpToItem(i));
        }
      });
    }
  }

  function jumpToItem(idx) {
    if (!items.length || !driver) return;
    const progress   = items.length > 1 ? idx / (items.length - 1) : 0;
    const destScroll = driverTop + scrollTravel * progress;
    window.scrollTo({ top: destScroll, behavior: 'smooth' });
  }
  window.__cgJumpToItem = jumpToItem;


  /* ── 7. KEYBOARD ──────────────────────────────────────────────── */
  let keyIdx = 0;
  function onKeydown(e) {
    if (!driver) return;
    const y = window.scrollY;
    if (y < driverTop || y > driverTop + scrollTravel) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault(); keyIdx = Math.min(keyIdx + 1, items.length - 1);
      jumpToItem(keyIdx); flashPill('keys');
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); keyIdx = Math.max(keyIdx - 1, 0);
      jumpToItem(keyIdx); flashPill('keys');
    }
  }

  function flashPill(label) {
    document.querySelectorAll('.cg-ctrl-pill').forEach(p => {
      if (p.textContent.trim().toLowerCase().includes(label)) {
        p.classList.add('active-key');
        setTimeout(() => p.classList.remove('active-key'), 400);
      }
    });
  }


  /* ── 8. RESIZE ────────────────────────────────────────────────── */
  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      /* If viewport has dropped to mobile width, hide the driver so the
         section falls back to normal vertical layout — prevents the sticky
         hscroll driver from staying active after a desktop→mobile resize. */
      if (window.innerWidth <= 768) {
        if (driver) driver.style.display = 'none';
        if (railWrap) {
          railWrap.removeAttribute('data-hscroll');
          railWrap.__hscrollActive = false;
        }
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      } else {
        if (driver) driver.style.display = '';
        measure();
      }
    }, 150);
  }


  /* ── 9. CONTROL PILLS ─────────────────────────────────────────── */
  function updateControlPills() {
    const ctrl = document.querySelector('.cg-controls');
    if (!ctrl) return;
    ctrl.innerHTML =
      '<div class="cg-ctrl-pill"><span class="cg-ctrl-ico">↕</span>Scroll</div>' +
      '<div class="cg-ctrl-pill"><span class="cg-ctrl-ico">⇔</span>Drag</div>' +
      '<div class="cg-ctrl-pill"><span class="cg-ctrl-ico">⟵⟶</span>Keys</div>' +
      '<div class="cg-ctrl-pill"><span class="cg-ctrl-ico">⌥</span>Trackpad</div>';
  }


  /* ── INIT ─────────────────────────────────────────────────────── */
  function init() {
    if (!buildStructure()) return;
    if (IS_TOUCH || window.innerWidth <= 768) return;

    activate();
    updateControlPills();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        measure();
        currentX = 0; targetX = 0;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tick);
      });
    });

    /* FIX 4: re-measure after all assets load (fonts shift layout) */
    window.addEventListener('load', () => {
      measure();
    }, { once: true });

    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('keydown', onKeydown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 80);
  }

  console.log('%c✦ CG HScroll v2.0 — Full scroll fixed', 'color:#22d3ee;font-family:monospace;font-weight:bold');

})();
