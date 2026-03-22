/* ═══════════════════════════════════════════════════════════════════
   ADMIN-CONTROLLER.JS — Cloudinary Media Admin  v1.0
   ─────────────────────────────────────────────────────────────────
   Extends the admin panel with full Cloudinary media management:
     • Cloudinary cloud name / upload preset config panel
     • Profile image upload with live preview
     • Project thumbnail upload per project
     • Certificate image upload + management
   ─────────────────────────────────────────────────────────────────
   Depends on: CloudinaryMedia (cloudinary-media.js)
   ═══════════════════════════════════════════════════════════════════ */

(function AdminCloudinaryController() {
  'use strict';

  /* ── Bail if CloudinaryMedia isn't loaded ── */
  if (typeof CloudinaryMedia === 'undefined') {
    console.error('[AdminController] CloudinaryMedia not found. Load cloudinary-media.js first.');
    return;
  }

  const CM = CloudinaryMedia;

  /* ─────────────────────────────────────────────────────────────
     CONFIG STORAGE
  ───────────────────────────────────────────────────────────────  */
  const CFG_KEY = 'cl-admin-config';

  function loadConfig() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveConfig(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  function applyConfig() {
    const cfg = loadConfig();
    if (cfg.cloudName && cfg.uploadPreset) {
      CM.config(cfg.cloudName, cfg.uploadPreset);
    }
  }

  /* ─────────────────────────────────────────────────────────────
     INJECT CLOUDINARY CONFIG PANEL INTO ADMIN
     Adds a "☁ Cloudinary" section inside the admin panel.
  ───────────────────────────────────────────────────────────────  */
  function injectConfigPanel() {
    /* Find the admin hero panel or any likely mount point */
    const heroPanel = document.querySelector('#adm-panel-hero, .adm-panel[data-panel="hero"], [id*="adm-panel"]');
    if (!heroPanel) return;

    /* Don't double-inject */
    if (document.getElementById('cl-admin-config-panel')) return;

    const cfg = loadConfig();

    const panel = document.createElement('div');
    panel.id = 'cl-admin-config-panel';
    panel.className = 'cl-config-panel';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
        <span style="font-size:1.1rem">☁</span>
        <span style="font-family:'Space Mono',monospace;font-size:.65rem;letter-spacing:2px;
                     text-transform:uppercase;color:var(--acc,#4f6ef5)">Cloudinary Config</span>
        <span id="cl-cfg-status-badge" style="margin-left:auto;font-size:.5rem;
              font-family:'Space Mono',monospace;padding:3px 8px;border-radius:20px;
              background:rgba(74,222,128,.1);color:#4ade80;letter-spacing:1px;
              display:${cfg.cloudName ? 'block' : 'none'}">✓ CONNECTED</span>
      </div>
      <div class="cl-cfg-row">
        <label>Cloud Name</label>
        <input id="cl-cfg-cloud-name" type="text" placeholder="e.g. dxyz1234abc"
               value="${_esc(cfg.cloudName || '')}" autocomplete="off" spellcheck="false"/>
      </div>
      <div class="cl-cfg-row">
        <label>Upload Preset <span style="opacity:.4;font-size:.85em">(unsigned)</span></label>
        <input id="cl-cfg-upload-preset" type="text" placeholder="e.g. portfolio_upload"
               value="${_esc(cfg.uploadPreset || '')}" autocomplete="off" spellcheck="false"/>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="cl-config-save-btn" id="cl-cfg-save-btn">Save & Connect</button>
        <a href="https://cloudinary.com/console" target="_blank"
           style="font-size:.56rem;font-family:'Space Mono',monospace;color:rgba(255,255,255,.3);
                  letter-spacing:1px;text-decoration:none">
          ↗ Open Cloudinary Console
        </a>
      </div>
      <div class="cl-config-status" id="cl-cfg-status"></div>
      <details style="margin-top:14px">
        <summary style="font-family:'Space Mono',monospace;font-size:.56rem;
                        color:rgba(255,255,255,.25);cursor:pointer;letter-spacing:1px;
                        text-transform:uppercase">Setup Guide</summary>
        <div style="font-size:.6rem;color:rgba(255,255,255,.3);line-height:1.7;
                    margin-top:8px;font-family:'Rajdhani',sans-serif">
          1. Sign up free at <strong style="color:rgba(255,255,255,.5)">cloudinary.com</strong><br>
          2. Copy your <strong style="color:rgba(255,255,255,.5)">Cloud Name</strong> from the dashboard<br>
          3. Go to Settings → Upload → Upload Presets<br>
          4. Click <strong style="color:rgba(255,255,255,.5)">Add Upload Preset</strong> → set to <strong style="color:rgba(255,255,255,.5)">Unsigned</strong><br>
          5. Copy the preset name and paste above<br>
          6. <strong style="color:#4ade80">Never share your API Secret</strong> — only cloud name + preset needed
        </div>
      </details>`;

    /* Insert at the top of the hero panel */
    heroPanel.insertBefore(panel, heroPanel.firstChild);

    /* Save button */
    document.getElementById('cl-cfg-save-btn').addEventListener('click', () => {
      const cloudName    = document.getElementById('cl-cfg-cloud-name').value.trim();
      const uploadPreset = document.getElementById('cl-cfg-upload-preset').value.trim();
      const statusEl     = document.getElementById('cl-cfg-status');
      const badgeEl      = document.getElementById('cl-cfg-status-badge');

      if (!cloudName || !uploadPreset) {
        statusEl.style.color = '#f87171';
        statusEl.textContent = '✗ Both fields required';
        setTimeout(() => { statusEl.textContent = ''; }, 3000);
        return;
      }

      saveConfig({ cloudName, uploadPreset });
      CM.config(cloudName, uploadPreset);

      statusEl.style.color = '#4ade80';
      statusEl.textContent = '✓ Saved & connected';
      if (badgeEl) badgeEl.style.display = 'block';
      setTimeout(() => { statusEl.textContent = ''; }, 3000);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     PROFILE IMAGE UPLOAD ZONE
     Replaces/augments the existing profile drop zone with CM.
  ───────────────────────────────────────────────────────────────  */
  function initProfileUpload() {
    /* Look for an existing profile drop zone or create one */
    let zone = document.getElementById('adm-profile-drop-zone');
    if (!zone) return; /* admin panel not open / not found */

    /* Add a CM-powered upload zone below the existing UI */
    if (zone.dataset.clBound) return;
    zone.dataset.clBound = '1';

    const cmZone = document.createElement('div');
    cmZone.id = 'cl-profile-upload-zone';
    cmZone.style.marginTop = '12px';
    zone.parentNode.insertBefore(cmZone, zone.nextSibling);

    CM.attachUploadWidget(cmZone, {
      folder:   'portfolio/profile',
      label:    '☁ Upload to Cloudinary',
      sublabel: 'JPG · PNG · WEBP · Max 5MB',
      onSuccess(result) {
        const reg = CM.store.update(d => { d.profile = result.secure_url; return d; });
        CM.applyProfileImage();

        /* Sync with existing admin.js profile storage */
        try { localStorage.setItem('portfolio-profile-image', result.secure_url); } catch (e) {}

        /* Update the hero img URL field if it exists */
        const urlInput = document.getElementById('adm-hero-img');
        if (urlInput) urlInput.value = result.secure_url;

        _toast('Profile image uploaded ✓');
        console.log('[AdminController] Profile saved:', result.secure_url);
      },
      onError(err) { _toast(err.message, 'error'); }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     PROJECT THUMBNAIL UPLOAD
     Adds per-project thumbnail upload to the admin projects list.
  ───────────────────────────────────────────────────────────────  */
  function bindProjectThumbnails() {
    /* Observe the admin projects panel for rendered project rows */
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.adm-pj-row, [data-pj-id]').forEach(row => {
        if (row.dataset.clThumbBound) return;
        row.dataset.clThumbBound = '1';

        const pjId = row.dataset.pjId || row.dataset.admPjId;
        if (!pjId) return;

        const thumbZone = document.createElement('div');
        thumbZone.className = 'cl-pj-thumb-upload';
        thumbZone.style.cssText = 'margin-top:8px;';
        row.appendChild(thumbZone);

        CM.attachUploadWidget(thumbZone, {
          folder:  'portfolio/projects',
          label:   '☁ Upload thumbnail',
          sublabel:'16:9 recommended · Max 5MB',
          onSuccess(result) {
            CM.store.update(d => {
              const proj = d.projects.find(p => p.id === pjId);
              if (proj) { proj.thumb = result.secure_url; }
              else { d.projects.push({ id: pjId, thumb: result.secure_url }); }
            });
            _toast('Thumbnail saved ✓');
            _reRenderProjects();
          },
          onError(err) { _toast(err.message, 'error'); }
        });
      });
    });

    const target = document.querySelector('.adm-projects-list, [id*="project"]');
    if (target) observer.observe(target, { childList: true, subtree: true });
  }

  /* ─────────────────────────────────────────────────────────────
     CERTIFICATE IMAGE UPLOAD
     Replaces the existing cert-upload-zone with a CM-powered one.
  ───────────────────────────────────────────────────────────────  */
  function initCertUpload() {
    const existingZone = document.getElementById('cert-upload-zone');
    if (!existingZone || existingZone.dataset.clBound) return;
    existingZone.dataset.clBound = '1';

    /* Replace inner HTML with our upload widget */
    existingZone.innerHTML = '';
    existingZone.className = ''; /* remove old class, let CM add its own */

    CM.attachUploadWidget(existingZone, {
      folder:   'portfolio/certificates',
      multiple: true,
      label:    '☁ Upload certificate image(s)',
      sublabel: 'Multiple files supported · JPG · PNG · WEBP · Max 5MB each',
      onSuccess(result) {
        /* Read the currently active cert tab to add the image to */
        const activeTab = _getActiveCertTab();
        if (activeTab !== null) {
          const certData = _loadCertData();
          const tab  = certData[activeTab];
          if (tab) {
            if (!tab.images) tab.images = [];
            if (!tab.images.includes(result.secure_url)) {
              tab.images.push(result.secure_url);
            }
            /* Also keep legacy .image field as first image */
            tab.image = tab.images[0];
            _saveCertData(certData);
            _rerenderCerts();
          }
        }
        _toast('Certificate image uploaded ✓');
      },
      onError(err) { _toast(err.message, 'error'); }
    });
  }

  /* ─────────────────────────────────────────────────────────────
     CERT DATA HELPERS — bridge to existing admin system
  ───────────────────────────────────────────────────────────────  */
  function _getActiveCertTab() {
    const active = document.querySelector('.cert-tab-btn.active, [data-cert-tab].active');
    return active ? (active.dataset.tabIdx || active.dataset.certTab || 0) : 0;
  }

  function _loadCertData() {
    try {
      return JSON.parse(localStorage.getItem('portfolio-cert-tabs') || '[]');
    } catch { return []; }
  }

  function _saveCertData(data) {
    localStorage.setItem('portfolio-cert-tabs', JSON.stringify(data));
    /* Notify portfolio page */
    try {
      const bc = new BroadcastChannel('portfolio-admin-sync');
      bc.postMessage({ type: 'save' });
      bc.close();
    } catch (e) {}
  }

  function _rerenderCerts() {
    /* Trigger the existing cert renderer if available */
    if (typeof window.renderCertSection === 'function') {
      window.renderCertSection();
    }
    /* Also re-render the portfolio cert grid via CloudinaryMedia */
    const certGrid = document.getElementById('cert-grid-row');
    if (certGrid) {
      const allCerts = _getAllCertsFlat();
      CM.renderCertCards(allCerts, certGrid);
    }
  }

  function _getAllCertsFlat() {
    const tabs = _loadCertData();
    if (!tabs || !tabs.length) {
      try {
        return JSON.parse(localStorage.getItem('portfolio-certificates') || '[]');
      } catch { return []; }
    }
    return tabs.flatMap(t => t.certs || []);
  }

  function _reRenderProjects() {
    const grid = document.querySelector('.projects-grid');
    if (!grid) return;
    const raw = localStorage.getItem('adm-portfolio-data');
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      if (d.projects) CM.renderProjectCards(d.projects, grid);
    } catch (e) {}
  }

  /* ─────────────────────────────────────────────────────────────
     PORTFOLIO PAGE INTEGRATION
     Hooks into the portfolio page (not admin) to render all
     Cloudinary images on every page load.
  ───────────────────────────────────────────────────────────────  */
  function initPortfolioPage() {
    /* Not in admin context */
    if (document.querySelector('[id*="adm-panel"]')) return;

    /* Profile image */
    CM.applyProfileImage();

    /* Projects */
    _reRenderProjects();

    /* Certificates */
    const certGrid = document.getElementById('cert-grid-row');
    if (certGrid) {
      const certs = _getAllCertsFlat();
      if (certs && certs.length) {
        CM.renderCertCards(certs, certGrid);
      }
    }

    /* Re-bind cert modal for any statically-rendered certs (non-CM) */
    _bindStaticCertClicks();

    /* Listen for admin updates */
    window.addEventListener('storage', e => {
      if (e.key === 'portfolio-cert-tabs' || e.key === 'portfolio-certificates') _rerenderCerts();
      if (e.key === 'adm-portfolio-data')  _reRenderProjects();
      if (e.key === 'portfolio-profile-image' || e.key === 'cl-media-registry') CM.applyProfileImage();
    });

    try {
      const bc = new BroadcastChannel('portfolio-admin-sync');
      bc.addEventListener('message', e => {
        if (e.data?.type === 'save' || e.data?.type === 'dyn-sections-updated') {
          _reRenderProjects();
          _rerenderCerts();
          CM.applyProfileImage();
        }
      });
    } catch (e) {}
  }

  /* Bind click-to-modal on statically rendered cert items (HTML-only, no CM data) */
  function _bindStaticCertClicks() {
    document.querySelectorAll('.cert-item:not(.cl-cert-item)').forEach(item => {
      if (item.dataset.clModalBound) return;
      item.dataset.clModalBound = '1';

      item.addEventListener('click', () => {
        const imgs  = JSON.parse(item.dataset.certImages || item.dataset.certImg && `["${item.dataset.certImg}"]` || '[]');
        const meta  = {
          emoji: item.dataset.certEmoji || '🏆',
          title: item.dataset.certTitle || '',
          org:   item.dataset.certOrg   || '',
        };
        if (imgs.length) {
          CM.openModal(imgs, meta);
        }
        /* If no images, let the existing cert modal handle it */
      });
    });
  }

  /* ─────────────────────────────────────────────────────────────
     TOAST
  ───────────────────────────────────────────────────────────────  */
  function _toast(msg, type = 'success') {
    /* Reuse the admin panel's toast if it exists */
    if (typeof window.adminToast === 'function') { window.adminToast(msg); return; }
    if (typeof window.toast === 'function') { window.toast(msg); return; }

    /* Fallback: own toast */
    const existing = document.getElementById('cl-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'cl-toast';
    el.textContent = msg;
    el.style.cssText = `
      position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(0);
      background:${type === 'error' ? '#7f1d1d' : 'rgba(10,10,20,.95)'};
      border:1px solid ${type === 'error' ? '#f87171' : 'rgba(79,110,245,.4)'};
      color:#fff;padding:10px 20px;border-radius:8px;font-family:'Space Mono',monospace;
      font-size:.62rem;letter-spacing:1px;z-index:9999999;
      box-shadow:0 8px 32px rgba(0,0,0,.5);transition:opacity .3s ease;`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2800);
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ─────────────────────────────────────────────────────────────
     BOOT
  ───────────────────────────────────────────────────────────────  */
  function boot() {
    /* Always apply saved config first */
    applyConfig();

    const isAdminPage = !!document.querySelector('[id*="adm-panel"], .adm-sidebar, #adm-login');

    if (isAdminPage) {
      /* Admin panel — watch for panel opens to inject UI */
      const observer = new MutationObserver(() => {
        injectConfigPanel();
        initProfileUpload();
        initCertUpload();
        bindProjectThumbnails();
      });
      observer.observe(document.body, { childList: true, subtree: true });

      /* Run immediately too */
      injectConfigPanel();
      initProfileUpload();
      initCertUpload();
      bindProjectThumbnails();
    } else {
      /* Portfolio page */
      initPortfolioPage();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* Expose for debugging */
  window.AdminCloudinaryController = {
    reRenderProjects: _reRenderProjects,
    rerenderCerts:    _rerenderCerts,
    applyConfig:      applyConfig,
    loadConfig:       loadConfig,
  };

  console.log('%c☁ AdminCloudinaryController loaded', 'color:#4ade80;font-family:monospace');
})();
