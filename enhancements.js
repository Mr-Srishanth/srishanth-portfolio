/* ═══════════════════════════════════════════════════════════════════
   PORTFOLIO ENHANCEMENTS — enhancements.js  v4.0  (Minimal Premium)
   OWNS: theme, cursor, observers, navbar, form
   REMOVED: NavMagnetic links (heavy hover system — Step 8)
   STEP 6: Navbar uses backdrop-filter + rgba, managed via CSS + scroll
   ═══════════════════════════════════════════════════════════════════ */

(function PortfolioEnhancements() {
  'use strict';

  /* ── Single-init guard ── */
  if (window.__enhancementsLoaded) return;
  window.__enhancementsLoaded = true;


  /* ════════════════════════════════════════════════════════════════
     1. THEME SYSTEM
     NOTE: Theme cycling is owned by visual-builder.js (ThemeCycle).
     ThemeManager here only: reads saved theme on first load,
     syncs swatch UI, and listens for cross-tab storage events.
     It does NOT bind click handlers on #thm-btn (visual-builder owns that).
  ════════════════════════════════════════════════════════════════ */
  const ThemeManager = {
    STORAGE_ADMIN: 'siteThemeConfig',
    STORAGE_USER:  'user-theme',
    VALID_THEMES:  ['blue','pink','green','yellow','purple','orange','cyan','rose','emerald','gold','sunset','ocean','rainbow'],

    init() {
      /* Apply saved theme on first load only.
         visual-builder.js ThemeCycle will own all subsequent changes. */
      let userTheme = null;
      let adminRaw  = null;
      try { userTheme = localStorage.getItem(this.STORAGE_USER); } catch(e) {}
      try { adminRaw  = localStorage.getItem(this.STORAGE_ADMIN); } catch(e) {}

      let adminTheme = null;
      try { adminTheme = adminRaw ? JSON.parse(adminRaw) : null; } catch(e) {}

      if (userTheme && this.VALID_THEMES.includes(userTheme)) {
        this._applyPreset(userTheme);
      } else if (adminTheme) {
        if (adminTheme.customAccent && /^#[0-9a-fA-F]{6}$/.test(adminTheme.customAccent)) {
          this._applyCustomHex(adminTheme.customAccent);
        } else if (adminTheme.accent && adminTheme.accent !== 'custom') {
          this._applyPreset(adminTheme.accent);
        }
      }
      this._syncSwatch();

      /* Cross-tab: sync when admin saves theme config in another tab */
      window.addEventListener('storage', (e) => {
        if (e.key !== this.STORAGE_ADMIN) return;
        try {
          const t = JSON.parse(e.newValue);
          if (!t) return;
          if (t.customAccent) this._applyCustomHex(t.customAccent);
          else if (t.accent && t.accent !== 'custom') this._applyPreset(t.accent);
          this._syncSwatch();
        } catch(err) {}
      }, { passive: true });
    },

    /* applyUserTheme removed — visual-builder.js ThemeCycle is sole owner of theme switching */

    _applyPreset(key) {
      const existing = document.getElementById('admin-theme-override');
      if (existing) existing.remove();
      document.documentElement.setAttribute('data-theme', key);
    },

    _applyCustomHex(hex) {
      let el = document.getElementById('admin-theme-override');
      if (!el) { el = document.createElement('style'); el.id = 'admin-theme-override'; document.head.appendChild(el); }
      el.textContent = `:root{--acc:${hex};--acc2:${hex}26;--glow:${hex}80;}`;
      document.documentElement.removeAttribute('data-theme');
    },

    _syncSwatch() {
      const current = document.documentElement.getAttribute('data-theme');
      document.querySelectorAll('.tsw').forEach(s => {
        s.classList.toggle('on', s.dataset.t === current);
      });
    }
  };

  /* .tsw click logic disabled — #thm-picker removed from DOM.
     visual-builder.js ThemeCycle owns #thm-btn click. */
  ThemeManager.init();


  /* ════════════════════════════════════════════════════════════════
     2. CURSOR — rAF smooth ring
  ════════════════════════════════════════════════════════════════ */
  /* ════════════════════════════════════════════════════════════════
     2. CURSOR — press · hover · ripple
        Position/movement owned exclusively by final-polish.js.
        No mousemove listener here. No rAF loop here.
  ════════════════════════════════════════════════════════════════ */
  const CursorEnhanced = (() => {
    const dot  = document.getElementById('cur-dot');
    const ring = document.getElementById('cur-ring');

    /* Track real mouse position for ripple placement */
    let _mx = 0, _my = 0;

    function init() {
      if (!dot || !ring) { document.body.style.cursor = 'default'; return; }
      if ('ontouchstart' in window) {
        dot.style.display  = 'none';
        ring.style.display = 'none';
        return;
      }

      /* Track mouse for ripple placement — passive, no conflict with final-polish.js */
      document.addEventListener('mousemove', e => { _mx = e.clientX; _my = e.clientY; }, { passive: true });

      /* ── Press: dot shrinks, ring contracts to 0.7× ── */
      document.addEventListener('mousedown', () => {
        dot.style.scale    = '0.6';
        dot.style.opacity  = '0.5';
        ring.style.scale   = '0.7';
        ring.style.opacity = '1';
        spawnSparks(_mx, _my);
      });
      document.addEventListener('mouseup', () => {
        dot.style.scale    = '1';
        dot.style.opacity  = '1';
        ring.style.scale   = '1';
        ring.style.opacity = '0.75';
      });

      /* ── Hover: use scale ONLY — never change width/height (breaks left/top centering) ── */
      const HOVER_SEL = 'a, button, .sk-card, .pj, .ach-card, .about-card, ' +
        '.cert-ring-btn, .soc, .vtl-card, .cg-card, .tsw, .nav-cta, ' +
        '.adm-cert-card, .adm-nav-item, .adm-swatch, .swatch';

      document.addEventListener('mouseover', e => {
        if (!e.target.closest(HOVER_SEL)) return;
        ring.style.scale   = '1.5';
        ring.style.opacity = '0.9';
        dot.style.scale    = '0';
      }, { passive: true });

      document.addEventListener('mouseout', e => {
        if (!e.target.closest(HOVER_SEL)) return;
        ring.style.scale   = '1';
        ring.style.opacity = '0.75';
        dot.style.scale    = '1';
      }, { passive: true });

      /* Restore on inputs */
      const INPUT_SEL = 'input, textarea, select, [contenteditable]';
      document.addEventListener('mouseover', e => {
        if (!e.target.closest(INPUT_SEL)) return;
        ring.style.scale   = '0.75';
        ring.style.opacity = '0.4';
        dot.style.scale    = '1.4';
      }, { passive: true });
      document.addEventListener('mouseout', e => {
        if (!e.target.closest(INPUT_SEL)) return;
        ring.style.scale   = '1';
        ring.style.opacity = '0.75';
        dot.style.scale    = '1';
      }, { passive: true });
    }

    /* ── Sparks burst: replaces ripple — 8 particles on mousedown ── */
    function spawnSparks(x, y) {
      const COUNT  = 8;
      const colors = ['var(--acc)', '#ffffff'];
      for (let i = 0; i < COUNT; i++) {
        const spark   = document.createElement('div');
        spark.className = 'cursor-spark';
        const angle    = (i / COUNT) * Math.PI * 2;
        const distance = 28 + Math.random() * 18;
        spark.style.left       = x + 'px';
        spark.style.top        = y + 'px';
        spark.style.setProperty('--dx', (Math.cos(angle) * distance).toFixed(1) + 'px');
        spark.style.setProperty('--dy', (Math.sin(angle) * distance).toFixed(1) + 'px');
        spark.style.background = colors[Math.floor(Math.random() * colors.length)];
        document.body.appendChild(spark);
        spark.addEventListener('animationend', () => spark.remove(), { once: true });
      }
    }

    return { init };
  })();
  CursorEnhanced.init();


  /* ════════════════════════════════════════════════════════════════
     3. CURSOR CLICK SPARKS — replaces old .cur-ripple system
        Fires on desktop only; touch devices skip via IS_TOUCH guard.
        spawnSparks is defined inside CursorEnhanced above and handles
        touch guard already. This fallback covers non-touch without
        custom cursor (e.g. when cur-dot/cur-ring are absent).
  ════════════════════════════════════════════════════════════════ */
  if (!('ontouchstart' in window)) {
    document.addEventListener('click', (e) => {
      /* Only fire if CursorEnhanced didn't already spawn sparks on mousedown.
         CursorEnhanced fires on mousedown; this click handler fires after.
         We use a flag to avoid double-sparks on the same interaction. */
      if (e._sparksHandled) return;
    });
  }


  /* ════════════════════════════════════════════════════════════════
     4. SCROLL REVEAL + STAGGER
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const revealIO = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.add('in');
        el.querySelectorAll('.bar-fill').forEach(b => {
          setTimeout(() => { b.style.width = (b.dataset.p || 0) + '%'; }, 250);
        });
        revealIO.unobserve(el);
      });
    }, { threshold: 0.10, rootMargin: '0px 0px -8% 0px' });

    document.querySelectorAll(
      '.reveal, .reveal-left, .reveal-right, .reveal-scale, ' +
      '.anim-fade-up, .anim-fade-in, .anim-scale, ' +
      '.anim-slide-left, .anim-slide-right, .vtl-item'
    ).forEach(el => revealIO.observe(el));

    const grpIO = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        [...entry.target.children].forEach((child, i) => {
          setTimeout(() => child.classList.add('in'), i * 70);
        });
        grpIO.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -5% 0px' });

    document.querySelectorAll('.reveal-group').forEach(el => grpIO.observe(el));

    document.querySelectorAll('.reveal-group').forEach(group => {
      [...group.children].forEach((child, i) => {
        if (!child.dataset.stagger) {
          child.style.transitionDelay = (i * 0.07) + 's';
        }
      });
    });
  })();


  /* ════════════════════════════════════════════════════════════════
     5. NAVBAR — compact on scroll + active section
     STEP 6: backdrop-filter from CSS, we only toggle opaque bg here
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const nav  = document.getElementById('nav');
    const pb   = document.getElementById('pbar');
    const btt  = document.getElementById('btt');
    const SEC_IDS = ['home','about','skills','projects','journey','certs','contact'];
    let ticking = false;

    if (!nav) return;

    let sectionTops = [];
    let maxScrollY  = 0;

    function cacheOffsets() {
      maxScrollY  = document.documentElement.scrollHeight - window.innerHeight;
      sectionTops = SEC_IDS.map(id => {
        const el = document.getElementById(id);
        return { id, top: el ? el.offsetTop : 0 };
      });
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer); resizeTimer = setTimeout(cacheOffsets, 200);
    }, { passive: true });

    /* Re-cache after intro overlay is removed — layout shifts when site-wrap
       transform/filter/opacity constraints are cleared (~4.2 s after page load) */
    window.addEventListener('introcomplete', () => {
      setTimeout(cacheOffsets, 50); /* brief delay lets paint settle */
    }, { once: true });

    cacheOffsets();

    function update() {
      const y = window.scrollY;

      if (pb) pb.style.width = (maxScrollY > 0 ? y / maxScrollY * 100 : 0) + '%';

      /* Step 6: navbar transitions via CSS. We just control compact height. */
      if (y > 60) {
        nav.style.height  = '54px';
        nav.classList.add('scrolled');
      } else {
        nav.style.height  = '68px';
        nav.classList.remove('scrolled');
      }

      let active = 'home';
      for (const { id, top } of sectionTops) {
        if (y >= top - 160) active = id;
      }
      document.querySelectorAll('.nav-links a').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '#' + active);
      });

      if (btt) btt.classList.toggle('on', y > 500);
      ticking = false;
    }

    window.addEventListener('scroll', () => {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  })();


  /* ════════════════════════════════════════════════════════════════
     6. HERO ENTRY — only for elements WITHOUT .hero-load
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const TARGETS = ['.h-greet','.h-name','.h-typed','.h-desc','.h-badge','.h-btns'];
    const STAGGER = 160;
    const BASE    = 100;

    function runFallbackEntry() {
      TARGETS.forEach((sel, i) => {
        const el = document.querySelector(sel);
        if (!el || el.classList.contains('hero-load')) return;
        el.style.opacity   = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = `opacity 0.6s ease ${BASE + i * STAGGER}ms, transform 0.6s ease ${BASE + i * STAGGER}ms`;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.style.opacity   = '1';
          el.style.transform = 'none';
        }));
      });
    }

    if (document.readyState === 'complete') runFallbackEntry();
    else window.addEventListener('load', runFallbackEntry, { once: true });
  })();


  /* ════════════════════════════════════════════════════════════════
     7. INPUT LABEL FLOAT
  ════════════════════════════════════════════════════════════════ */
  document.querySelectorAll('.fg label').forEach(label => {
    const input = label.nextElementSibling;
    if (!input) return;
    input.addEventListener('focus', () => { label.style.color = 'var(--acc)'; });
    input.addEventListener('blur',  () => { label.style.color = ''; });
  });


  /* ════════════════════════════════════════════════════════════════
     8. FORM VALIDATION — shake on empty, email check, success state
  ════════════════════════════════════════════════════════════════ */
  const sbtn = document.getElementById('sbtn');
  if (sbtn) {
    sbtn.addEventListener('click', () => {
      const nameInp  = document.getElementById('fn');
      const emailInp = document.getElementById('fe');
      const subInp   = document.getElementById('fs');
      const msgInp   = document.getElementById('fm');
      const fmsg     = document.getElementById('fmsg');

      let valid = true;

      function markError(inp, msg) {
        if (!inp) return;
        inp.style.animation   = 'shake 0.4s ease';
        inp.style.borderColor = '#ef4444';
        setTimeout(() => { inp.style.animation = ''; inp.style.borderColor = ''; }, 700);
        if (fmsg && msg) {
          fmsg.textContent  = msg;
          fmsg.style.color  = '#f87171';
        }
        valid = false;
      }

      /* Reset fmsg */
      if (fmsg) { fmsg.textContent = ''; fmsg.style.color = ''; }

      /* Name */
      if (!nameInp || !nameInp.value.trim()) {
        markError(nameInp, 'Please enter your name.'); return;
      }
      /* Email — type="email" + manual check */
      const emailVal = emailInp ? emailInp.value.trim() : '';
      if (!emailVal) {
        markError(emailInp, 'Please enter your email.'); return;
      }
      if (!emailVal.includes('@') || !emailVal.includes('.') || emailVal.indexOf('@') === 0) {
        markError(emailInp, 'Please enter a valid email address.'); return;
      }
      /* Message */
      if (!msgInp || !msgInp.value.trim()) {
        markError(msgInp, 'Please enter a message.'); return;
      }

      /* All valid — build mailto: and open the user’s email client.
         The form previously showed a fake success message without sending anything.
         Now it composes a real email pre-filled with the form data. */
      const toEmail = (function () {
        const hireLink = document.getElementById('hire-btn');
        if (hireLink) {
          const m = hireLink.href.match(/mailto:([^?]+)/);
          if (m) return decodeURIComponent(m[1]);
        }
        const ceEl = document.getElementById('contact-email');
        const ceLink = ceEl && ceEl.querySelector('a[href^="mailto:"]');
        if (ceLink) return ceLink.href.replace('mailto:', '');
        return 'srishanth@gmail.com';
      })();

      const mailSubject = encodeURIComponent(
        (subInp && subInp.value.trim()) || 'Portfolio Contact'
      );
      const mailBody = encodeURIComponent(
        'Name: ' + nameInp.value.trim() + '\n' +
        'Email: ' + emailVal + '\n\n' +
        msgInp.value.trim()
      );
      window.location.href = 'mailto:' + toEmail + '?subject=' + mailSubject + '&body=' + mailBody;

      if (fmsg) {
        fmsg.textContent = '✓ Opening your email client…';
        fmsg.style.color = '#56d364';
      }
      sbtn.style.opacity = '0.6';
      sbtn.disabled = true;
      setTimeout(() => {
        sbtn.style.opacity = '';
        sbtn.disabled = false;
        if (fmsg) { fmsg.textContent = ''; fmsg.style.color = ''; }
        [nameInp, emailInp, subInp, msgInp].forEach(inp => { if (inp) inp.value = ''; });
      }, 3500);
    });
  }


  /* ════════════════════════════════════════════════════════════════
     9. SECTION HEADING GLOW — subtle mouse position gradient
  ════════════════════════════════════════════════════════════════ */
  document.querySelectorAll('.stit').forEach(title => {
    title.addEventListener('mousemove', (e) => {
      const rect = title.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
      const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
      title.style.backgroundImage      = `radial-gradient(circle at ${x}% ${y}%, var(--acc), var(--text))`;
      title.style.webkitBackgroundClip = 'text';
      title.style.webkitTextFillColor  = 'transparent';
    });
    title.addEventListener('mouseleave', () => {
      title.style.backgroundImage      = '';
      title.style.webkitBackgroundClip = '';
      title.style.webkitTextFillColor  = '';
    });
  });


  /* ════════════════════════════════════════════════════════════════
     10. THEME TOGGLE — DISABLED
     Ownership transferred to visual-builder.js ThemeCycle.
     #thm-picker removed from DOM. #thm-btn click handled there.
  ════════════════════════════════════════════════════════════════ */
  /* (no-op — kept as comment block to document the transfer) */


  /* ════════════════════════════════════════════════════════════════
     11. HAMBURGER MENU
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const ham  = document.getElementById('ham');
    const mnav = document.getElementById('mnav');
    if (!ham || !mnav) return;
    ham.addEventListener('click', () => {
      mnav.classList.toggle('open');
    });
    mnav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => mnav.classList.remove('open'));
    });
  })();


  /* ════════════════════════════════════════════════════════════════
     12. TIME GREETING
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const el = document.getElementById('greet-txt');
    if (!el) return;
    const h = new Date().getHours();
    el.textContent = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
  })();


  /* ════════════════════════════════════════════════════════════════
     13. TYPED TEXT
  ════════════════════════════════════════════════════════════════ */
  (() => {
    const el = document.getElementById('typed-txt');
    if (!el) return;
    const phrases = [
      'AI & ML Engineer',
      'Python Developer',
      'Problem Solver',
      'B.Tech Student'
    ];
    let pi = 0, ci = 0, deleting = false;
    function type() {
      const phrase = phrases[pi];
      if (!deleting) {
        el.textContent = phrase.slice(0, ci + 1);
        ci++;
        if (ci === phrase.length) { deleting = true; setTimeout(type, 1800); return; }
      } else {
        el.textContent = phrase.slice(0, ci - 1);
        ci--;
        if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; setTimeout(type, 400); return; }
      }
      setTimeout(type, deleting ? 55 : 80);
    }
    setTimeout(type, 1200);
  })();


  /* ════════════════════════════════════════════════════════════════
     14. CERT MODAL — dynamic per-certificate, backdrop-close, keyboard
  ════════════════════════════════════════════════════════════════ */
  /* ── Cert Modal Engine v3.0 — image-first, emoji fallback, smooth ── */
  (function initCertModal() {
    var backdrop = document.getElementById('cert-modal');
    var box      = document.getElementById('cert-modal-box');
    var closeBtn = document.getElementById('cert-close-btn');
    var imgView  = document.getElementById('cert-modal-img-view');
    var txtView  = document.getElementById('cert-modal-text-view');
    if (!backdrop) return;

    // Horizontal gallery state
    var _galleryIdx = 0;
    var _galleryImgs = [];

    function goToSlide(idx, animated) {
      var imgList = document.getElementById('cert-modal-img-list');
      var dotsEl  = document.getElementById('cert-modal-dots');
      var prev    = document.getElementById('cert-arrow-prev');
      var next    = document.getElementById('cert-arrow-next');
      var cnt     = document.getElementById('cert-modal-count');
      if (!imgList) return;

      _galleryIdx = Math.max(0, Math.min(idx, _galleryImgs.length - 1));

      // Translate the strip
      imgList.style.transition = animated !== false
        ? 'transform 0.42s cubic-bezier(0.22,1,0.36,1)'
        : 'none';
      imgList.style.transform = 'translateX(-' + (_galleryIdx * 100) + '%)';

      // Update dots
      if (dotsEl) {
        var dots = dotsEl.querySelectorAll('.cert-modal-dot');
        dots.forEach(function(d, i) { d.classList.toggle('active', i === _galleryIdx); });
      }
      // Update arrows
      if (prev) prev.classList.toggle('hidden', _galleryIdx === 0);
      if (next) next.classList.toggle('hidden', _galleryIdx === _galleryImgs.length - 1);
      // Update count
      if (cnt && _galleryImgs.length > 1) {
        cnt.textContent = (_galleryIdx + 1) + ' / ' + _galleryImgs.length;
      }
    }

    function initGallery(images) {
      _galleryImgs = images;
      _galleryIdx  = 0;

      var imgList = document.getElementById('cert-modal-img-list');
      var dotsEl  = document.getElementById('cert-modal-dots');
      var hintEl  = document.getElementById('cert-swipe-hint');
      var scroll  = document.getElementById('cert-modal-img-scroll');

      if (imgList) {
        imgList.style.transition = 'none';
        imgList.style.transform  = 'translateX(0)';
        imgList.innerHTML = images.map(function(src, i) {
          return '<img class="cert-modal-full-img" src="' + src +
            '" alt="Certificate ' + (i+1) + '" loading="' + (i===0?'eager':'lazy') + '"/>';
        }).join('');
      }

      // Build dots
      if (dotsEl) {
        dotsEl.innerHTML = '';
        if (images.length > 1) {
          images.forEach(function(_, i) {
            var dot = document.createElement('button');
            dot.className = 'cert-modal-dot' + (i===0?' active':'');
            dot.setAttribute('aria-label', 'Go to certificate ' + (i+1));
            dot.addEventListener('click', function() { goToSlide(i, true); });
            dotsEl.appendChild(dot);
          });
          dotsEl.style.display = 'flex';
        } else {
          dotsEl.style.display = 'none';
        }
      }

      // Show/hide swipe hint
      if (hintEl) hintEl.style.display = images.length > 1 ? 'block' : 'none';

      // Arrows + count
      goToSlide(0, false);

      // ── INPUT HANDLING ──────────────────────────────────
      if (!scroll || scroll.__galleryBound) return;
      scroll.__galleryBound = true;

      // 1. Keyboard arrows
      function onKey(e) {
        if (!backdrop.classList.contains('open')) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goToSlide(_galleryIdx+1, true); }
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   { e.preventDefault(); goToSlide(_galleryIdx-1, true); }
      }
      document.addEventListener('keydown', onKey);
      backdrop._galleryKeyHandler = onKey;

      // 2. Mouse wheel (horizontal scroll = next/prev, vertical = next/prev too)
      var _wheelLock = false;
      scroll.addEventListener('wheel', function(e) {
        e.preventDefault();
        if (_wheelLock) return;
        var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (delta > 30)  { goToSlide(_galleryIdx+1, true); _wheelLock=true; setTimeout(function(){_wheelLock=false;},500); }
        if (delta < -30) { goToSlide(_galleryIdx-1, true); _wheelLock=true; setTimeout(function(){_wheelLock=false;},500); }
      }, { passive: false });

      // 3. Touch swipe
      var _touchStartX = 0;
      scroll.addEventListener('touchstart', function(e) { _touchStartX = e.touches[0].clientX; }, { passive: true });
      scroll.addEventListener('touchend', function(e) {
        var dx = e.changedTouches[0].clientX - _touchStartX;
        if (Math.abs(dx) > 40) goToSlide(dx < 0 ? _galleryIdx+1 : _galleryIdx-1, true);
      }, { passive: true });

      // 4. Mouse drag
      var _dragStartX = 0, _dragging = false;
      scroll.addEventListener('mousedown', function(e) { _dragStartX=e.clientX; _dragging=true; }, { passive: true });
      scroll.addEventListener('mouseup', function(e) {
        if (!_dragging) return; _dragging=false;
        var dx = e.clientX - _dragStartX;
        if (Math.abs(dx) > 40) goToSlide(dx < 0 ? _galleryIdx+1 : _galleryIdx-1, true);
      });
      scroll.addEventListener('mouseleave', function() { _dragging=false; });
    }

    // Arrow buttons
    var prevBtn = document.getElementById('cert-arrow-prev');
    var nextBtn = document.getElementById('cert-arrow-next');
    if (prevBtn) prevBtn.addEventListener('click', function() { goToSlide(_galleryIdx-1, true); });
    if (nextBtn) nextBtn.addEventListener('click', function() { goToSlide(_galleryIdx+1, true); });

    function openModal(opts) {
      /* opts: { title, org, body, imgSrc, images:[], emoji } */

      // Normalise images array
      var images = [];
      if (opts.images && opts.images.length) {
        images = opts.images.filter(Boolean);
      } else if (opts.imgSrc) {
        images = [opts.imgSrc];
      }
      var hasImg = images.length > 0;

      /* Switch view */
      imgView.classList.toggle('active', hasImg);
      txtView.classList.toggle('active', !hasImg);
      box.classList.toggle('has-image', hasImg);

      if (hasImg) {
        // Remove old key handler if any
        if (backdrop._galleryKeyHandler) {
          document.removeEventListener('keydown', backdrop._galleryKeyHandler);
          backdrop._galleryKeyHandler = null;
        }
        // Reset gallery bound flag so handlers re-init per open
        var scroll = document.getElementById('cert-modal-img-scroll');
        if (scroll) scroll.__galleryBound = false;
        initGallery(images);

        /* Meta bar */
        var eI = document.getElementById('cert-modal-emoji-img');
        var tI = document.getElementById('cert-modal-title-img');
        var oI = document.getElementById('cert-modal-org-img');
        if (eI) eI.textContent = opts.emoji || '🏆';
        if (tI) tI.textContent = opts.title || '';
        if (oI) oI.textContent = opts.org   || '';
      } else {
        /* Text / emoji view */
        var eT = document.getElementById('cert-modal-emoji-text');
        var tT = document.getElementById('cert-modal-title-text');
        var oT = document.getElementById('cert-modal-org-text');
        var bT = document.getElementById('cert-modal-body-text');
        if (eT) { eT.textContent = opts.emoji || '🏆'; eT.style.animation = 'none'; void eT.offsetWidth; eT.style.animation = ''; }
        if (tT) tT.textContent = opts.title || '';
        if (oT) oT.textContent = opts.org   || '';
        if (bT) bT.textContent = opts.body  || '';
      }

      backdrop.classList.add('open');
      document.body.style.overflow = 'hidden';

      if (!backdrop._keyHandler) {
        backdrop._keyHandler = function(e) { if (e.key === 'Escape') closeModal(); };
        document.addEventListener('keydown', backdrop._keyHandler);
      }
    }

    function closeModal() {
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
      if (backdrop._galleryKeyHandler) {
        document.removeEventListener('keydown', backdrop._galleryKeyHandler);
        backdrop._galleryKeyHandler = null;
      }
    }

    /* Backdrop click closes */
    backdrop.addEventListener('click', function(e) { if (e.target === backdrop) closeModal(); });
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    /* Public API */
    window.openCertModal = function(title, org, body, imgSrc, emoji, images) {
      openModal({ title: title, org: org, body: body, imgSrc: imgSrc, emoji: emoji, images: images });
    };
    window.closeCertModal = closeModal;

    /* Wire up static cert-items */
    document.querySelectorAll('.cert-item[data-cert-title]').forEach(function(item) {
      item.style.cursor = 'pointer';
      function trigger() {
        openModal({
          title:  item.getAttribute('data-cert-title') || '',
          org:    item.getAttribute('data-cert-org')   || '',
          body:   item.getAttribute('data-cert-body')  || '',
          imgSrc: item.getAttribute('data-cert-img')   || '',
          emoji:  item.getAttribute('data-cert-emoji') || '🏆',
        });
      }
      item.addEventListener('click', trigger);
      item.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); }
      });
    });
  })();

  console.log('%c✦ Portfolio Enhancements v4.0 — Minimal Premium', 'color:#4f6ef5;font-family:monospace;font-weight:bold');

})();
