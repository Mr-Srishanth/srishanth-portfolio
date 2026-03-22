/* ═══════════════════════════════════════════════════════════════════════
   CLOUDINARY MEDIA SYSTEM  v1.0
   ─────────────────────────────────────────────────────────────────────
   Single source of truth for ALL image handling in the portfolio.
   No API secret. Unsigned uploads only. No local image storage.

   PUBLIC API:
     CloudinaryMedia.config(cloudName, uploadPreset)
     CloudinaryMedia.url(rawUrl, opts)          → optimised Cloudinary URL
     CloudinaryMedia.loadImage(el, url, opts)   → load + fade-in + fallback
     CloudinaryMedia.preload(url)               → hint browser for critical img
     CloudinaryMedia.upload(file)               → Promise<secure_url>
     CloudinaryMedia.openModal(urls, meta)      → fullscreen cert viewer
     CloudinaryMedia.store                      → localStorage media registry

   STORAGE SCHEMA (localStorage key: 'cl-media-registry')
   {
     profile: "https://res.cloudinary.com/...",
     certificates: [{ id, title, org, emoji, images:[], body }],
     projects:     [{ id, title, thumb }]
   }
   ═══════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────
     1. CONFIGURATION
  ───────────────────────────────────────────────────────────────── */
  let _cloudName    = '';
  let _uploadPreset = '';

  const REGISTRY_KEY = 'cl-media-registry';

  /* Fallback placeholder — neutral dark SVG, no external dependency */
  const PLACEHOLDER_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'
    width='400' height='300' viewBox='0 0 400 300'%3E
    %3Crect width='400' height='300' fill='%23111118'/%3E
    %3Crect x='160' y='110' width='80' height='60' rx='6' fill='none'
      stroke='%23333' stroke-width='2'/%3E
    %3Ccircle cx='178' cy='128' r='8' fill='%23333'/%3E
    %3Cpath d='M160 160 l40-30 20 20 20-15 40 25' fill='%231a1a2e' stroke='%23333' stroke-width='1.5'/%3E
  %3C/svg%3E`;

  /* ─────────────────────────────────────────────────────────────────
     2. STORE — localStorage registry
  ───────────────────────────────────────────────────────────────── */
  const store = {
    load() {
      try { return JSON.parse(localStorage.getItem(REGISTRY_KEY) || 'null') || { profile: '', certificates: [], projects: [] }; }
      catch { return { profile: '', certificates: [], projects: [] }; }
    },
    save(data) {
      try { localStorage.setItem(REGISTRY_KEY, JSON.stringify(data)); }
      catch (e) { console.warn('[CloudinaryMedia] Storage write failed:', e.message); }
    },
    get() { return this.load(); },
    set(key, value) {
      const d = this.load();
      d[key] = value;
      this.save(d);
      return d;
    },
    update(fn) {
      const d = this.load();
      fn(d);
      this.save(d);
      return d;
    }
  };

  /* ─────────────────────────────────────────────────────────────────
     3. URL BUILDER — transforms any image URL to an optimised
        Cloudinary delivery URL. Pass-through for non-Cloudinary URLs.
  ───────────────────────────────────────────────────────────────── */
  function buildUrl(rawUrl, opts = {}) {
    if (!rawUrl) return '';
    if (!rawUrl.includes('cloudinary.com')) return rawUrl; // pass-through

    const {
      width   = 0,     // 0 = no resize
      height  = 0,
      crop    = 'fill',
      quality = 'auto',
      format  = 'auto',
      gravity = 'auto',
      blur    = 0,     // blur amount for placeholder
      extra   = '',    // any additional transformations
    } = opts;

    /* Extract base: everything before /upload/ */
    const uploadIdx = rawUrl.indexOf('/upload/');
    if (uploadIdx === -1) return rawUrl;

    const base    = rawUrl.slice(0, uploadIdx + 8);  // includes "/upload/"
    const version = rawUrl.slice(uploadIdx + 8);

    const transforms = [];
    transforms.push(`f_${format}`);
    transforms.push(`q_${quality}`);
    if (width  > 0) transforms.push(`w_${width}`);
    if (height > 0) transforms.push(`h_${height}`);
    if ((width > 0 || height > 0) && crop) transforms.push(`c_${crop}`);
    if (gravity !== 'auto' && (width > 0 || height > 0)) transforms.push(`g_${gravity}`);
    if (blur   > 0) transforms.push(`e_blur:${blur}`);
    if (extra)      transforms.push(extra);

    return base + transforms.join(',') + '/' + version;
  }

  /* ─────────────────────────────────────────────────────────────────
     4. IMAGE LOADER — the core rendering primitive
        Applies blur → sharp transition with fade-in.
        Supports IntersectionObserver lazy loading.
  ───────────────────────────────────────────────────────────────── */
  /* Observer shared across all lazy images */
  let _lazyObserver = null;

  function getLazyObserver() {
    if (_lazyObserver) return _lazyObserver;
    _lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const url = el.dataset.clSrc;
        if (url) _doLoad(el, url, JSON.parse(el.dataset.clOpts || '{}'));
        _lazyObserver.unobserve(el);
      });
    }, { rootMargin: '100px 0px', threshold: 0.01 });
    return _lazyObserver;
  }

  function loadImage(el, rawUrl, opts = {}) {
    if (!el) return;
    const {
      lazy      = true,
      width     = 0,
      height    = 0,
      crop      = 'fill',
      quality   = 'auto',
      gravity   = 'auto',
      fallback  = PLACEHOLDER_SVG,
      onLoad    = null,
      onError   = null,
      blurUp    = true,   // show low-quality blur before full image
    } = opts;

    const optimisedUrl = buildUrl(rawUrl, { width, height, crop, quality, format: 'auto', gravity });
    const fallbackUrl  = fallback || PLACEHOLDER_SVG;

    /* Mark as will-change for compositor hint */
    el.style.willChange = 'opacity, filter';

    if (!lazy || el.getBoundingClientRect().top < window.innerHeight + 200) {
      /* In viewport (or not lazy) — load immediately */
      _doLoad(el, optimisedUrl, { blurUp, fallbackUrl, onLoad, onError, rawUrl, opts });
    } else {
      /* Lazy: defer until near viewport */
      el.dataset.clSrc  = optimisedUrl;
      el.dataset.clOpts = JSON.stringify({ blurUp, fallbackUrl, onLoad: null, onError: null, rawUrl, opts });
      /* Show blur placeholder immediately */
      if (blurUp && rawUrl && rawUrl.includes('cloudinary.com')) {
        const thumbUrl = buildUrl(rawUrl, { width: 20, height: 0, quality: 30, format: 'auto' });
        _applyBlurPlaceholder(el, thumbUrl);
      } else {
        _applyBlurPlaceholder(el, fallbackUrl);
      }
      getLazyObserver().observe(el);
    }
  }

  function _applyBlurPlaceholder(el, src) {
    const isImg = el.tagName === 'IMG';
    if (isImg) {
      el.src = src;
      el.style.filter  = 'blur(12px)';
      el.style.opacity = '0.6';
      el.style.transform = 'scale(1.04)';
      el.style.transition = 'filter 0.6s ease, opacity 0.5s ease, transform 0.6s ease';
    } else {
      el.style.backgroundImage = `url("${src}")`;
      el.style.backgroundSize  = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.filter  = 'blur(12px)';
      el.style.opacity = '0.6';
      el.style.transform = 'scale(1.04)';
      el.style.transition = 'filter 0.6s ease, opacity 0.5s ease, transform 0.6s ease';
    }
  }

  function _doLoad(el, optimisedUrl, { blurUp, fallbackUrl, onLoad, onError, rawUrl, opts } = {}) {
    if (!optimisedUrl) {
      _applyFallback(el, fallbackUrl);
      return;
    }

    const img = new Image();

    img.onload = () => {
      const isImgEl = el.tagName === 'IMG';
      if (isImgEl) {
        el.src = optimisedUrl;
      } else {
        el.style.backgroundImage = `url("${optimisedUrl}")`;
        el.style.backgroundSize  = 'cover';
        el.style.backgroundPosition = 'center';
      }
      /* Transition to sharp */
      requestAnimationFrame(() => {
        el.style.filter    = 'blur(0)';
        el.style.opacity   = '1';
        el.style.transform = 'scale(1)';
        setTimeout(() => { el.style.willChange = 'auto'; }, 700);
      });
      if (onLoad) onLoad(optimisedUrl, el);
    };

    img.onerror = () => {
      console.warn('[CloudinaryMedia] Failed to load:', optimisedUrl);
      _applyFallback(el, fallbackUrl);
      if (onError) onError(optimisedUrl, el);
    };

    img.src = optimisedUrl;
  }

  function _applyFallback(el, fallbackUrl) {
    const isImg = el.tagName === 'IMG';
    const src   = fallbackUrl || PLACEHOLDER_SVG;
    if (isImg) {
      el.src = src;
    } else {
      el.style.backgroundImage = `url("${src}")`;
    }
    el.style.filter    = 'blur(0)';
    el.style.opacity   = '0.4';
    el.style.transform = 'scale(1)';
  }

  /* ─────────────────────────────────────────────────────────────────
     5. PRELOAD — hint browser to fetch critical images early
  ───────────────────────────────────────────────────────────────── */
  function preload(rawUrl, opts = {}) {
    if (!rawUrl) return;
    const url = buildUrl(rawUrl, { format: 'auto', quality: 'auto', ...opts });
    const link = document.createElement('link');
    link.rel  = 'preload';
    link.as   = 'image';
    link.href = url;
    document.head.appendChild(link);
  }

  /* ─────────────────────────────────────────────────────────────────
     6. UPLOAD — unsigned upload to Cloudinary
        Returns Promise<{ secure_url, public_id, width, height }>
  ───────────────────────────────────────────────────────────────── */
  async function upload(file, opts = {}) {
    if (!_cloudName || !_uploadPreset) {
      throw new Error('[CloudinaryMedia] Not configured. Call CloudinaryMedia.config(cloudName, preset) first.');
    }

    const {
      folder     = 'portfolio',
      maxSizeMB  = 5,
      allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      onProgress = null,
    } = opts;

    /* Validation */
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File type not allowed: ${file.type}. Use: ${allowedTypes.join(', ')}`);
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Max: ${maxSizeMB}MB`);
    }

    const fd = new FormData();
    fd.append('file',           file);
    fd.append('upload_preset',  _uploadPreset);
    fd.append('folder',         folder);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${_cloudName}/image/upload`);

      if (onProgress) {
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }

      xhr.onload = () => {
        const data = JSON.parse(xhr.responseText);
        if (data.secure_url) {
          resolve(data);
        } else {
          reject(new Error(data.error?.message || 'Upload failed'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(fd);
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     7. FULLSCREEN MODAL — certificate / image viewer
        Opens a cinematic dark-backdrop modal with carousel.
  ───────────────────────────────────────────────────────────────── */
  let _modalEl    = null;
  let _modalIdx   = 0;
  let _modalUrls  = [];

  function _buildModal() {
    if (document.getElementById('cl-img-modal')) return;

    const m = document.createElement('div');
    m.id = 'cl-img-modal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-label', 'Image viewer');
    m.innerHTML = `
      <div id="cl-modal-backdrop"></div>
      <div id="cl-modal-inner">
        <button id="cl-modal-close" aria-label="Close">✕</button>
        <button id="cl-modal-prev"  aria-label="Previous">&#8592;</button>
        <button id="cl-modal-next"  aria-label="Next">&#8594;</button>
        <div id="cl-modal-img-wrap">
          <img id="cl-modal-img" src="" alt="Certificate" draggable="false"/>
          <div id="cl-modal-spinner"></div>
        </div>
        <div id="cl-modal-meta">
          <span id="cl-modal-emoji"></span>
          <div id="cl-modal-text">
            <div id="cl-modal-title"></div>
            <div id="cl-modal-org"></div>
          </div>
          <span id="cl-modal-counter"></span>
        </div>
        <div id="cl-modal-dots"></div>
      </div>`;
    document.body.appendChild(m);
    _modalEl = m;

    /* Close handlers */
    document.getElementById('cl-modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('cl-modal-close').addEventListener('click', closeModal);
    document.getElementById('cl-modal-prev').addEventListener('click', () => _modalNav(-1));
    document.getElementById('cl-modal-next').addEventListener('click', () => _modalNav(+1));

    /* Keyboard */
    document.addEventListener('keydown', e => {
      if (!_modalEl || !_modalEl.classList.contains('cl-modal-open')) return;
      if (e.key === 'Escape')      closeModal();
      if (e.key === 'ArrowLeft')   _modalNav(-1);
      if (e.key === 'ArrowRight')  _modalNav(+1);
    });

    /* Touch swipe */
    let touchStartX = 0;
    m.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    m.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) _modalNav(dx < 0 ? 1 : -1);
    });
  }

  function openModal(urls, meta = {}) {
    _buildModal();
    _modalUrls = Array.isArray(urls) ? urls.filter(Boolean) : [urls].filter(Boolean);
    _modalIdx  = 0;

    const { emoji = '🏆', title = '', org = '' } = meta;
    document.getElementById('cl-modal-emoji').textContent = emoji;
    document.getElementById('cl-modal-title').textContent = title;
    document.getElementById('cl-modal-org').textContent   = org;

    _renderModalSlide();
    _renderModalDots();

    _modalEl.classList.add('cl-modal-open');
    document.body.style.overflow = 'hidden';

    /* Animate in */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        _modalEl.classList.add('cl-modal-visible');
      });
    });
  }

  function closeModal() {
    if (!_modalEl) return;
    _modalEl.classList.remove('cl-modal-visible');
    setTimeout(() => {
      _modalEl.classList.remove('cl-modal-open');
      document.body.style.overflow = '';
    }, 350);
  }

  function _modalNav(dir) {
    const next = _modalIdx + dir;
    if (next < 0 || next >= _modalUrls.length) return;
    _modalIdx = next;
    _renderModalSlide();
    _renderModalDots();
  }

  function _renderModalSlide() {
    const imgEl    = document.getElementById('cl-modal-img');
    const spinner  = document.getElementById('cl-modal-spinner');
    const counter  = document.getElementById('cl-modal-counter');
    const prev     = document.getElementById('cl-modal-prev');
    const next     = document.getElementById('cl-modal-next');

    const url = _modalUrls[_modalIdx];
    const optimised = buildUrl(url, { width: 1400, height: 0, quality: 'auto', format: 'auto', crop: 'limit' });

    /* Show spinner, hide img */
    imgEl.style.opacity = '0';
    imgEl.style.transform = 'scale(0.96)';
    if (spinner) spinner.style.display = 'block';

    const tmp = new Image();
    tmp.onload = () => {
      imgEl.src = optimised;
      if (spinner) spinner.style.display = 'none';
      requestAnimationFrame(() => {
        imgEl.style.opacity   = '1';
        imgEl.style.transform = 'scale(1)';
      });
    };
    tmp.onerror = () => {
      imgEl.src = PLACEHOLDER_SVG;
      if (spinner) spinner.style.display = 'none';
      imgEl.style.opacity = '0.4';
    };
    tmp.src = optimised;

    /* Navigation buttons */
    if (prev) prev.classList.toggle('cl-hidden', _modalIdx === 0);
    if (next) next.classList.toggle('cl-hidden', _modalIdx >= _modalUrls.length - 1);

    /* Counter */
    if (counter && _modalUrls.length > 1) {
      counter.textContent = `${_modalIdx + 1} / ${_modalUrls.length}`;
      counter.style.display = '';
    } else if (counter) {
      counter.style.display = 'none';
    }
  }

  function _renderModalDots() {
    const dotsEl = document.getElementById('cl-modal-dots');
    if (!dotsEl || _modalUrls.length <= 1) { if (dotsEl) dotsEl.innerHTML = ''; return; }
    dotsEl.innerHTML = _modalUrls.map((_, i) =>
      `<span class="cl-dot ${i === _modalIdx ? 'cl-dot-active' : ''}"
             data-i="${i}"></span>`
    ).join('');
    dotsEl.querySelectorAll('.cl-dot').forEach(d => {
      d.addEventListener('click', () => { _modalIdx = +d.dataset.i; _renderModalSlide(); _renderModalDots(); });
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     8. PROFILE IMAGE — loads and applies to #himg
  ───────────────────────────────────────────────────────────────── */
  function applyProfileImage() {
    const imgEl = document.getElementById('himg');
    if (!imgEl) return;

    const reg = store.get();
    const url = reg.profile || '';

    /* Preload for LCP performance */
    if (url) preload(url, { width: 420, height: 420, crop: 'fill', gravity: 'face' });

    loadImage(imgEl, url, {
      lazy:    false,
      width:   420,
      height:  420,
      crop:    'fill',
      gravity: 'face',
      blurUp:  false,
      fallback: PLACEHOLDER_SVG,
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     9. PROJECT THUMBNAILS — renders project cards with image thumbs
  ───────────────────────────────────────────────────────────────── */
  function renderProjectCards(projects, gridEl) {
    if (!gridEl || !projects) return;
    const reg = store.get();

    gridEl.innerHTML = projects.map((p, i) => {
      const thumb = p.thumb || (reg.projects.find(r => r.id === p.id) || {}).thumb || '';
      const hasThumb = !!thumb;

      return `<div class="pj cl-pj-card reveal reveal-child" style="transition-delay:${i * 0.06}s" data-pj-id="${p.id || i}">
        ${hasThumb
          ? `<div class="pj-thumb-wrap">
               <img class="pj-thumb cl-img" data-cl-src="${thumb}"
                    data-cl-w="640" data-cl-h="360"
                    alt="${p.title}" loading="lazy" src="${PLACEHOLDER_SVG}"
                    style="width:100%;height:100%;object-fit:cover;filter:blur(10px);opacity:.6;
                           transform:scale(1.04);transition:filter .5s ease,opacity .5s ease,transform .5s ease"/>
             </div>`
          : `<div class="pj-top"><span class="pj-ic">${p.ico || '📁'}</span></div>`
        }
        <div class="pj-title">${_esc(p.title)}</div>
        <div class="pj-desc">${_esc(p.desc)}</div>
        <div class="pj-tags">${(p.tags || []).map(t => `<span class="ptag">${_esc(t)}</span>`).join('')}</div>
        <div class="pj-actions">
          <a href="${_esc(p.github || '#')}" target="_blank" class="pj-btn-gh">⎇ GitHub</a>
          <a href="${_esc(p.live   || '#')}" target="_blank" class="pj-btn-live">↗ Live</a>
        </div>
      </div>`;
    }).join('');

    /* Lazy-load all thumb images via IntersectionObserver */
    gridEl.querySelectorAll('.cl-img[data-cl-src]').forEach(img => {
      const url = img.dataset.clSrc;
      if (!url) return;
      const w = +img.dataset.clW || 640;
      const h = +img.dataset.clH || 360;
      loadImage(img, url, { lazy: true, width: w, height: h, crop: 'fill', blurUp: true });
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     10. CERTIFICATE RENDERER — builds cert cards with Cloudinary images
  ───────────────────────────────────────────────────────────────── */
  function renderCertCards(certs, containerEl) {
    if (!containerEl) return;

    if (!certs || !certs.length) {
      containerEl.innerHTML = '<p class="cert-empty-msg">No certificates yet.</p>';
      return;
    }

    containerEl.innerHTML = certs.map((c, i) => {
      const imgs   = Array.isArray(c.images) ? c.images : (c.image ? [c.image] : []);
      const thumb  = imgs[0] || '';
      const hasImg = !!thumb;

      return `<div class="cert-item cl-cert-item" role="button" tabindex="0"
                   data-cert-id="${c.id || i}"
                   data-cert-title="${_esc(c.title || '')}"
                   data-cert-org="${_esc(c.org || '')}"
                   data-cert-emoji="${_esc(c.emoji || '🏆')}"
                   data-cert-body="${_esc(c.body || '')}"
                   data-cert-images="${_esc(JSON.stringify(imgs))}">
        <div class="cert-circle ${hasImg ? 'cert-circle-img' : 'cert-circle-emoji'}">
          ${hasImg
            ? `<img class="cert-thumb cl-img" data-cl-src="${thumb}"
                    alt="${_esc(c.title)}" loading="lazy" src="${PLACEHOLDER_SVG}"
                    style="width:100%;height:100%;object-fit:cover;border-radius:50%;
                           filter:blur(8px);opacity:.6;transform:scale(1.04);
                           transition:filter .5s ease,opacity .5s ease,transform .5s ease"/>`
            : `<span class="cert-emoji">${c.emoji || '🏆'}</span>`
          }
        </div>
        <span class="cert-label">${_esc(c.title || 'Certificate')}</span>
      </div>`;
    }).join('');

    /* Lazy-load thumb images */
    containerEl.querySelectorAll('.cl-img[data-cl-src]').forEach(img => {
      loadImage(img, img.dataset.clSrc, { lazy: true, width: 160, height: 160, crop: 'fill', gravity: 'auto', blurUp: true });
    });

    /* Click handler → open modal */
    containerEl.querySelectorAll('.cl-cert-item').forEach(item => {
      const open = () => {
        const imgs  = JSON.parse(item.dataset.certImages || '[]');
        const meta  = {
          emoji: item.dataset.certEmoji,
          title: item.dataset.certTitle,
          org:   item.dataset.certOrg,
        };
        if (imgs.length) {
          openModal(imgs, meta);
        } else {
          /* Fallback: show text modal */
          _openTextModal(meta, item.dataset.certBody || '');
        }
      };
      item.addEventListener('click', open);
      item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  function _openTextModal(meta, body) {
    /* Reuse the cert-modal that already exists in the HTML for text certs */
    const modal    = document.getElementById('cert-modal');
    const textView = document.getElementById('cert-modal-text-view');
    const imgView  = document.getElementById('cert-modal-img-view');
    if (!modal) return;

    if (textView) textView.style.display = 'flex';
    if (imgView)  imgView.style.display  = 'none';

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('cert-modal-emoji-text', meta.emoji || '🏆');
    set('cert-modal-title-text', meta.title || '');
    set('cert-modal-org-text',   meta.org   || '');
    set('cert-modal-body-text',  body       || '');

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    const closeText = () => { modal.classList.remove('open'); document.body.style.overflow = ''; };
    modal.addEventListener('click', e => { if (e.target === modal) closeText(); }, { once: true });
    document.getElementById('cert-close-btn')?.addEventListener('click', closeText, { once: true });
  }

  /* ─────────────────────────────────────────────────────────────────
     11. UPLOAD WIDGET — drag-and-drop upload UI builder
         Call attachUploadWidget(containerEl, opts) to turn any element
         into a Cloudinary upload zone.
  ───────────────────────────────────────────────────────────────── */
  function attachUploadWidget(containerEl, opts = {}) {
    if (!containerEl) return;
    const {
      accept       = 'image/jpeg,image/png,image/webp',
      multiple     = false,
      folder       = 'portfolio',
      onSuccess    = null,   // (result: {secure_url, public_id}) => void
      onError      = null,
      onProgress   = null,
      label        = 'Drop image or click to upload',
      sublabel     = 'JPG, PNG, WEBP · Max 5MB',
    } = opts;

    containerEl.classList.add('cl-upload-zone');
    containerEl.innerHTML = `
      <input type="file" class="cl-upload-input" accept="${accept}" ${multiple ? 'multiple' : ''} style="display:none"/>
      <div class="cl-upload-icon">☁</div>
      <div class="cl-upload-label">${label}</div>
      <div class="cl-upload-sublabel">${sublabel}</div>
      <div class="cl-upload-progress-wrap" style="display:none">
        <div class="cl-upload-progress-bar"></div>
        <span class="cl-upload-pct">0%</span>
      </div>
      <div class="cl-upload-err"></div>`;

    const input    = containerEl.querySelector('.cl-upload-input');
    const errEl    = containerEl.querySelector('.cl-upload-err');
    const progWrap = containerEl.querySelector('.cl-upload-progress-wrap');
    const progBar  = containerEl.querySelector('.cl-upload-progress-bar');
    const progPct  = containerEl.querySelector('.cl-upload-pct');

    function showErr(msg) {
      errEl.textContent = msg;
      setTimeout(() => { errEl.textContent = ''; }, 5000);
    }

    function setProgress(pct) {
      progWrap.style.display = pct > 0 && pct < 100 ? 'flex' : 'none';
      progBar.style.width    = pct + '%';
      if (progPct) progPct.textContent = pct + '%';
    }

    async function processFiles(files) {
      const arr = Array.from(files);
      for (const file of arr) {
        containerEl.classList.add('cl-uploading');
        setProgress(1);
        try {
          const result = await upload(file, {
            folder,
            onProgress: pct => { setProgress(pct); if (onProgress) onProgress(pct); }
          });
          setProgress(100);
          setTimeout(() => { setProgress(0); containerEl.classList.remove('cl-uploading'); }, 800);
          if (onSuccess) onSuccess(result);
        } catch (err) {
          setProgress(0);
          containerEl.classList.remove('cl-uploading');
          showErr(err.message);
          if (onError) onError(err);
        }
      }
    }

    /* Click to open file picker */
    containerEl.addEventListener('click', e => {
      if (!e.target.closest('.cl-upload-input')) input.click();
    });
    input.addEventListener('change', e => processFiles(e.target.files));

    /* Drag and drop */
    containerEl.addEventListener('dragenter', e => { e.preventDefault(); containerEl.classList.add('cl-drag-over'); });
    containerEl.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); containerEl.classList.add('cl-drag-over'); });
    containerEl.addEventListener('dragleave', e => {
      if (!containerEl.contains(e.relatedTarget)) containerEl.classList.remove('cl-drag-over');
    });
    containerEl.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      containerEl.classList.remove('cl-drag-over');
      processFiles(e.dataTransfer.files);
    });
  }

  /* ─────────────────────────────────────────────────────────────────
     UTILITIES
  ───────────────────────────────────────────────────────────────── */
  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ─────────────────────────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────────────────────────── */
  const CloudinaryMedia = {
    config(cloudName, uploadPreset) {
      _cloudName    = cloudName;
      _uploadPreset = uploadPreset;
      console.log(`%c☁ CloudinaryMedia configured: ${cloudName}`, 'color:#4f6ef5;font-family:monospace');
      return this;
    },

    url:                buildUrl,
    loadImage:          loadImage,
    preload:            preload,
    upload:             upload,
    openModal:          openModal,
    closeModal:         closeModal,
    renderProjectCards: renderProjectCards,
    renderCertCards:    renderCertCards,
    attachUploadWidget: attachUploadWidget,
    applyProfileImage:  applyProfileImage,
    store:              store,

    /* One-shot init: configure + apply profile image on DOMContentLoaded */
    init(cloudName, uploadPreset) {
      this.config(cloudName, uploadPreset);
      const run = () => this.applyProfileImage();
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
      } else {
        run();
      }
      return this;
    }
  };

  global.CloudinaryMedia = CloudinaryMedia;

})(window);
