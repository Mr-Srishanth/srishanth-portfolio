/* ═══════════════════════════════════════════════════════════════════
   CERT-GALLERY.JS — Premium Certificate Gallery  v1.0
   ─────────────────────────────────────────────────────────────────
   Fully dynamic certificate grid + fullscreen modal viewer.
   No hardcoded images in HTML. Integrates with Cloudinary.js.
   ═══════════════════════════════════════════════════════════════════ */

(function CertGallery() {
  'use strict';

  /* ── MODAL STATE ───────────────────────────────────────────── */
  let _certs    = [];   /* all certificates being shown */
  let _idx      = 0;    /* current modal index */
  let _modal    = null; /* modal DOM element */
  let _isOpen   = false;
  let _touchX   = 0;

  /* ── LOAD DATA ─────────────────────────────────────────────────
     Priority order:
     1. portfolio-cert-tabs (tabbed admin format)
     2. portfolio-certificates (flat admin format)
     3. cl-media-registry.certificates (Cloudinary registry)
     4. Static data-* attributes from existing HTML
  ──────────────────────────────────────────────────────────────── */
  function loadCertData() {
    /* 1. Tabbed format */
    try {
      const tabs = JSON.parse(localStorage.getItem('portfolio-cert-tabs') || 'null');
      if (tabs && tabs.length) {
        return tabs.flatMap(t => t.certs || []);
      }
    } catch (e) {}

    /* 2. Flat format */
    try {
      const flat = JSON.parse(localStorage.getItem('portfolio-certificates') || 'null');
      if (flat && flat.length) return flat;
    } catch (e) {}

    /* 3. Cloudinary registry */
    try {
      const reg = JSON.parse(localStorage.getItem('cl-media-registry') || '{}');
      if (reg.certificates && reg.certificates.length) return reg.certificates;
    } catch (e) {}

    /* 4. Nothing saved — return empty (static HTML items still get modal binding) */
    return [];
  }

  /* ── BUILD GALLERY GRID ────────────────────────────────────────
     Renders cert cards into #cert-gallery-grid.
     If no dynamic data, leaves static HTML cards intact and
     just binds the modal to them.
  ──────────────────────────────────────────────────────────────── */
  function renderGallery() {
    const grid = document.getElementById('cert-gallery-grid');
    if (!grid) return;

    const data = loadCertData();

    if (data.length) {
      grid.innerHTML = data.map((c, i) => _buildCard(c, i)).join('');
    }
    /* Whether we injected dynamic or left static — bind all cards */
    _bindCards(grid);
  }

  function _buildCard(cert, idx) {
    const images = _getImages(cert);
    const hasImg = images.length > 0;
    const thumb  = hasImg ? images[0] : '';
    const emoji  = cert.emoji || '🏆';
    const title  = _esc(cert.title || 'Certificate');
    const org    = _esc(cert.org   || '');
    const body   = _esc(cert.body  || cert.description || '');
    const imgJson = _esc(JSON.stringify(images));

    /* Thumbnail URL: use Cloudinary optimisation if available */
    let thumbSrc = '';
    if (thumb && typeof Cloudinary !== 'undefined') {
      thumbSrc = Cloudinary.getImage(thumb, { w: 320, h: 200, c: 'fill' });
    } else if (thumb) {
      thumbSrc = thumb;
    }

    return `
    <div class="cg-card" role="button" tabindex="0"
         data-cert-idx="${idx}"
         data-cert-images="${imgJson}"
         data-cert-emoji="${_esc(emoji)}"
         data-cert-title="${title}"
         data-cert-org="${org}"
         data-cert-body="${body}">
      <div class="cg-card-img-wrap">
        ${hasImg
          ? `<img class="cg-card-img" src="${_esc(Cloudinary?.FALLBACK || '')}"
                  data-lazy-src="${_esc(thumbSrc)}"
                  alt="${title}" loading="lazy"/>`
          : `<div class="cg-card-emoji-wrap"><span class="cg-card-emoji">${emoji}</span></div>`
        }
        <div class="cg-card-shine"></div>
      </div>
      <div class="cg-card-body">
        <div class="cg-card-title">${title}</div>
        <div class="cg-card-org">${org}</div>
        ${hasImg ? '' : `<p class="cg-card-desc">${body}</p>`}
      </div>
      <div class="cg-card-hover-bar"></div>
    </div>`;
  }

  function _getImages(cert) {
    if (Array.isArray(cert.images) && cert.images.length) return cert.images.filter(Boolean);
    if (cert.image) return [cert.image];
    return [];
  }

  function _bindCards(container) {
    /* Lazy-load all thumb images */
    container.querySelectorAll('[data-lazy-src]').forEach(img => {
      if (typeof Cloudinary !== 'undefined') {
        Cloudinary.loadImage(img, img.dataset.lazySrc, { lazy: true });
      } else {
        img.src = img.dataset.lazySrc;
      }
    });

    /* Click / keyboard → open modal */
    container.querySelectorAll('.cg-card, .cert-item').forEach((card, i) => {
      const open = () => _openModal(card, container);
      card.addEventListener('click', open);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  /* ── BUILD MODAL (once) ──────────────────────────────────────── */
  function _buildModal() {
    if (document.getElementById('cg-modal')) return;

    const m = document.createElement('div');
    m.id = 'cg-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.innerHTML = `
      <div class="cg-modal-backdrop" id="cg-modal-backdrop"></div>
      <div class="cg-modal-box" id="cg-modal-box">
        <button class="cg-modal-close" id="cg-modal-close" aria-label="Close">✕</button>
        <div class="cg-modal-stage" id="cg-modal-stage">
          <button class="cg-modal-nav cg-modal-prev" id="cg-modal-prev" aria-label="Previous">&#8592;</button>
          <div class="cg-modal-viewport" id="cg-modal-viewport">
            <img class="cg-modal-img" id="cg-modal-img" src="" alt="" draggable="false"/>
            <div class="cg-modal-spinner" id="cg-modal-spinner"></div>
            <div class="cg-modal-text-panel" id="cg-modal-text-panel">
              <span class="cg-modal-text-emoji" id="cg-modal-text-emoji"></span>
              <div class="cg-modal-text-title" id="cg-modal-text-title"></div>
              <div class="cg-modal-text-org" id="cg-modal-text-org"></div>
              <p class="cg-modal-text-body" id="cg-modal-text-body"></p>
            </div>
          </div>
          <button class="cg-modal-nav cg-modal-next" id="cg-modal-next" aria-label="Next">&#8594;</button>
        </div>
        <div class="cg-modal-footer" id="cg-modal-footer">
          <span class="cg-modal-emoji-badge" id="cg-modal-emoji-badge"></span>
          <div class="cg-modal-meta">
            <div class="cg-modal-title" id="cg-modal-title"></div>
            <div class="cg-modal-org"   id="cg-modal-org"></div>
          </div>
          <div class="cg-modal-dots" id="cg-modal-dots"></div>
          <span class="cg-modal-counter" id="cg-modal-counter"></span>
        </div>
      </div>`;
    document.body.appendChild(m);
    _modal = m;

    /* ── Event bindings ── */
    document.getElementById('cg-modal-backdrop').addEventListener('click', _closeModal);
    document.getElementById('cg-modal-close').addEventListener('click', _closeModal);
    document.getElementById('cg-modal-prev').addEventListener('click', () => _navigate(-1));
    document.getElementById('cg-modal-next').addEventListener('click', () => _navigate(+1));

    /* Keyboard */
    document.addEventListener('keydown', e => {
      if (!_isOpen) return;
      if (e.key === 'Escape')     _closeModal();
      if (e.key === 'ArrowLeft')  _navigate(-1);
      if (e.key === 'ArrowRight') _navigate(+1);
    });

    /* Touch swipe */
    m.addEventListener('touchstart', e => { _touchX = e.touches[0].clientX; }, { passive: true });
    m.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - _touchX;
      if (Math.abs(dx) > 44) _navigate(dx < 0 ? 1 : -1);
    });
  }

  /* ── OPEN MODAL ──────────────────────────────────────────────── */
  function _openModal(card, container) {
    _buildModal();

    /* Collect all images for this card */
    const rawImages = JSON.parse(card.dataset.certImages || card.getAttribute('data-cert-images') || '[]');

    /* Collect metadata */
    const meta = {
      emoji: card.dataset.certEmoji  || card.getAttribute('data-cert-emoji') || '🏆',
      title: card.dataset.certTitle  || card.getAttribute('data-cert-title') || '',
      org:   card.dataset.certOrg    || card.getAttribute('data-cert-org')   || '',
      body:  card.dataset.certBody   || card.getAttribute('data-cert-body')  || '',
    };

    _certs  = rawImages;
    _idx    = 0;
    _isOpen = true;

    /* Populate footer */
    _setText('cg-modal-emoji-badge', meta.emoji);
    _setText('cg-modal-title',       meta.title);
    _setText('cg-modal-org',         meta.org);

    /* Show text panel if no images, image panel if images */
    const textPanel = document.getElementById('cg-modal-text-panel');
    const modalImg  = document.getElementById('cg-modal-img');
    if (_certs.length) {
      if (textPanel) textPanel.style.display = 'none';
      if (modalImg)  modalImg.style.display  = 'block';
    } else {
      if (textPanel) textPanel.style.display = 'flex';
      if (modalImg)  modalImg.style.display  = 'none';
      _setText('cg-modal-text-emoji', meta.emoji);
      _setText('cg-modal-text-title', meta.title);
      _setText('cg-modal-text-org',   meta.org);
      _setText('cg-modal-text-body',  meta.body);
    }

    _renderSlide();
    _renderDots();
    _updateNav();

    /* Animate in */
    _modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        _modal.classList.add('cg-modal-open');
      });
    });
    document.getElementById('cg-modal-close')?.focus();
  }

  /* ── CLOSE MODAL ─────────────────────────────────────────────── */
  function _closeModal() {
    if (!_isOpen || !_modal) return;
    _isOpen = false;
    _modal.classList.remove('cg-modal-open');
    setTimeout(() => {
      _modal.style.display = 'none';
      document.body.style.overflow = '';
    }, 380);
  }

  /* ── NAVIGATE ────────────────────────────────────────────────── */
  function _navigate(dir) {
    if (!_certs.length) return;
    _idx = Math.max(0, Math.min(_certs.length - 1, _idx + dir));
    _renderSlide();
    _renderDots();
    _updateNav();
  }

  /* ── RENDER CURRENT SLIDE ────────────────────────────────────── */
  function _renderSlide() {
    const imgEl   = document.getElementById('cg-modal-img');
    const spinner = document.getElementById('cg-modal-spinner');
    const counter = document.getElementById('cg-modal-counter');
    if (!imgEl || !_certs.length) return;

    const rawUrl = _certs[_idx];
    const url = typeof Cloudinary !== 'undefined'
      ? Cloudinary.getImage(rawUrl, { w: 1400, c: false }) /* keep aspect, just optimise */
      : rawUrl;

    /* Show spinner, hide image */
    imgEl.style.opacity = '0';
    imgEl.style.transform = 'scale(0.96)';
    if (spinner) spinner.style.display = 'block';

    const probe = new Image();
    probe.onload = () => {
      imgEl.src = url;
      if (spinner) spinner.style.display = 'none';
      requestAnimationFrame(() => {
        imgEl.style.opacity   = '1';
        imgEl.style.transform = 'scale(1)';
      });
    };
    probe.onerror = () => {
      imgEl.src = typeof Cloudinary !== 'undefined' ? Cloudinary.FALLBACK : '';
      if (spinner) spinner.style.display = 'none';
      imgEl.style.opacity = '0.35';
    };
    probe.src = url;

    /* Counter */
    if (counter) {
      counter.textContent = _certs.length > 1 ? `${_idx + 1} / ${_certs.length}` : '';
    }
  }

  /* ── RENDER DOT NAV ──────────────────────────────────────────── */
  function _renderDots() {
    const dotsEl = document.getElementById('cg-modal-dots');
    if (!dotsEl) return;
    if (_certs.length <= 1) { dotsEl.innerHTML = ''; return; }
    dotsEl.innerHTML = _certs.map((_, i) =>
      `<button class="cg-dot ${i === _idx ? 'cg-dot-active' : ''}" aria-label="Image ${i+1}"></button>`
    ).join('');
    dotsEl.querySelectorAll('.cg-dot').forEach((d, i) => {
      d.addEventListener('click', () => { _idx = i; _renderSlide(); _renderDots(); _updateNav(); });
    });
  }

  /* ── UPDATE PREV/NEXT VISIBILITY ─────────────────────────────── */
  function _updateNav() {
    const prev = document.getElementById('cg-modal-prev');
    const next = document.getElementById('cg-modal-next');
    if (prev) prev.classList.toggle('cg-nav-hidden', _idx === 0 || _certs.length <= 1);
    if (next) next.classList.toggle('cg-nav-hidden', _idx >= _certs.length - 1 || _certs.length <= 1);
  }

  /* ── ALSO BIND LEGACY CERT ITEMS (static HTML, no gallery grid) ─ */
  function bindLegacyCertItems() {
    document.querySelectorAll('.cert-item:not([data-cg-bound])').forEach(item => {
      item.dataset.cgBound = '1';
      item.addEventListener('click', () => _openModal(item, document.body));
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _openModal(item, document.body); }
      });
    });
  }

  /* ── UTILITIES ───────────────────────────────────────────────── */
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val || '';
  }

  /* ── BOOT ────────────────────────────────────────────────────── */
  function boot() {
    renderGallery();
    bindLegacyCertItems();

    /* Re-render when admin updates certificates */
    window.addEventListener('storage', e => {
      if (['portfolio-cert-tabs','portfolio-certificates','cl-media-registry'].includes(e.key)) {
        renderGallery();
        bindLegacyCertItems();
      }
    });
    try {
      new BroadcastChannel('portfolio-admin-sync').addEventListener('message', e => {
        if (e.data?.type === 'save') { renderGallery(); bindLegacyCertItems(); }
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Expose for external control */
  window.CertGallery = { open: _openModal, close: _closeModal, render: renderGallery };
  console.log('%c🖼 CertGallery loaded', 'color:#4f6ef5;font-family:monospace');

})();
