/* ═══════════════════════════════════════════════════════════════════
   ADVANCED EFFECTS — advanced-effects.js  v6.0  (Minimal Premium)
   OWNS: smooth scroll, parallax (ring only), text reveal
   STEP 2: h-left is NEVER touched. Only .h-ring gets subtle parallax.
   STEP 3: LERP_MIN=0.045, LERP_MAX=0.08 for buttery smooth scroll.
   ═══════════════════════════════════════════════════════════════════ */

(function AdvancedEffects() {
  'use strict';

  const NO_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_TOUCH  = 'ontouchstart' in window;
  const IS_MOBILE = window.innerWidth < 768;

  function lerp(a, b, t) { return a + (b - a) * t; }


  /* ════════════════════════════════════════════════════════════════
     1. SMOOTH SCROLL — Buttery lerp, no jitter
     STEP 3: LERP_MIN=0.045, LERP_MAX=0.08
  ════════════════════════════════════════════════════════════════ */
  const SmoothScroll = (() => {
    const LERP_MIN   = 0.045;  /* Step 3: premium inertia */
    const LERP_MAX   = 0.08;   /* Step 3: controlled ceiling */
    const WHEEL_MULT = 1.0;

    let current = window.scrollY;
    let target  = window.scrollY;
    let rafId   = null;
    let enabled = false;

    function clampScroll(v) {
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(v, maxY));
    }

    function getDynamicLerp() {
      const velocity = Math.abs(target - current);
      return Math.max(LERP_MIN, Math.min(LERP_MIN + velocity * 0.001, LERP_MAX));
    }

    function tick() {
      const diff = target - current;
      if (Math.abs(diff) < 0.4) {
        current = target;
        window.scrollTo(0, current);
        rafId = null;
        return;
      }
      current = lerp(current, target, getDynamicLerp());
      window.scrollTo(0, current);
      rafId = requestAnimationFrame(tick);
    }

    function start() { if (!rafId) rafId = requestAnimationFrame(tick); }

    function onWheel(e) {
      if (!enabled) return;
      // Skip if any horizontal motion — native overflow containers handle it
      if (Math.abs(e.deltaX) > 2) return;
      e.preventDefault();
      target = clampScroll(target + e.deltaY * WHEEL_MULT);
      start();
    }

    function onNativeScroll() {
      if (!rafId) { current = window.scrollY; target = window.scrollY; }
    }

    function interceptAnchors(nativeFallback) {
      document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', e => {
          const id = a.getAttribute('href').slice(1);
          if (!id) return;
          const el = document.getElementById(id);
          if (!el) return;
          e.preventDefault();
          const dest = el.getBoundingClientRect().top + window.scrollY - 68;
          if (nativeFallback) {
            window.scrollTo({ top: dest, behavior: 'smooth' });
          } else {
            current = window.scrollY;
            target  = clampScroll(dest);
            start();
          }
        });
      });
    }

    function init() {
      if (NO_MOTION || IS_TOUCH || IS_MOBILE) {
        interceptAnchors(true);
        return;
      }
      enabled = true;
      current = window.scrollY;
      target  = window.scrollY;
      window.addEventListener('wheel',  onWheel,        { passive: false });
      window.addEventListener('scroll', onNativeScroll, { passive: true  });
      interceptAnchors(false);
    }

    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     2. HERO MOTION — Ring-only parallax, max 5px movement
     STEP 2: h-left is completely static. No transforms on hero text.
             Only .h-ring gets a very subtle parallax (max 5px).
             Mouse depth DISABLED — keeps hero stable and clean.
  ════════════════════════════════════════════════════════════════ */
  const HeroMotion = (() => {
    const PARA_SPEED = 0.025;  /* very subtle: 2.5% of scroll */
    const PARA_MAX   = 5;      /* max 5px movement */

    let ring   = null;
    let heroEl = null;
    let paraOffset = 0;
    let paraTarget = 0;
    let rafId      = null;

    function updateParaTarget() {
      if (!heroEl) return;
      const scrolled = Math.min(window.scrollY, heroEl.offsetHeight);
      paraTarget = Math.min(scrolled * PARA_SPEED, PARA_MAX);
    }

    function tick() {
      rafId = null;
      paraOffset = lerp(paraOffset, paraTarget, 0.06);
      if (ring) {
        ring.style.transform = `translateY(${paraOffset.toFixed(2)}px)`;
      }
      if (Math.abs(paraTarget - paraOffset) > 0.02) {
        rafId = requestAnimationFrame(tick);
      }
    }

    function startLoop() { if (!rafId) rafId = requestAnimationFrame(tick); }

    let scrollTick = false;
    function onScroll() {
      if (!scrollTick) {
        scrollTick = true;
        requestAnimationFrame(() => { updateParaTarget(); startLoop(); scrollTick = false; });
      }
    }

    function init() {
      if (NO_MOTION) return;

      heroEl = document.getElementById('home');
      if (!heroEl) return;

      ring = document.querySelector('.h-ring');
      if (!ring) return;

      /* CRITICAL: clear any stale transforms on h-left — text stays static */
      const hLeft = document.querySelector('.h-left');
      if (hLeft) {
        hLeft.style.transform  = '';
        hLeft.style.willChange = 'auto';
      }

      window.addEventListener('scroll', onScroll, { passive: true });
      updateParaTarget();
      paraOffset = paraTarget;
    }

    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     3. TEXT REVEAL — DISABLED
     Letter-splitting .h-name was the root cause of the hero text
     visibility bug: every character started at opacity:0 inside a
     paused animation, and any failure in the class-toggle chain left
     the entire name invisible.
     Hero text is now always visible via CSS (visual-builder.css).
     The letter-reveal animation was purely cosmetic — removing it
     does not break any functional feature.
  ════════════════════════════════════════════════════════════════ */
  const TextReveal = (() => {
    function init() { /* no-op — hero text visibility owned by CSS */ }
    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     BOOT
  ════════════════════════════════════════════════════════════════ */
  function boot() {
    SmoothScroll.init();
    HeroMotion.init();
    TextReveal.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('%c✦ Advanced Effects v6.0 — Minimal Premium', 'color:#22d3ee;font-family:monospace;font-weight:bold');

})();
