/* ═══════════════════════════════════════════════════════════════════
   TIMELINE.JS — Cinematic Scroll-Based Journey  v1.0
   ─────────────────────────────────────────────────────────────────
   ARCHITECTURE:
   • IntersectionObserver  → card reveal (opacity + translateY + scale)
   • Single scroll listener via rAF  → scaleY progress line
   • Active-node highlight via scroll midpoint detection
   • All animations: transform + opacity only. Zero layout shifts.
   ═══════════════════════════════════════════════════════════════════ */

function initTimeline() {
  'use strict';

  /* ── Guard: skip if section missing or reduced motion ── */
  const section = document.getElementById('journey');
  if (!section) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    /* Show everything immediately */
    section.querySelectorAll('.vtl-item').forEach(el => {
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    return;
  }

  /* ── DOM refs ────────────────────────────────────────────────── */
  const vtl      = section.querySelector('.vtl');
  if (!vtl) return;

  const items    = [...vtl.querySelectorAll('.vtl-item')];
  if (!items.length) return;

  /* ─────────────────────────────────────────────────────────────
     1. BUILD DOM — inject track, upgrade line, add connectors
  ───────────────────────────────────────────────────────────── */
  function buildDOM() {
    /* Ghost track behind the filled line */
    if (!vtl.querySelector('.vtl-track')) {
      const track = document.createElement('div');
      track.className = 'vtl-track';
      vtl.insertBefore(track, vtl.firstChild);
    }

    /* Grab / create the filled line */
    let line = vtl.querySelector('.vtl-line');
    if (!line) {
      line = document.createElement('div');
      line.className = 'vtl-line';
      vtl.insertBefore(line, vtl.firstChild);
    }
    /* Reset to CSS-controlled initial state */
    line.style.cssText = '';

    /* Travelling glow dot */
    let dotEl = vtl.querySelector('.vtl-line-dot');
    if (!dotEl) {
      dotEl = document.createElement('div');
      dotEl.className = 'vtl-line-dot';
      vtl.appendChild(dotEl);
    }

    /* Inject connector line into each item (only if not already there) */
    items.forEach(item => {
      if (!item.querySelector('.vtl-connector')) {
        const conn = document.createElement('div');
        conn.className = 'vtl-connector';
        item.insertBefore(conn, item.firstChild);
      }
    });

    return { line, dotEl };
  }

  const { line, dotEl } = buildDOM();

  /* ─────────────────────────────────────────────────────────────
     2. CARD REVEAL — IntersectionObserver
        Each item gets a staggered transition-delay based on its
        position in the sequence, but only items that scroll INTO
        view are delayed relative to EACH OTHER, not relative to
        page load.
  ───────────────────────────────────────────────────────────── */
  let revealBatch    = 0;   /* counts items revealed so far */
  let batchTimer     = null;

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el    = entry.target;
        const delay = (revealBatch % 3) * 0.08; /* max 0.16s stagger within a cluster */
        revealBatch++;

        /* Apply stagger via inline transition-delay */
        el.style.transitionDelay = `${delay}s`;

        /* Force a frame so the browser registers the initial state
           before adding the revealed class */
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.classList.add('tl-revealed');
            /* Clear delay after transition completes so hover isn't delayed */
            setTimeout(() => { el.style.transitionDelay = ''; }, 800);
          });
        });

        revealObserver.unobserve(el);

        /* Reset batch counter after a gap (new scroll cluster) */
        clearTimeout(batchTimer);
        batchTimer = setTimeout(() => { revealBatch = 0; }, 500);
      });
    },
    {
      root:       null,
      rootMargin: '0px 0px -80px 0px',  /* trigger 80px before bottom of viewport */
      threshold:  0.12,
    }
  );

  items.forEach(el => revealObserver.observe(el));

  /* ─────────────────────────────────────────────────────────────
     3. PROGRESS LINE — scaleY driven by scroll position
        Uses rAF loop for smooth 60fps, single shared handler.
        transform: scaleY(progress) — NOT height animation.
  ───────────────────────────────────────────────────────────── */
  let rafId        = null;
  let lastProgress = -1;   /* track previous value to skip identical frames */

  function getLineProgress() {
    const vtlRect     = vtl.getBoundingClientRect();
    const vH          = window.innerHeight;

    /* How far through the vtl section has the user scrolled?
       Start: when top of vtl reaches bottom of viewport (0%)
       End:   when bottom of vtl reaches center of viewport (100%) */
    const totalTravel = vtlRect.height + vH * 0.5;
    const scrolled    = vH - vtlRect.top;
    const progress    = Math.max(0, Math.min(1, scrolled / totalTravel));

    return progress;
  }

  function applyLineProgress(p) {
    /* scaleY: 0 → 1, origin is top */
    line.style.transform    = `translateX(-50%) scaleY(${p.toFixed(4)})`;

    /* Travelling dot follows the tip */
    const vtlH = vtl.getBoundingClientRect().height;
    const dotY = p * vtlH;
    dotEl.style.transform   = `translateX(-50%) translateY(${dotY.toFixed(1)}px)`;
    dotEl.style.opacity     = p > 0.01 ? '1' : '0';
  }

  function tickLine() {
    const p = getLineProgress();
    if (Math.abs(p - lastProgress) > 0.0005) { /* skip if no meaningful change */
      lastProgress = p;
      applyLineProgress(p);
      updateActiveNode(p);
    }
    rafId = requestAnimationFrame(tickLine);
  }

  /* Start the rAF loop */
  rafId = requestAnimationFrame(tickLine);

  /* ─────────────────────────────────────────────────────────────
     4. ACTIVE NODE HIGHLIGHT
        Finds the item whose dot is closest to the center of the
        viewport and marks it with .tl-active.
  ───────────────────────────────────────────────────────────── */
  let _lastActiveIdx = -1;

  function updateActiveNode() {
    const midY      = window.innerHeight * 0.5;
    let closestIdx  = -1;
    let closestDist = Infinity;

    items.forEach((item, i) => {
      const rect = item.getBoundingClientRect();
      /* Only consider visible items */
      if (rect.top > window.innerHeight || rect.bottom < 0) return;
      const itemMid = rect.top + rect.height * 0.4;
      const dist    = Math.abs(itemMid - midY);
      if (dist < closestDist) { closestDist = dist; closestIdx = i; }
    });

    if (closestIdx === _lastActiveIdx) return; /* no change */
    _lastActiveIdx = closestIdx;

    items.forEach((item, i) => {
      item.classList.toggle('tl-active', i === closestIdx);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     5. CLEANUP on page navigation / section hidden
  ───────────────────────────────────────────────────────────── */
  /* Pause rAF when section is off screen for perf */
  const sectionObserver = new IntersectionObserver(entries => {
    const visible = entries[0].isIntersecting;
    if (visible && !rafId) {
      rafId = requestAnimationFrame(tickLine);
    } else if (!visible && rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }, { rootMargin: '200px 0px' });

  sectionObserver.observe(section);

  /* ─────────────────────────────────────────────────────────────
     6. RE-INIT on admin data change (journey items updated)
  ───────────────────────────────────────────────────────────── */
  window.addEventListener('introcomplete', () => {
    /* Re-observe items in case admin injected new ones */
    vtl.querySelectorAll('.vtl-item:not(.tl-revealed)').forEach(el => {
      revealObserver.observe(el);
    });
  });

  console.log('%c⏱ Timeline v1.0 initialized', 'color:#4f6ef5;font-family:monospace');
}


/* ── BOOT ──────────────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTimeline);
} else {
  initTimeline();
}

/* Re-init after intro completes so scroll offsets are fresh */
window.addEventListener('introcomplete', initTimeline);
