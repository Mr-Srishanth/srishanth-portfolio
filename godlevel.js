/* ═══════════════════════════════════════════════════════════════════
   GODLEVEL.JS — Awwwards-Quality Upgrade
   OWNS: particles, magnetic, project modal, cursor states,
         timeline active nodes, word reveal, contact form mailto
   NEVER breaks existing JS modules.
   ═══════════════════════════════════════════════════════════════════ */

(function GodLevel() {
  'use strict';

  if (window.__godLevelLoaded) return;
  window.__godLevelLoaded = true;

  const NO_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_TOUCH  = 'ontouchstart' in window;

  function lerp(a, b, t) { return a + (b - a) * t; }


  /* ════════════════════════════════════════════════════════════════
     1. HERO PARTICLES — minimal floating dots
  ════════════════════════════════════════════════════════════════ */
  const HeroParticles = (() => {
    if (NO_MOTION || IS_TOUCH) return { init() {} };

    let canvas, ctx, W, H, particles = [], rafId = null;
    const COUNT = 28;
    const SPEED = 0.18;

    function getAccColor() {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#4f6ef5';
      return v;
    }

    function hexToRgb(hex) {
      const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return r ? [parseInt(r[1],16), parseInt(r[2],16), parseInt(r[3],16)] : [79,110,245];
    }

    function makeParticle() {
      return {
        x:  Math.random() * W,
        y:  Math.random() * H,
        r:  Math.random() * 1.8 + 0.4,
        vx: (Math.random() - 0.5) * SPEED,
        vy: (Math.random() - 0.5) * SPEED,
        a:  Math.random() * 0.5 + 0.15,
        phase: Math.random() * Math.PI * 2,
      };
    }

    function resize() {
      const hero = document.getElementById('home');
      if (!hero) return;
      W = hero.offsetWidth;
      H = hero.offsetHeight;
      canvas.width  = W;
      canvas.height = H;
    }

    function draw(ts) {
      ctx.clearRect(0, 0, W, H);
      const [r, g, b] = hexToRgb(getAccColor());

      particles.forEach(p => {
        const pulse = Math.sin(ts * 0.001 + p.phase) * 0.15;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = W;
        if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H;
        if (p.y > H) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${(p.a + pulse).toFixed(2)})`;
        ctx.fill();
      });

      rafId = requestAnimationFrame(draw);
    }

    function init() {
      canvas = document.getElementById('hero-particles');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      resize();
      particles = Array.from({ length: COUNT }, makeParticle);
      window.addEventListener('resize', resize, { passive: true });
      rafId = requestAnimationFrame(draw);
    }

    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     2. HERO STATEMENT — Word-by-word reveal
  ════════════════════════════════════════════════════════════════ */
  const HeroStatement = (() => {
    function init() {
      const el = document.querySelector('.h-statement');
      if (!el) return;
      const words = el.querySelectorAll('.word');
      if (!words.length) return;

      function reveal() {
        words.forEach((w, i) => {
          setTimeout(() => w.classList.add('in'), i * 65 + 200);
        });
      }

      // Trigger after hero animations settle (~600ms)
      setTimeout(reveal, 700);
    }
    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     3. MAGNETIC EFFECT — btn-p (hire) + nav-cta ONLY
  ════════════════════════════════════════════════════════════════ */
  const Magnetic = (() => {
    if (IS_TOUCH || NO_MOTION) return { init() {} };

    const STRENGTH = 0.35;
    const RESET_EASE = 0.12;

    function attach(el) {
      if (el._magneticBound) return;
      el._magneticBound = true;
      el.classList.add('magnetic');

      let ox = 0, oy = 0, tx = 0, ty = 0, raf = null;

      function tick() {
        ox = lerp(ox, tx, 0.14);
        oy = lerp(oy, ty, 0.14);
        el.style.transform = `translate(${ox.toFixed(2)}px, ${oy.toFixed(2)}px)`;
        if (Math.abs(tx - ox) > 0.2 || Math.abs(ty - oy) > 0.2) {
          raf = requestAnimationFrame(tick);
        } else {
          raf = null;
        }
      }

      function start() { if (!raf) raf = requestAnimationFrame(tick); }

      el.addEventListener('mousemove', e => {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        tx = (e.clientX - cx) * STRENGTH;
        ty = (e.clientY - cy) * STRENGTH;
        start();
      }, { passive: true });

      el.addEventListener('mouseleave', () => {
        tx = 0; ty = 0; start();
      }, { passive: true });
    }

    function init() {
      // Attach to hire button and nav CTA
      const targets = [
        ...document.querySelectorAll('#hire-btn, .h-btns .btn-p, .nav-cta'),
      ];
      targets.forEach(attach);

      // Re-attach after potential CMS re-render
      const obs = new MutationObserver(() => {
        document.querySelectorAll('#hire-btn, .h-btns .btn-p, .nav-cta').forEach(attach);
      });
      const hbtns = document.querySelector('.h-btns');
      if (hbtns) obs.observe(hbtns, { childList: true });

      // ── Nav links: same rAF lerp but softer strength (0.18) ──────────
      // Uses a self-contained attach so STRENGTH stays unchanged for btns.
      attachNavLinks();
    }

    function attachNavLinks() {
      const NAV_STRENGTH = 0.18;
      const NAV_LERP     = 0.10; // slightly slower return than buttons
      const NAV_DEAD     = 0.15; // stop threshold px

      document.querySelectorAll('.nav-links a').forEach(el => {
        if (el._magNavBound) return;
        el._magNavBound = true;

        let ox = 0, oy = 0, tx = 0, ty = 0, raf = null;

        function tick() {
          ox += (tx - ox) * NAV_LERP;
          oy += (ty - oy) * NAV_LERP;
          el.style.transform = `translate(${ox.toFixed(2)}px,${oy.toFixed(2)}px)`;
          if (Math.abs(tx - ox) > NAV_DEAD || Math.abs(ty - oy) > NAV_DEAD) {
            raf = requestAnimationFrame(tick);
          } else {
            /* Settle exactly at target, clear inline transform if at rest */
            el.style.transform = tx === 0 && ty === 0 ? '' : `translate(${tx}px,${ty}px)`;
            raf = null;
          }
        }

        function start() { if (!raf) raf = requestAnimationFrame(tick); }

        el.addEventListener('mousemove', e => {
          const rect = el.getBoundingClientRect();
          tx = (e.clientX - (rect.left + rect.width  * 0.5)) * NAV_STRENGTH;
          ty = (e.clientY - (rect.top  + rect.height * 0.5)) * NAV_STRENGTH;
          start();
        }, { passive: true });

        el.addEventListener('mouseleave', () => {
          tx = 0; ty = 0; start();
        }, { passive: true });
      });
    }

    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     4. CURSOR STATES — hover glow + click compression
  ════════════════════════════════════════════════════════════════ */
  const CursorStates = (() => {
    if (IS_TOUCH) return { init() {} };

    const HOVER_SELS = [
      'a', 'button', '.btn-p', '.btn-o', '.btn-send', '.nav-cta',
      '.sk-card', '.pj', '.ach-card', '.about-card', '.vtl-card',
      '.cg-card', '.cert-ring-btn', '.soc', '.cert-item', '.tsw',
    ].join(',');

    function init() {
      document.addEventListener('mouseover', e => {
        if (e.target.closest(HOVER_SELS)) {
          document.body.classList.add('cursor-hover');
        }
      }, { passive: true });

      document.addEventListener('mouseout', e => {
        if (e.target.closest(HOVER_SELS)) {
          document.body.classList.remove('cursor-hover');
        }
      }, { passive: true });

      document.addEventListener('mousedown', () => {
        document.body.classList.add('cursor-click');
        document.body.classList.remove('cursor-hover');
      }, { passive: true });

      document.addEventListener('mouseup', () => {
        document.body.classList.remove('cursor-click');
      }, { passive: true });
    }

    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     5. PROJECT FULLSCREEN MODAL
  ════════════════════════════════════════════════════════════════ */
  const ProjectModal = (() => {
    let modal = null;
    let isOpen = false;

    function createModal() {
      const el = document.createElement('div');
      el.id = 'pj-modal';
      el.innerHTML = `
        <div class="pj-modal-box">
          <button class="pj-modal-close" id="pj-modal-close" aria-label="Close">✕</button>
          <div class="pj-modal-preview" id="pj-modal-preview"></div>
          <div class="pj-modal-header">
            <div class="pj-modal-title" id="pj-modal-title"></div>
            <div class="pj-modal-links" id="pj-modal-links"></div>
          </div>
          <div class="pj-modal-desc" id="pj-modal-desc"></div>
          <div class="pj-modal-tags-label">// TECH STACK</div>
          <div class="pj-modal-tags" id="pj-modal-tags"></div>
        </div>`;
      document.body.appendChild(el);
      return el;
    }

    function open(data) {
      if (!modal) modal = createModal();
      isOpen = true;

      // Populate
      document.getElementById('pj-modal-preview').innerHTML =
        `<span style="position:relative;z-index:1">${data.icon}</span>`;
      document.getElementById('pj-modal-title').textContent = data.title;
      document.getElementById('pj-modal-desc').textContent  = data.desc;

      const linksEl = document.getElementById('pj-modal-links');
      linksEl.innerHTML = `
        <a href="${data.github || '#'}" target="_blank" class="pj-modal-link github">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub
        </a>
        <a href="${data.live || '#'}" target="_blank" class="pj-modal-link live">
          ↗ Live Demo
        </a>`;

      const tagsEl = document.getElementById('pj-modal-tags');
      tagsEl.innerHTML = (data.tags || []).map(t =>
        `<span class="pj-modal-tag">${t}</span>`
      ).join('');

      // Show modal
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';

      // Stagger tags
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          tagsEl.querySelectorAll('.pj-modal-tag').forEach((tag, i) => {
            setTimeout(() => tag.classList.add('in'), i * 50 + 120);
          });
        });
      });

      // Bind close
      document.getElementById('pj-modal-close').onclick = close;
    }

    function close() {
      if (!modal || !isOpen) return;
      isOpen = false;
      modal.classList.remove('open');
      document.body.style.overflow = '';
    }

    function extractData(card) {
      const titleEl = card.querySelector('.pj-title');
      const descEl  = card.querySelector('.pj-desc');
      const icEl    = card.querySelector('.pj-ic');
      // Read from pj-actions buttons (new structure)
      const ghLink  = card.querySelector('.pj-btn-gh');
      const lvLink  = card.querySelector('.pj-btn-live');
      // Fallback: legacy pj-links in case of CMS-rendered old markup
      const ghFb    = card.querySelector('.pj-links a[title="GitHub"]');
      const lvFb    = card.querySelector('.pj-links a[title="Live"]');
      const tags    = [...card.querySelectorAll('.ptag')].map(t => t.textContent.trim());

      return {
        title:  titleEl ? titleEl.textContent.trim() : 'Project',
        desc:   descEl  ? descEl.textContent.trim()  : '',
        icon:   icEl    ? icEl.textContent.trim()    : '📁',
        github: (ghLink || ghFb) ? (ghLink || ghFb).href : '#',
        live:   (lvLink || lvFb) ? (lvLink || lvFb).href : '#',
        tags,
      };
    }

    function attachHints() {
      document.querySelectorAll('.pj').forEach(card => {
        // Add hint if not already present
        if (!card.querySelector('.pj-hint')) {
          const hint = document.createElement('span');
          hint.className = 'pj-hint';
          hint.textContent = 'VIEW ↗';
          card.style.position = 'relative';
          card.appendChild(hint);
        }
      });
    }

    function bindCards() {
      attachHints();
      document.querySelectorAll('.pj').forEach(card => {
        if (card._pjModalBound) return;
        card._pjModalBound = true;
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => open(extractData(card)));
      });
    }

    function init() {
      bindCards();

      // Re-bind after CMS re-renders the grid
      const grid = document.querySelector('.projects-grid');
      if (grid) {
        new MutationObserver(() => bindCards()).observe(grid, { childList: true });
      }

      // Close on backdrop click
      document.addEventListener('click', e => {
        if (modal && isOpen && e.target === modal) close();
      });

      // Close on Escape
      document.addEventListener('keydown', e => {
        if (isOpen && e.key === 'Escape') close();
      });
    }

    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     6. TIMELINE ACTIVE NODE — superseded by timeline.js
        Active node highlighting is now handled inside initTimeline()
        which runs as part of the rAF tick loop for zero extra scroll
        listeners. This stub keeps the call site intact.
  ════════════════════════════════════════════════════════════════ */
  const TimelineHighlight = (() => {
    function init() {
      /* No-op: timeline.js handles .tl-active inside its rAF loop */
    }
    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     7. CONTACT FORM — EmailJS
     Service  : service_pp5cd8o
     Template : template_qpqqc1k
     Public key is initialized in index.html <head>
  ════════════════════════════════════════════════════════════════ */
  const ContactForm = (() => {

    /* ── Toast notification system ─────────────────────────────── */
    function showToast(message, type) {
      /* type: 'success' | 'error' | 'warning' */
      let toast = document.getElementById('ct-toast');
      if (!toast) return; /* injected by init() */

      /* Clear any running hide timer */
      if (toast._hideTimer) clearTimeout(toast._hideTimer);

      toast.textContent = message;
      toast.className   = 'ct-toast ct-toast--' + (type || 'success');

      /* Force reflow so transition fires even if already visible */
      void toast.offsetHeight;
      toast.classList.add('ct-toast--visible');

      toast._hideTimer = setTimeout(() => {
        toast.classList.remove('ct-toast--visible');
      }, 4000);
    }

    /* ── Button loading state ───────────────────────────────────── */
    function setBtnState(btn, state) {
      /* state: 'idle' | 'sending' */
      if (state === 'sending') {
        btn.disabled = true;
        btn.dataset.origText = btn.innerHTML;
        btn.innerHTML =
          '<span class="ct-btn-spinner"></span>' +
          '<span>Sending…</span>';
        btn.classList.add('ct-btn--sending');
      } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.origText || 'Send Message';
        btn.classList.remove('ct-btn--sending');
      }
    }

    /* ── Inject toast element into DOM ─────────────────────────── */
    function injectToast() {
      if (document.getElementById('ct-toast')) return;
      const el = document.createElement('div');
      el.id = 'ct-toast';
      el.className = 'ct-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }

    /* ── Validate a single field ───────────────────────────────── */
    function validateField(el, message) {
      if (!el) return true;
      const val = el.value.trim();
      const fg  = el.closest('.fg');

      if (!val) {
        fg && fg.classList.add('fg--error');
        el.classList.add('inp--error');
        el.addEventListener('input', () => {
          fg && fg.classList.remove('fg--error');
          el.classList.remove('inp--error');
        }, { once: true });
        return false;
      }
      return true;
    }

    /* ── Main init ─────────────────────────────────────────────── */
    function init() {
      injectToast();

      const btn = document.getElementById('sbtn');
      if (!btn) return;

      btn.addEventListener('click', handleSubmit);

      /* Also handle Enter in inputs */
      ['fn','fe','fs','fm'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.tagName !== 'TEXTAREA') {
          el.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
          });
        }
      });
    }

    /* ── Submit handler ────────────────────────────────────────── */
    function handleSubmit() {
      const nameEl    = document.getElementById('fn');
      const emailEl   = document.getElementById('fe');
      const subjectEl = document.getElementById('fs');
      const msgEl     = document.getElementById('fm');
      const btn       = document.getElementById('sbtn');

      const name    = nameEl?.value.trim()    || '';
      const email   = emailEl?.value.trim()   || '';
      const subject = subjectEl?.value.trim() || '';
      const message = msgEl?.value.trim()     || '';

      /* ── Validation ── */
      let valid = true;
      if (!validateField(nameEl,    'Name is required'))    valid = false;
      if (!validateField(emailEl,   'Email is required'))   valid = false;
      if (!validateField(msgEl,     'Message is required')) valid = false;

      /* Basic email format check */
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        emailEl?.classList.add('inp--error');
        emailEl?.closest('.fg')?.classList.add('fg--error');
        showToast('Please enter a valid email address.', 'warning');
        return;
      }

      if (!valid) {
        showToast('Please fill in all required fields.', 'warning');
        return;
      }

      /* ── Guard: EmailJS must be loaded ── */
      if (typeof emailjs === 'undefined') {
        showToast('Mail service unavailable. Try again shortly.', 'error');
        console.error('[ContactForm] EmailJS not loaded');
        return;
      }

      /* ── Send ── */
      setBtnState(btn, 'sending');

      emailjs.send(
        'service_pp5cd8o',
        'template_qpqqc1k',
        {
          from_name:  name,
          from_email: email,
          subject:    subject || 'Portfolio Contact',
          message:    message,
          reply_to:   email,
        }
      )
      .then(() => {
        setBtnState(btn, 'idle');
        showToast('✓ Message sent! I\'ll get back to you soon.', 'success');

        /* Clear the form */
        if (nameEl)    nameEl.value    = '';
        if (emailEl)   emailEl.value   = '';
        if (subjectEl) subjectEl.value = '';
        if (msgEl)     msgEl.value     = '';

        /* Clear legacy fmsg element if present */
        const fmsg = document.getElementById('fmsg');
        if (fmsg) fmsg.textContent = '';
      })
      .catch(err => {
        setBtnState(btn, 'idle');
        console.error('[ContactForm] EmailJS error:', err);
        showToast('✗ Failed to send. Please try again.', 'error');
      });
    }

    return { init, showToast };
  })();


  /* ════════════════════════════════════════════════════════════════
     8. HERO PARTICLES CANVAS — inject into DOM
  ════════════════════════════════════════════════════════════════ */
  function injectCanvas() {
    const hero = document.getElementById('home');
    if (!hero || document.getElementById('hero-particles')) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'hero-particles';
    hero.insertBefore(canvas, hero.firstChild);
  }


  /* ════════════════════════════════════════════════════════════════
     9. HERO STATEMENT — inject into DOM
  ════════════════════════════════════════════════════════════════ */
  function injectStatement() {
    // Only inject if not already there
    if (document.querySelector('.h-statement')) return;
    const typed = document.querySelector('.h-typed');
    if (!typed) return;

    const text = "I don't just write code. I build digital experiences that feel alive.";
    const words = text.split(' ').map(word =>
      `<span class="word">${word}</span>`
    ).join(' ');

    const p = document.createElement('p');
    p.className = 'h-statement';
    p.innerHTML = words;

    // Insert after typed text
    typed.parentNode.insertBefore(p, typed.nextSibling);
  }


  /* ════════════════════════════════════════════════════════════════
     10. ADMIN IMAGE PREVIEW ENHANCEMENT
  ════════════════════════════════════════════════════════════════ */
  const AdminEnhance = (() => {
    function init() {
      // Only run on admin page
      if (!document.getElementById('adminPanel') && !window.location.pathname.includes('admin')) return;

      const fileInputs = document.querySelectorAll('input[type="file"]');
      fileInputs.forEach(input => {
        if (input._previewBound) return;
        input._previewBound = true;
        input.addEventListener('change', () => {
          const file = input.files[0];
          if (!file || !file.type.startsWith('image/')) return;

          let preview = input.parentElement.querySelector('.admin-img-preview');
          if (!preview) {
            preview = document.createElement('img');
            preview.className = 'admin-img-preview';
            preview.style.cssText =
              'display:block;max-width:100%;max-height:120px;border-radius:8px;margin-top:8px;border:1px solid rgba(255,255,255,0.1);object-fit:cover;';
            input.parentElement.appendChild(preview);
          }

          const reader = new FileReader();
          reader.onload = e => { preview.src = e.target.result; };
          reader.readAsDataURL(file);
        });
      });
    }
    return { init };
  })();


  /* ════════════════════════════════════════════════════════════════
     BOOT
  ════════════════════════════════════════════════════════════════ */
  function boot() {
    injectCanvas();
    injectStatement();

    HeroParticles.init();
    HeroStatement.init();
    Magnetic.init();
    CursorStates.init();
    ProjectModal.init();
    TimelineHighlight.init();
    ContactForm.init();
    AdminEnhance.init();

    // Re-apply magnetic after CMS might re-render buttons
    setTimeout(() => Magnetic.init(), 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('%c✦ GodLevel.js v1.0 — Awwwards Quality Active', 'color:#22d3ee;font-family:monospace;font-weight:bold;font-size:13px');

})();
