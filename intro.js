/* ═══════════════════════════════════════════════════════════════════
   INTRO.JS — Cinematic Entry System  v2.0

   ARCHITECTURE
   ────────────
   • html.intro-active is added INLINE in index.html (before any JS)
     so CSS display:none on #main-site fires before first paint.
   • All site content lives inside #main-site — never visible until
     intro completes (not just opacity, actual display:none).
   • Cursor elements (#cur-dot, #cur-ring) and #intro-overlay stay
     as direct <body> children — they must not be inside #main-site.

   TIMELINE (total ~3.0s)
   ────────
   0ms      → overlay visible, #main-site display:none
   150ms    → glow ambience fades in
   280ms    → greeting line slides up
   480ms    → name fades in + typewriter starts
   ~1700ms  → typing done → divider + tagline reveal
   2000ms   → skip button appears
   2500ms   → skip fades
   2600ms   → EXIT: overlay fades + scales down (0.85s)
   2600ms   → #main-site display:block + site-enter class (0.7s reveal)
   3600ms   → cleanup, all classes removed, settle
   ═══════════════════════════════════════════════════════════════════ */

(function CinematicIntro() {
  'use strict';

  const SKIP_KEY = 'intro_seen_v2';

  /* ── Short-circuit: returning visitor ── */
  if (sessionStorage.getItem(SKIP_KEY)) {
    skipInstant();
    return;
  }

  /* ── Short-circuit: reduced motion ── */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    skipInstant();
    return;
  }

  /* ─────────────────────────────────────────────────────────────
     HELPERS
  ───────────────────────────────────────────────────────────── */
  function getAcc() {
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--acc').trim() || '#4f6ef5';
  }

  function getFullName() {
    try {
      const d = JSON.parse(localStorage.getItem('adm-portfolio-data') || '{}');
      return {
        first: d.firstName || 'Arrabola',
        last:  d.lastName  || 'Srishanth',
      };
    } catch (e) {
      return { first: 'Arrabola', last: 'Srishanth' };
    }
  }

  function getTagline() {
    try {
      const d = JSON.parse(localStorage.getItem('adm-portfolio-data') || '{}');
      return d.tagline || 'Building digital experiences that feel alive.';
    } catch (e) {
      return 'Building digital experiences that feel alive.';
    }
  }

  /* ─────────────────────────────────────────────────────────────
     1. BUILD OVERLAY
     Inserted as FIRST child of <body> — before #main-site.
  ───────────────────────────────────────────────────────────── */
  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'intro-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="intro-glow-outer"></div>' +
      '<div class="intro-glow"></div>' +
      '<div class="intro-content">' +
        '<div id="intro-greet">&lt; welcome /&gt;</div>' +
        '<div id="intro-name">' +
          '<span id="intro-name-text"></span>' +
          '<span id="intro-cursor"></span>' +
        '</div>' +
        '<div class="intro-divider"></div>' +
        '<div id="intro-tagline"></div>' +
      '</div>' +
      '<div id="intro-progress"></div>' +
      '<button id="intro-skip" aria-label="Skip intro">skip ↗</button>';

    /* Insert before everything — overlay must be before #main-site */
    document.body.insertBefore(overlay, document.body.firstChild);
    return overlay;
  }

  /* ─────────────────────────────────────────────────────────────
     2. WRAP SITE IN #main-site
     Moves all body children (except overlay + cursor) into a
     single #main-site div. CSS blocks it with display:none via
     html.intro-active #main-site rule.
  ───────────────────────────────────────────────────────────── */
  function wrapSiteContent(overlay) {
    /* Already wrapped? */
    if (document.getElementById('main-site')) return;

    const mainSite = document.createElement('div');
    mainSite.id = 'main-site';

    /* Elements that must remain direct body children */
    const KEEP_IN_BODY = new Set([
      'intro-overlay',
      'cur-dot',
      'cur-ring',
    ]);

    /* Snapshot current children (live NodeList mutates during move) */
    const children = Array.from(document.body.childNodes);
    children.forEach(node => {
      if (!KEEP_IN_BODY.has(node.id)) {
        mainSite.appendChild(node);
      }
    });

    document.body.appendChild(mainSite);
  }

  /* ─────────────────────────────────────────────────────────────
     3. TYPEWRITER
  ───────────────────────────────────────────────────────────── */
  function typeWriter(targetEl, name, onDone) {
    const full  = name.first + ' ' + name.last;
    const first = name.first;
    let i = 0;

    function jitter(base) {
      return base + (Math.random() - 0.5) * base * 0.55;
    }

    function tick() {
      if (i >= full.length) {
        setTimeout(() => {
          const cursor = document.getElementById('intro-cursor');
          if (cursor) cursor.classList.add('done');
          if (onDone) onDone();
        }, 200);
        return;
      }

      const ch = full[i];
      const typedFirst = full.slice(0, Math.min(i + 1, first.length));
      const typedLast  = i >= first.length ? full.slice(first.length, i + 1) : '';

      targetEl.innerHTML =
        typedFirst +
        (typedLast
          ? '<span class="intro-acc">' + typedLast + '</span>'
          : '');

      i++;
      setTimeout(tick, ch === ' ' ? jitter(100) : jitter(58));
    }

    tick();
  }

  /* ─────────────────────────────────────────────────────────────
     4. SMOOTH PROGRESS BAR (rAF-driven, eased)
  ───────────────────────────────────────────────────────────── */
  function animateProgress(el, totalMs) {
    const start = performance.now();
    function frame(now) {
      const elapsed = now - start;
      const raw     = Math.min(elapsed / totalMs, 1);
      /* ease-out cubic: decelerates toward end */
      const eased   = 1 - Math.pow(1 - raw, 2.5);
      el.style.width = (eased * 100) + '%';
      if (raw < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ─────────────────────────────────────────────────────────────
     5. EXIT SEQUENCE — the most important part
     Step A: overlay gets intro-exit class (fades + scales down)
     Step B: simultaneously, #main-site goes display:block + site-enter
     Step C: remove intro-active from <html> (unlocks scroll)
     Step D: after transition, full cleanup
  ───────────────────────────────────────────────────────────── */
  function exitIntro(overlay, instant) {
    const mainSite = document.getElementById('main-site');

    if (instant) {
      /* Instant skip — no animation */
      document.documentElement.classList.remove('intro-active');
      if (mainSite) {
        mainSite.style.transition = 'none';
        mainSite.style.opacity    = '1';
        mainSite.style.transform  = 'none';
        mainSite.classList.add('site-enter', 'site-settled');
      }
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      finalCleanup();
      return;
    }

    /* ── Step A: start overlay fade-out ── */
    overlay.classList.add('intro-exit');

    /* ── Step B: unlock scroll + reveal main site IN SYNC ──
       display:none → display:block happens here.
       We must remove intro-active FIRST so the CSS rule
       "html.intro-active #main-site { display:none }" no longer fires. */
    document.documentElement.classList.remove('intro-active');

    /* Force a reflow so the browser acknowledges display:block
       before we add the animation class */
    if (mainSite) {
      mainSite.style.display = 'block'; /* belt-and-suspenders */
      void mainSite.offsetHeight;       /* trigger reflow */
      mainSite.classList.add('site-enter');
    }

    /* ── Step C: remove overlay from DOM after it's faded ── */
    setTimeout(() => {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      finalCleanup();
    }, 950); /* matches overlay transition: 0.85s + a tiny buffer */
  }

  function finalCleanup() {
    /* Remove any lingering inline styles on #main-site */
    const mainSite = document.getElementById('main-site');
    if (mainSite) {
      setTimeout(() => {
        mainSite.classList.add('site-settled');
      }, 800); /* after site-enter transition completes */
    }

    /* Restore scroll */
    document.documentElement.classList.remove('intro-active');
    document.body.style.overflow = '';

    /* Mark session */
    try { sessionStorage.setItem(SKIP_KEY, '1'); } catch (e) {}

    /* Notify other modules (enhancements.js re-caches section offsets) */
    window.dispatchEvent(new CustomEvent('introcomplete'));
  }

  /* ─────────────────────────────────────────────────────────────
     6. SKIP HANDLER
  ───────────────────────────────────────────────────────────── */
  function setupSkip(overlay, triggerExit) {
    const btn = document.getElementById('intro-skip');
    if (!btn) return;

    btn.addEventListener('click', () => triggerExit(true));

    const onKey = (e) => {
      if (['Escape', ' ', 'Enter'].includes(e.key)) {
        if (e.key === ' ') e.preventDefault();
        triggerExit(true);
        document.removeEventListener('keydown', onKey);
      }
    };
    document.addEventListener('keydown', onKey);
  }

  /* ─────────────────────────────────────────────────────────────
     MAIN SEQUENCE
  ───────────────────────────────────────────────────────────── */
  function run() {
    /* Ensure html.intro-active is set (should already be inline) */
    document.documentElement.classList.add('intro-active');

    const overlay = buildOverlay();
    wrapSiteContent(overlay);

    const nameData  = getFullName();
    const nameEl    = document.getElementById('intro-name');
    const nameText  = document.getElementById('intro-name-text');
    const greetEl   = document.getElementById('intro-greet');
    const taglineEl = document.getElementById('intro-tagline');
    const divider   = overlay.querySelector('.intro-divider');
    const glow      = overlay.querySelector('.intro-glow');
    const glowOuter = overlay.querySelector('.intro-glow-outer');
    const progress  = document.getElementById('intro-progress');
    const skipBtn   = document.getElementById('intro-skip');

    let exited = false;

    function triggerExit(instant) {
      if (exited) return;
      exited = true;
      exitIntro(overlay, instant);
    }

    setupSkip(overlay, triggerExit);

    /* ── Progress bar over 2.4s (covers typing + reveal phases) ── */
    if (progress) animateProgress(progress, 2400);

    /* T+150ms — ambient glow */
    setTimeout(() => {
      glow      && glow.classList.add('visible');
      glowOuter && glowOuter.classList.add('visible');
    }, 150);

    /* T+280ms — greeting */
    setTimeout(() => {
      greetEl && greetEl.classList.add('visible');
    }, 280);

    /* T+480ms — name fades in, typewriter begins */
    setTimeout(() => {
      nameEl && nameEl.classList.add('visible');
      if (nameText) {
        typeWriter(nameText, nameData, () => {
          /* After typing: divider */
          setTimeout(() => {
            divider && divider.classList.add('visible');
          }, 100);
          /* Then tagline */
          setTimeout(() => {
            if (taglineEl) {
              taglineEl.textContent = getTagline();
              taglineEl.classList.add('visible');
            }
          }, 280);
        });
      }
    }, 480);

    /* T+2000ms — skip button appears */
    setTimeout(() => {
      if (skipBtn && !exited) skipBtn.classList.add('visible');
    }, 2000);

    /* T+2500ms — skip fades */
    setTimeout(() => {
      skipBtn && skipBtn.classList.remove('visible');
    }, 2500);

    /* T+2600ms — EXIT */
    setTimeout(() => {
      triggerExit(false);
    }, 2600);
  }

  /* ── Boot ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  console.log('%c✦ Cinematic Intro v2.0 — display:none architecture', 'color:#4f6ef5;font-family:monospace;font-weight:bold');

})();


/* ── Called when intro is entirely skipped (returning visitor / reduced-motion) ── */
function skipInstant() {
  function applySkip() {
    document.documentElement.classList.remove('intro-active');

    /* If #main-site exists, ensure it's fully visible */
    const ms = document.getElementById('main-site');
    if (ms) {
      ms.style.cssText = 'opacity:1;transform:none;transition:none;display:block';
      setTimeout(() => { ms.style.cssText = ''; }, 100);
    }

    /* Remove overlay if somehow present */
    const ov = document.getElementById('intro-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);

    document.body.style.overflow = '';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySkip);
  } else {
    applySkip();
  }
}
