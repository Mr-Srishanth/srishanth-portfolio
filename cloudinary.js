/* ═══════════════════════════════════════════════════════════════════
   CLOUDINARY.JS — Single-source image system  v1.0
   ─────────────────────────────────────────────────────────────────
   HOW TO SET UP:
   1. Sign up free at cloudinary.com
   2. Copy your Cloud Name from the dashboard
   3. Go to Settings → Upload → Upload Presets → Add Unsigned Preset
   4. Paste both values below — that's it. No API secret needed.
   ═══════════════════════════════════════════════════════════════════ */

const Cloudinary = (function () {
  'use strict';

  /* ── CONFIG ────────────────────────────────────────────────────
     Replace these two values with your own.
     The admin panel also saves them to localStorage under
     'cl-admin-config' — that takes precedence over the defaults.
  ──────────────────────────────────────────────────────────────── */
  let CLOUD_NAME    = 'YOUR_CLOUD_NAME';
  let UPLOAD_PRESET = 'portfolio_upload';

  /* Read saved config from localStorage (set via admin panel) */
  (function loadSavedConfig() {
    try {
      const cfg = JSON.parse(localStorage.getItem('cl-admin-config') || '{}');
      if (cfg.cloudName)    CLOUD_NAME    = cfg.cloudName;
      if (cfg.uploadPreset) UPLOAD_PRESET = cfg.uploadPreset;
    } catch (e) {}
  })();

  /* ── CLOUDINARY BASE URL ───────────────────────────────────── */
  const CLOUDINARY_BASE = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/`;

  /* ── IMAGE REGISTRY ────────────────────────────────────────────
     Single source of truth for all portfolio images.
     Loaded from localStorage; falls back to empty arrays.
     Structure mirrors what the admin panel saves.
  ──────────────────────────────────────────────────────────────── */
  const images = (function loadRegistry() {
    try {
      const saved = JSON.parse(localStorage.getItem('cl-media-registry') || '{}');
      return {
        profile:      saved.profile      || '',
        certificates: saved.certificates || [],
        projects:     saved.projects     || [],
      };
    } catch (e) {
      return { profile: '', certificates: [], projects: [] };
    }
  })();

  /* ── FALLBACK PLACEHOLDER ──────────────────────────────────── */
  const FALLBACK = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'
    width='400' height='300'%3E%3Crect width='400' height='300' fill='%23111118'/%3E
    %3Ctext x='50%25' y='50%25' fill='%23333' text-anchor='middle'
    dominant-baseline='middle' font-family='monospace' font-size='12'%3Eno image%3C/text%3E
  %3C/svg%3E`;

  /* ── CORE URL BUILDER ──────────────────────────────────────────
     Transforms any Cloudinary public_id or full URL into an
     optimised delivery URL with f_auto, q_auto, and any transforms.

     getImage('portfolio/profile/me.jpg')
       → https://res.cloudinary.com/YOUR_CLOUD/image/upload/f_auto,q_auto/portfolio/profile/me.jpg

     getImage('portfolio/profile/me.jpg', { w: 420, h: 420, c: 'fill' })
       → ...f_auto,q_auto,w_420,h_420,c_fill/...
  ──────────────────────────────────────────────────────────────── */
  function getImage(path, opts = {}) {
    if (!path) return FALLBACK;

    /* If already a full Cloudinary URL, inject transforms */
    if (path.includes('cloudinary.com')) {
      return _injectTransforms(path, opts);
    }

    const transforms = _buildTransforms(opts);
    return `${CLOUDINARY_BASE}${transforms}${path}`;
  }

  function _buildTransforms(opts = {}) {
    const parts = ['f_auto', 'q_auto'];
    if (opts.w) parts.push(`w_${opts.w}`);
    if (opts.h) parts.push(`h_${opts.h}`);
    if ((opts.w || opts.h) && opts.c !== false) parts.push(`c_${opts.c || 'fill'}`);
    if (opts.g) parts.push(`g_${opts.g}`);
    if (opts.blur) parts.push(`e_blur:${opts.blur}`);
    return parts.join(',') + '/';
  }

  function _injectTransforms(url, opts = {}) {
    const idx = url.indexOf('/upload/');
    if (idx === -1) return url;
    const base = url.slice(0, idx + 8);
    const rest = url.slice(idx + 8);
    /* Strip any existing version segment (v1234567890/) */
    const withoutVersion = rest.replace(/^v\d+\//, '');
    return base + _buildTransforms(opts) + withoutVersion;
  }

  /* ── IMAGE LOADER ──────────────────────────────────────────────
     loadImage(element, url, opts?)

     Applies a blur-up placeholder, then loads the optimised image,
     then transitions to sharp with a smooth fade-in. Supports both
     <img> elements and elements with background-image.

     opts: {
       w, h, c, g   — Cloudinary transform params
       lazy         — boolean (default true)
       fallback     — URL string
       onLoad       — callback(url)
     }
  ──────────────────────────────────────────────────────────────── */
  let _observer = null;

  function loadImage(el, url, opts = {}) {
    if (!el) return;
    const { lazy = true, fallback = FALLBACK, onLoad } = opts;
    const optimisedUrl = getImage(url, opts);
    const isImg = el.tagName === 'IMG';

    /* Start in blurred state */
    _setBlurState(el, isImg);

    if (!lazy || _isNearViewport(el)) {
      _fetchAndReveal(el, optimisedUrl, isImg, fallback, onLoad);
    } else {
      el.dataset.lazySrc  = optimisedUrl;
      el.dataset.lazyFb   = fallback;
      _getObserver().observe(el);
    }
  }

  function _setBlurState(el, isImg) {
    el.style.cssText +=
      ';filter:blur(14px);opacity:0.5;transform:scale(1.05);' +
      'transition:filter .55s cubic-bezier(.22,1,.36,1),' +
      'opacity .5s ease,transform .55s cubic-bezier(.22,1,.36,1);' +
      'will-change:filter,opacity,transform';
  }

  function _fetchAndReveal(el, url, isImg, fallback, onLoad) {
    if (!url || url === FALLBACK) { _applyFallback(el, isImg, fallback); return; }

    const probe = new Image();
    probe.onload = () => {
      if (isImg) { el.src = url; }
      else        { el.style.backgroundImage = `url("${url}")`; }
      requestAnimationFrame(() => {
        el.style.filter    = 'blur(0)';
        el.style.opacity   = '1';
        el.style.transform = 'scale(1)';
        setTimeout(() => { el.style.willChange = 'auto'; }, 650);
      });
      if (onLoad) onLoad(url);
    };
    probe.onerror = () => _applyFallback(el, isImg, fallback);
    probe.src = url;
  }

  function _applyFallback(el, isImg, fallback) {
    const src = fallback || FALLBACK;
    if (isImg) el.src = src;
    else el.style.backgroundImage = `url("${src}")`;
    el.style.filter = 'blur(0)';
    el.style.opacity = '0.35';
    el.style.transform = 'scale(1)';
  }

  function _isNearViewport(el) {
    const rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight + 150;
  }

  function _getObserver() {
    if (!_observer) {
      _observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (!e.isIntersecting) return;
          const el  = e.target;
          const url = el.dataset.lazySrc;
          const fb  = el.dataset.lazyFb || FALLBACK;
          _fetchAndReveal(el, url, el.tagName === 'IMG', fb, null);
          _observer.unobserve(el);
        });
      }, { rootMargin: '120px 0px', threshold: 0.01 });
    }
    return _observer;
  }

  /* ── UPLOAD (unsigned) ─────────────────────────────────────────
     Returns Promise<{ secure_url, public_id, width, height }>
     Never exposes API_SECRET — uses unsigned upload presets only.
  ──────────────────────────────────────────────────────────────── */
  function upload(file, opts = {}) {
    const { folder = 'portfolio', maxMB = 5, onProgress } = opts;

    if (!file) return Promise.reject(new Error('No file provided'));
    if (file.size > maxMB * 1024 * 1024)
      return Promise.reject(new Error(`Max file size is ${maxMB}MB`));
    if (!file.type.startsWith('image/'))
      return Promise.reject(new Error('Only image files are supported'));

    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file',          file);
      fd.append('upload_preset', UPLOAD_PRESET);
      fd.append('folder',        folder);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
      if (onProgress) {
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        };
      }
      xhr.onload = () => {
        const data = JSON.parse(xhr.responseText);
        data.secure_url ? resolve(data) : reject(new Error(data.error?.message || 'Upload failed'));
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send(fd);
    });
  }

  /* ── PUBLIC API ────────────────────────────────────────────── */
  return { images, getImage, loadImage, upload, FALLBACK };

})();
