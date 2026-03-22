/* ═══════════════════════════════════════════════════════════════════
   PREMIUM UPGRADES — premium-upgrades.js  v7.0  (Minimal Edition)
   REMOVED: CinematicLoader, AutoTheme, SkillTree, RadarEnhance
   KEPT:    GlowSystem (reduced), Timeline, DragInertia, Terminal,
            SkillBars, CMSSync, AdminAccess
   ═══════════════════════════════════════════════════════════════════ */

(function PremiumUpgrades() {
  'use strict';

  /* ── Single-init guard ── */
  if (window.__premiumUpgradesLoaded) return;
  window.__premiumUpgradesLoaded = true;

  const NO_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_TOUCH  = 'ontouchstart' in window;

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  window.getAcc = function () {
    return getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#4f6ef5';
  };


  /* ════════════════════════════════════════════════════════════════
     1. GLOW SYSTEM — Step 5: reduced intensity, subtle
        idle:1px hover:4px active:6px via CSS classes
        Step 8: removed continuous animation loops from glow-idle
  ════════════════════════════════════════════════════════════════ */
  const GlowSystem = (() => {
    const TARGETS = [
      '.sk-card', '.pj', '.ach-card', '.about-card',
      '.vtl-card', '.cg-card', '.cert-ring-btn',
      '.btn-p', '.btn-o', '.nav-cta',
      '.soc',
      '.nav-links a',
    ];

    function bind(el) {
      if (el.__glowBound) return;
      el.__glowBound = true;
      el.classList.add('glow-idle');
      el.addEventListener('mouseenter', () => {
        el.classList.remove('glow-active', 'glow-idle');
        el.classList.add('glow-hover');
      }, { passive: true });
      el.addEventListener('mouseleave', () => {
        el.classList.remove('glow-hover', 'glow-active');
        el.classList.add('glow-idle');
      }, { passive: true });
      el.addEventListener('mousedown', () => {
        el.classList.remove('glow-hover', 'glow-idle');
        el.classList.add('glow-active');
      }, { passive: true });
      el.addEventListener('mouseup', () => {
        el.classList.remove('glow-active');
        el.classList.add('glow-hover');
      }, { passive: true });
    }

    function init() {
      if (NO_MOTION) return;
      TARGETS.forEach(sel => document.querySelectorAll(sel).forEach(bind));
    }
    return { init, bind };
  })();


  /* ════════════════════════════════════════════════════════════════
     2. TIMELINE — superseded by timeline.js (v1.0)
        This block is kept as a no-op stub to avoid breaking other
        code that calls Timeline.init(). All timeline animation is
        now owned exclusively by timeline.js.
  ════════════════════════════════════════════════════════════════ */
  const Timeline = (() => {
    let lineFilled, lineGhost, dot, section, vtlEl, items;
    let currentProg = 0;
    let vtlHeight = 0;

    function getProgress() {
      if (!section) return 0;
      const r = section.getBoundingClientRect();
      return Math.max(0, Math.min(1,
        (window.innerHeight - r.top) / (r.height + window.innerHeight)
      ));
    }

    function updateNodeStates(p) {
      if (!items || !items.length) return;
      const n = items.length;
      items.forEach((item, i) => {
        const dotEl = item.querySelector('.vtl-dot');
        if (!dotEl) return;
        const nodeP = i / (n - 1 || 1);
        dotEl.classList.remove('glow-idle', 'glow-hover', 'glow-active');
        if      (p >= nodeP + 0.05)          dotEl.classList.add('glow-hover');
        else if (Math.abs(p - nodeP) < 0.09) dotEl.classList.add('glow-active');
        else                                  dotEl.classList.add('glow-idle');
      });
    }

    function refreshHeight() {
      if (vtlEl) vtlHeight = vtlEl.offsetHeight;
    }

    function tick() {
      requestAnimationFrame(tick);
      const target = getProgress();
      /* Smooth lerp — no jump */
      currentProg = lerp(currentProg, target, 0.06);
      const p = currentProg;

      lineFilled.style.height = (p * 100).toFixed(2) + '%';

      if (dot && vtlHeight) {
        dot.style.transform = `translateX(-50%) translateY(${(p * vtlHeight).toFixed(1)}px)`;
        dot.style.opacity   = p > 0.005 ? '1' : '0';
      }

      lineGhost.style.opacity = '0.06';
      updateNodeStates(p);
    }

    function init() {
      /* ── DISABLED: timeline.js owns all timeline animation ──
         Calling initTimeline() here would double-init. timeline.js
         boots itself on DOMContentLoaded and introcomplete.
         This stub exists so existing call sites don't throw. */
      return;
    }

    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     3. DRAG INERTIA — CG horizontal scroll
     Uses native scrollLeft so trackpad works out of the box.
     Mouse drag + touch + keyboard + shift-scroll layered on top.
  ════════════════════════════════════════════════════════════════ */
  const DragInertia = (() => {
    const FRICTION = 0.88;
    const MIN_VEL  = 0.5;

    let wrap = null, rail = null, trackFill = null;
    let velX = 0, rafId = null;
    let isDragging = false;
    let dragStartX = 0, dragStartScroll = 0, lastX = 0, lastT = 0;

    // ── helpers ────────────────────────────────────────────────────
    function maxScroll() { return Math.max(0, wrap.scrollWidth - wrap.clientWidth); }

    function setScroll(x) {
      wrap.scrollLeft = Math.max(0, Math.min(x, maxScroll()));
      syncUI();
    }

    function syncUI() {
      const sl = wrap.scrollLeft;
      const md = maxScroll();
      // track fill
      if (trackFill) {
        trackFill.style.width = md > 0 ? (sl / md * 100).toFixed(2) + '%' : '0%';
      }
      // edge fades
      const fadeL = document.getElementById('cg-fade-left');
      const fadeR = document.getElementById('cg-fade-right');
      if (fadeL) fadeL.classList.toggle('hidden', sl <= 2);
      if (fadeR) fadeR.classList.toggle('hidden', sl >= md - 2);
      // dots
      updateDotsByScroll(sl);
    }

    // ── inertia loop (mouse drag only) ─────────────────────────────
    function coastLoop() {
      velX *= FRICTION;
      if (Math.abs(velX) < MIN_VEL) { velX = 0; rafId = null; return; }
      setScroll(wrap.scrollLeft + velX);
      rafId = requestAnimationFrame(coastLoop);
    }

    // ── mouse drag ─────────────────────────────────────────────────
    function onDown(clientX) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      isDragging = true; velX = 0;
      dragStartX = clientX;
      dragStartScroll = wrap.scrollLeft;
      lastX = clientX; lastT = Date.now();
      wrap.classList.add('dragging'); wrap.style.cursor = 'grabbing';
    }
    function onMove(clientX) {
      if (!isDragging) return;
      const now = Date.now();
      const dt = Math.max(1, now - lastT);
      velX = (lastX - clientX) / dt * 16;
      lastX = clientX; lastT = now;
      setScroll(dragStartScroll + (dragStartX - clientX));
    }
    function onUp() {
      if (!isDragging) return;
      isDragging = false;
      wrap.classList.remove('dragging'); wrap.style.cursor = 'grab';
      if (Math.abs(velX) > MIN_VEL) rafId = requestAnimationFrame(coastLoop);
    }

    // ── dots ───────────────────────────────────────────────────────
    let dotsEl = null, items = [], activeIdx = -1;

    function buildDots() {
      dotsEl = document.getElementById('cg-progress');
      items = Array.from(rail.querySelectorAll('.cg-item'));
      if (!dotsEl || !items.length) return;
      dotsEl.innerHTML = '';
      items.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.className = 'cg-prog-dot' + (i === 0 ? ' active' : '');
        dot.setAttribute('aria-label', 'Go to item ' + (i + 1));
        dot.addEventListener('click', () => snapToIdx(i));
        dotsEl.appendChild(dot);
      });
    }

    function updateDotsByScroll(sl) {
      if (!items.length) return;
      const md = maxScroll();
      // find which item is most centred in the viewport
      const wrapCenter = wrap.getBoundingClientRect().left + wrap.clientWidth / 2;
      let best = 0, bestDist = Infinity;
      items.forEach((item, i) => {
        const r = item.getBoundingClientRect();
        const dist = Math.abs(r.left + r.width / 2 - wrapCenter);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      if (best !== activeIdx) {
        activeIdx = best;
        if (dotsEl) dotsEl.querySelectorAll('.cg-prog-dot').forEach((d, i) =>
          d.classList.toggle('active', i === activeIdx)
        );
      }
    }

    function snapToIdx(idx) {
      if (!items.length) return;
      const item = items[Math.max(0, Math.min(idx, items.length - 1))];
      const itemCenter = item.offsetLeft + item.offsetWidth / 2;
      const target = itemCenter - wrap.clientWidth / 2;
      wrap.scrollTo({ left: target, behavior: 'smooth' });
    }

    // ── keyboard ───────────────────────────────────────────────────
    function flashPill(label) {
      document.querySelectorAll('.cg-ctrl-pill').forEach(p => {
        if (p.textContent.toLowerCase().includes(label.toLowerCase())) {
          p.classList.add('active-key');
          setTimeout(() => p.classList.remove('active-key'), 400);
        }
      });
    }

    function onKeydown(e) {
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      if (r.top > window.innerHeight || r.bottom < 0) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); flashPill('keys'); snapToIdx(activeIdx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); flashPill('keys'); snapToIdx(activeIdx - 1); }
    }

    // ── init ───────────────────────────────────────────────────────
    function init() {
      wrap = document.getElementById('cg-rail-wrap');
      rail = document.getElementById('cg-rail');
      if (!wrap || !rail || wrap.__dragOwned) return;
      wrap.__dragOwned = true;
      trackFill = document.getElementById('cg-track-fill');

      // Native overflow scroll — trackpad works automatically
      wrap.style.overflowX   = 'auto';
      wrap.style.overflowY   = 'hidden';
      wrap.style.cursor      = 'grab';
      wrap.style.userSelect  = 'none';
      wrap.style.scrollbarWidth = 'none'; // Firefox
      wrap.style.webkitOverflowScrolling = 'touch';
      // Hide webkit scrollbar via style tag
      if (!document.getElementById('cg-sb-hide')) {
        const s = document.createElement('style');
        s.id = 'cg-sb-hide';
        s.textContent = '#cg-rail-wrap::-webkit-scrollbar{display:none}';
        document.head.appendChild(s);
      }

      // rail must NOT have transform — native scroll handles position
      rail.style.transform = '';
      rail.style.transition = '';
      rail.style.width = 'max-content';
      rail.style.position = 'relative';

      if (trackFill) {
        trackFill.classList.remove('w-60');
        trackFill.style.width = '0%';
        trackFill.style.transition = 'none';
      }

      requestAnimationFrame(() => { buildDots(); syncUI(); });

      // Mouse drag
      wrap.addEventListener('mousedown', e => { if (e.button === 0) onDown(e.clientX); }, { passive: true });
      window.addEventListener('mousemove', e => onMove(e.clientX), { passive: true });
      window.addEventListener('mouseup', () => onUp(), { passive: true });
      wrap.addEventListener('click', e => { if (isDragging) e.stopPropagation(); });

      // Touch — native handles it, but track for dots sync
      wrap.addEventListener('touchend', () => setTimeout(syncUI, 50), { passive: true });
      wrap.addEventListener('scroll', syncUI, { passive: true });

      // Shift+scroll → horizontal (mouse users without trackpad)
      wrap.addEventListener('wheel', e => {
        if (e.shiftKey) {
          e.preventDefault();
          flashPill('shift');
          setScroll(wrap.scrollLeft + e.deltaY);
        }
        // All other wheel events: browser handles natively (trackpad deltaX)
      }, { passive: false });

      // Keyboard
      document.addEventListener('keydown', onKeydown);
    }

    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     4. TERMINAL — natural typing feel
  ════════════════════════════════════════════════════════════════ */
  const Terminal = (() => {
    function jitter(base, spread) {
      const r = (Math.random() + Math.random() + Math.random()) / 3;
      return Math.max(8, base + (r - 0.5) * spread * 2);
    }
    function charDelay(ch, idx, len) {
      let ms = jitter(22, 8);
      if ('. ! ?'.includes(ch)) ms += 90;
      else if (', ; :'.includes(ch)) ms += 45;
      else if (ch === ' ') ms += 12;
      if (len > 20 && idx > len / 2) ms = ms * 0.88;
      return ms;
    }
    function typeSpan(span, text) {
      return new Promise(res => {
        span.textContent = '';
        span.classList.add('typing');
        let i = 0;
        function next() {
          if (i >= text.length) {
            setTimeout(() => { span.classList.remove('typing'); res(); }, 120);
            return;
          }
          span.textContent += text[i];
          i++;
          setTimeout(next, charDelay(text[i-1], i, text.length));
        }
        next();
      });
    }
    async function animate(rows) {
      for (const row of rows) {
        const cmd = row.querySelector('.tc');
        if (cmd) {
          const txt = (cmd.dataset.orig = cmd.dataset.orig || cmd.textContent.trim());
          row.style.cssText += ';transition:opacity 0.25s ease,transform 0.25s ease;transform:translateY(5px);opacity:0';
          await new Promise(r => setTimeout(r, 30));
          row.style.opacity = '1'; row.style.transform = 'none';
          await new Promise(r => setTimeout(r, 80));
          await typeSpan(cmd, txt);
          await new Promise(r => setTimeout(r, 60));
        } else {
          row.style.cssText += ';transition:opacity 0.30s ease,transform 0.30s ease;transform:translateY(4px);opacity:0';
          await new Promise(r => setTimeout(r, 20));
          row.style.opacity = '1'; row.style.transform = 'none';
          await new Promise(r => setTimeout(r, 300));
        }
      }
    }
    function init() {
      const body = document.querySelector('.term-body');
      if (!body) return;
      const rows = [...body.children];
      if (!rows.length) return;
      rows.forEach(r => { r.style.opacity = '0'; r.style.transform = 'translateY(5px)'; });
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          io.unobserve(body);
          setTimeout(() => animate(rows), 300);
        });
      }, { threshold: 0.25, rootMargin: '0px 0px -40px 0px' });
      io.observe(body);
    }
    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     5. SKILL BARS
  ════════════════════════════════════════════════════════════════ */
  const SkillBars = (() => {
    function init() {
      const sec = document.getElementById('skills'); if (!sec) return;
      let fired = false;
      const io = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (!e.isIntersecting || fired) return;
          fired = true;
          document.querySelectorAll('.bar-fill').forEach(b => {
            setTimeout(() => { b.style.width = (b.dataset.p || 0) + '%'; }, 250);
          });
          io.unobserve(sec);
        });
      }, { threshold: 0.1 });
      io.observe(sec);
    }
    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     6. CMS SYNC
  ════════════════════════════════════════════════════════════════ */
  const CMSSync = (() => {
    function applyAll(d) {
      if (!d) return;
      if (d.name) {
        const parts = d.name.trim().split(' ');
        const n1 = document.querySelector('.h-name .acc');
        if (n1 && parts[0]) n1.textContent = parts[0];
      }
      if (d.bio) {
        const el = document.querySelector('.h-desc');
        if (el) el.textContent = d.bio;
      }
      if (d.email) {
        document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
          a.href = 'mailto:' + d.email;
          if (a.textContent.includes('@')) a.textContent = d.email;
        });
      }
      if (d.profileImage) {
        const img = document.getElementById('himg');
        if (img) img.src = d.profileImage;
      }
    }
    function sync() {
      let raw = null;
      try { raw = localStorage.getItem('permanentData'); } catch(e) {}
      if (!raw) return;
      try { applyAll(JSON.parse(raw)); } catch (e) {}
    }
    function init() {
      sync();
      window.addEventListener('storage', e => { if (e.key === 'permanentData') sync(); });
      try {
        const bc = new BroadcastChannel('portfolio-cms');
        bc.addEventListener('message', e => { if (e.data?.type === 'cms-save') applyAll(e.data.data); });
      } catch (e) {}
    }
    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     7. ADMIN ACCESS
  ════════════════════════════════════════════════════════════════ */
  const AdminAccess = (() => {
    function init() {
      ['loginPage', 'adminPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.cssText = 'display:none!important;visibility:hidden!important;';
      });
      const fc = document.querySelector('.fc'); if (!fc) return;
      let n = 0, t = null;
      fc.addEventListener('click', () => {
        n++; if (t) clearTimeout(t);
        if (n >= 3) { n = 0; fc.style.color = 'var(--acc)'; setTimeout(() => window.location.href = 'admin.html', 200); }
        else t = setTimeout(() => { n = 0; }, 600);
      });
    }
    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     BOOT — no cinematic loader, no auto-theme loop
  ════════════════════════════════════════════════════════════════ */
  AdminAccess.init();
  CMSSync.init();

  function boot() {
    GlowSystem.init();
    Timeline.init();
    DragInertia.init();
    Terminal.init();
    SkillBars.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('%c✦ Premium Upgrades v7.0 — Minimal Edition', 'color:#a855f7;font-family:monospace;font-weight:bold');

})();
