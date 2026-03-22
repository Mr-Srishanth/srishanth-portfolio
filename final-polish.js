/* ═══════════════════════════════════════════════════════════════════
   FINAL-POLISH.JS  v2.0  (Minimal Premium)
   REMOVED: heavy card tilt, cursor GPU override (keep simple)
   KEPT:    button ripple, glow batching, passive section tracking,
            card data-hovered attribute, will-change cleanup
   ═══════════════════════════════════════════════════════════════════ */

(function FinalPolish() {
  'use strict';

  /* ── Single-init guard ── */
  if (window.__finalPolishLoaded) return;
  window.__finalPolishLoaded = true;

  const NO_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_TOUCH  = 'ontouchstart' in window;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }


  /* ════════════════════════════════════════════════════════════════
     1. BUTTON RIPPLE — physical press feedback
  ════════════════════════════════════════════════════════════════ */
  (() => {
    if (!document.getElementById('fp-ripple-style')) {
      const s = document.createElement('style');
      s.id = 'fp-ripple-style';
      s.textContent = `
        @keyframes fp-ripple-expand {
          0%   { transform: translate(-50%,-50%) scale(0); opacity: 0.30; }
          60%  { opacity: 0.10; }
          100% { transform: translate(-50%,-50%) scale(1); opacity: 0; }
        }
        .fp-ripple {
          position: absolute; border-radius: 50%;
          background: rgba(255,255,255,0.20);
          pointer-events: none;
          animation: fp-ripple-expand 0.55s cubic-bezier(0,0.2,0.2,1) forwards;
        }
      `;
      document.head.appendChild(s);
    }

    document.querySelectorAll('.btn-p, .btn-o, .btn-send, .nav-cta').forEach(btn => {
      if (btn.__rippleBound) return;
      btn.__rippleBound = true;
      btn.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2.5;
        const r = document.createElement('span');
        r.className = 'fp-ripple';
        r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left}px;top:${e.clientY - rect.top}px;`;
        if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
        btn.appendChild(r);
        r.addEventListener('animationend', () => r.remove(), { once: true });
      }, { passive: true });
    });
  })();


  /* ════════════════════════════════════════════════════════════════
     2. GLOW SYSTEM BATCH — queue updates behind rAF
  ════════════════════════════════════════════════════════════════ */
  (() => {
    if (NO_MOTION) return;
    const queue = [];
    let rafScheduled = false;

    function flushQueue() {
      rafScheduled = false;
      const batch = queue.splice(0);
      batch.forEach(([el, cls]) => {
        el.classList.remove('glow-idle', 'glow-hover', 'glow-active');
        el.classList.add(cls);
      });
    }

    function scheduleGlow(el, cls) {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i][0] === el) { queue.splice(i, 1); break; }
      }
      queue.push([el, cls]);
      if (!rafScheduled) { rafScheduled = true; requestAnimationFrame(flushQueue); }
    }

    const GLOW_TARGETS = [
      '.sk-card', '.pj', '.ach-card', '.about-card',
      '.vtl-card', '.cg-card', '.cert-ring-btn',
      '.btn-p', '.btn-o', '.nav-cta', '.soc', '.nav-links a',
    ];

    GLOW_TARGETS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el.__glowBound) return;          /* already bound — skip */
        el.__glowBound = true;
        el.addEventListener('mouseenter', () => scheduleGlow(el, 'glow-hover'), { passive: true });
        el.addEventListener('mouseleave', () => scheduleGlow(el, 'glow-idle'),  { passive: true });
        el.addEventListener('mousedown',  () => scheduleGlow(el, 'glow-active'),{ passive: true });
        el.addEventListener('mouseup',    () => scheduleGlow(el, 'glow-hover'), { passive: true });
      });
    });
  })();


  /* ════════════════════════════════════════════════════════════════
     3. PASSIVE SECTION TRACKING via IntersectionObserver
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const SEC_IDS  = ['home','about','skills','projects','journey','certs','contact'];
    const sections = SEC_IDS.map(id => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;
    const navLinks = [...document.querySelectorAll('.nav-links a')];
    function setActive(id) {
      navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); });
    }, { rootMargin: '-80px 0px -55% 0px', threshold: 0 });
    sections.forEach(s => io.observe(s));
  })();


  /* ════════════════════════════════════════════════════════════════
     4. CARD DATA-HOVERED — clean CSS targeting
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const CARD_SEL = '.sk-card, .pj, .ach-card, .about-card, .vtl-card, .cg-card';
    document.querySelectorAll(CARD_SEL).forEach(card => {
      card.addEventListener('mouseenter', () => {
        requestAnimationFrame(() => card.setAttribute('data-hovered', ''));
      }, { passive: true });
      card.addEventListener('mouseleave', () => {
        requestAnimationFrame(() => card.removeAttribute('data-hovered'));
      }, { passive: true });
    });
  })();


  /* ════════════════════════════════════════════════════════════════
     5. CURSOR — ALIGNED ENGINE v9.0
     ─────────────────────────────────────────────────────────────
     Architecture:
     • SOLE owner of cursor position.
     • CSS owns: transform: translate(-50%, -50%) — centers BOTH
       elements on the exact same coordinate. No manual offset math.
     • JS writes: left = mouseX, top = mouseY for BOTH elements.
       Same coordinate system → dot always centered inside ring.
     • Ring lerps at 0.2 for trailing feel. Dot snaps instantly.
     • enhancements.js uses CSS `scale` property only — no conflict.
     • Guard: window.__cursorAligned prevents double-init.
  ════════════════════════════════════════════════════════════════ */
  (() => {
    if (IS_TOUCH) return;
    if (window.__cursorAligned) return;
    window.__cursorAligned = true;

    const dot  = document.getElementById('cur-dot');
    const ring = document.getElementById('cur-ring');

    if (!dot || !ring) { document.body.style.cursor = 'default'; return; }

    /* CSS handles centering via translate(-50%,-50%) — never override transform in JS */
    dot.style.willChange  = 'left, top';
    ring.style.willChange = 'left, top';

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX  = mouseX;
    let ringY  = mouseY;
    const LERP = 0.2;

    function cursorTick() {
      ringX += (mouseX - ringX) * LERP;
      ringY += (mouseY - ringY) * LERP;

      /* Both use identical coordinate — CSS translate(-50%,-50%) centers them */
      dot.style.left  = mouseX + 'px';
      dot.style.top   = mouseY + 'px';
      ring.style.left = ringX + 'px';
      ring.style.top  = ringY + 'px';

      requestAnimationFrame(cursorTick);
    }

    document.addEventListener('mousemove', e => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (dot.style.opacity !== '1') {
        dot.style.opacity  = '1';
        ring.style.opacity = '0.75';
      }
    }, { passive: true });

    window.addEventListener('mouseleave', () => {
      dot.style.opacity  = '0';
      ring.style.opacity = '0';
    }, { passive: true });
    window.addEventListener('mouseenter', () => {
      dot.style.opacity  = '1';
      ring.style.opacity = '0.75';
    }, { passive: true });

    dot.style.opacity  = '0';
    ring.style.opacity = '0';
    requestAnimationFrame(cursorTick);
  })();


  /* ════════════════════════════════════════════════════════════════
     6. WILL-CHANGE CLEANUP after reveals settle
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    const cleanupObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.addEventListener('transitionend', () => { el.style.willChange = 'auto'; }, { once: true });
        cleanupObserver.unobserve(el);
      });
    }, { threshold: 0.1 });
    els.forEach(el => cleanupObserver.observe(el));
  })();


  /* ════════════════════════════════════════════════════════════════
     7. TYPING CURSOR COLOR SYNC
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const tcur = document.querySelector('.tcur');
    if (!tcur) return;
    function syncCursorColor() {
      const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim();
      if (acc) tcur.style.background = acc;
    }
    syncCursorColor();
    const obs = new MutationObserver(syncCursorColor);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  })();


  console.log('%c✦ Final Polish v2.0 — Minimal Premium', 'color:#22d3ee;font-family:monospace;font-weight:bold');

})();
