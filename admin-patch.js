/* ═══════════════════════════════════════════════════════════════════
   ADMIN-PATCH.JS v1.0 — Enhancement Patch for admin.js
   ───────────────────────────────────────────────────────────────────
   FIXES:
   1. Email update not showing in portfolio (renderContact bug)
   2. Certificates: Tabbed editor — each tab manages its own certs
      with image preview on click
   3. Every section gets a drag-and-drop image zone in admin panel
   ═══════════════════════════════════════════════════════════════════ */

(function AdminPatch() {
  'use strict';

  /* ── Wait for admin.js to fully initialise ── */
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* ── Inject patch styles ── */
  function injectStyles() {
    if (document.getElementById('admin-patch-styles')) return;
    const s = document.createElement('style');
    s.id = 'admin-patch-styles';
    s.textContent = `

      /* ─── CERT TABS ─────────────────────────────────────────── */
      .adm-cert-tabs {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-bottom: 20px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .adm-cert-tab {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 7px 14px;
        border-radius: 8px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.025);
        color: rgba(255,255,255,0.4);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.5px;
        cursor: pointer;
        transition: border-color .2s, color .2s, background .2s;
        user-select: none;
        position: relative;
      }
      .adm-cert-tab:hover {
        border-color: rgba(255,255,255,0.18);
        color: rgba(255,255,255,0.75);
        background: rgba(255,255,255,0.05);
      }
      .adm-cert-tab.active {
        border-color: var(--acc);
        color: var(--acc);
        background: var(--acc2);
      }
      .adm-cert-tab-del {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: rgba(239,68,68,0.15);
        border: 1px solid rgba(239,68,68,0.25);
        color: #f87171;
        font-size: 0.55rem;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background .2s;
        flex-shrink: 0;
      }
      .adm-cert-tab-del:hover { background: rgba(239,68,68,0.35); }
      .adm-cert-tab-add {
        padding: 7px 14px;
        border-radius: 8px;
        border: 1px dashed rgba(79,110,245,0.35);
        background: rgba(79,110,245,0.05);
        color: var(--acc);
        font-size: 0.70rem;
        font-weight: 600;
        cursor: pointer;
        transition: background .2s, border-color .2s;
        letter-spacing: 0.5px;
      }
      .adm-cert-tab-add:hover {
        background: rgba(79,110,245,0.12);
        border-color: rgba(79,110,245,0.55);
      }
      .adm-cert-tab-rename {
        background: transparent;
        border: none;
        color: inherit;
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.5px;
        outline: none;
        width: auto;
        min-width: 60px;
        max-width: 120px;
        cursor: text;
        font-family: inherit;
        padding: 0;
      }
      .adm-cert-tab.active .adm-cert-tab-rename {
        color: var(--acc);
      }

      /* ─── CERT PREVIEW MODAL ────────────────────────────────── */
      #adm-cert-preview-modal {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: rgba(4,4,10,0.92);
        backdrop-filter: blur(16px);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity .25s;
      }
      #adm-cert-preview-modal.open {
        opacity: 1;
        pointer-events: all;
      }
      .adm-cert-preview-box {
        background: rgba(13,13,28,0.98);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 18px;
        padding: 28px;
        width: min(680px, 94vw);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        gap: 16px;
        transform: scale(.94);
        transition: transform .25s;
        position: relative;
      }
      #adm-cert-preview-modal.open .adm-cert-preview-box {
        transform: scale(1);
      }
      .adm-cert-preview-img {
        width: 100%;
        max-height: 500px;
        object-fit: contain;
        border-radius: 10px;
        background: rgba(255,255,255,0.03);
      }
      .adm-cert-preview-title {
        font-family: 'Orbitron', sans-serif;
        font-size: 0.70rem;
        letter-spacing: 2px;
        color: var(--acc);
        text-transform: uppercase;
      }
      .adm-cert-preview-close {
        position: absolute;
        top: 16px; right: 16px;
        width: 32px; height: 32px;
        border-radius: 50%;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.05);
        color: rgba(255,255,255,0.6);
        font-size: 0.80rem;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: background .2s, color .2s;
      }
      .adm-cert-preview-close:hover {
        background: rgba(239,68,68,0.2);
        color: #f87171;
        border-color: rgba(239,68,68,0.3);
      }

      /* Eye icon on cert card */
      .adm-cert-card-preview {
        position: absolute;
        bottom: 6px; right: 6px;
        width: 22px; height: 22px;
        border-radius: 50%;
        background: rgba(79,110,245,0.15);
        border: 1px solid rgba(79,110,245,0.3);
        color: var(--acc);
        font-size: 0.60rem;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: background .2s;
      }
      .adm-cert-card-preview:hover {
        background: rgba(79,110,245,0.35);
      }

      /* ─── SECTION IMAGE DROP ZONES ───────────────────────────── */
      .adm-section-img-zone {
        border: 2px dashed rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: border-color .25s, background .25s;
        margin-bottom: 16px;
        position: relative;
      }
      .adm-section-img-zone:hover,
      .adm-section-img-zone.drop-active {
        border-color: var(--acc);
        background: var(--acc2);
      }
      .adm-section-img-zone .zone-ico {
        font-size: 1.5rem;
        opacity: 0.5;
      }
      .adm-section-img-zone .zone-label {
        font-size: 0.64rem;
        letter-spacing: 1px;
        color: rgba(255,255,255,0.3);
        text-transform: uppercase;
      }
      .adm-section-img-zone .zone-hint {
        font-size: 0.54rem;
        color: rgba(255,255,255,0.18);
      }
      .adm-section-img-preview {
        width: 100%;
        max-height: 160px;
        object-fit: cover;
        border-radius: 8px;
        display: none;
        margin-bottom: 8px;
      }
      .adm-section-img-preview.visible { display: block; }
      .adm-section-img-clear {
        font-size: 0.60rem;
        color: #f87171;
        cursor: pointer;
        text-decoration: underline;
        letter-spacing: 0.5px;
        display: none;
      }
      .adm-section-img-clear.visible { display: block; }

      /* ─── INLINE CERT GRID ENHANCEMENTS ──────────────────────── */
      .adm-cert-grid .adm-cert-card {
        position: relative;
      }
      .cert-tabs-bar {
        display: flex;
        gap: 0;
        margin-bottom: 24px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        overflow-x: auto;
        scrollbar-width: none;
      }
      .cert-tabs-bar::-webkit-scrollbar { display: none; }
      .cert-tab-btn {
        padding: 10px 20px;
        font-family: 'Rajdhani', sans-serif;
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.5px;
        color: rgba(255,255,255,0.4);
        border: none;
        border-bottom: 2px solid transparent;
        background: transparent;
        cursor: pointer;
        transition: color .2s, border-color .2s;
        white-space: nowrap;
        flex-shrink: 0;
        margin-bottom: -1px;
      }
      .cert-tab-btn:hover { color: rgba(255,255,255,0.7); }
      .cert-tab-btn.active {
        color: var(--acc);
        border-bottom-color: var(--acc);
      }
      .cert-tab-panel { display: none; }
      .cert-tab-panel.active { display: grid; }

      /* ─── SECTION IMG OVERLAY (for live portfolio bg images) ─── */
      .section-bg-img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.08;
        pointer-events: none;
        z-index: 0;
      }
    `;
    document.head.appendChild(s);
  }

  /* ════════════════════════════════════════════════════════════════
     FIX 1 — EMAIL UPDATE BUG
     The original renderContact() and live-binding both miss the
     #contact-email element which is set via setEmail() in index.html.
     We patch both the live-binding and renderContact.
  ════════════════════════════════════════════════════════════════ */
  function patchEmailUpdate() {
    /* Patch the setEmail helper if it exists on window */
    function applyEmail(email) {
      if (!email) return;
      /* 1. #contact-email element (index.html uses this) */
      const contactEmailEl = document.getElementById('contact-email');
      if (contactEmailEl) {
        contactEmailEl.innerHTML =
          `<a href="mailto:${email}" class="email-link">${email}</a>`;
      }
      /* 2. All mailto: hrefs */
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
        a.href = 'mailto:' + email;
        if (a.textContent.includes('@')) a.textContent = email;
      });
      /* 3. .ct-val elements that look like emails */
      document.querySelectorAll('.ct-val').forEach(el => {
        const t = el.textContent.trim();
        if (t.includes('@') || t === '') {
          /* Only replace if it's clearly an email slot */
          if (t.includes('@')) el.textContent = email;
        }
      });
      /* 4. Any element with data-contact="email" */
      document.querySelectorAll('[data-contact="email"]').forEach(el => {
        el.textContent = email;
      });
      /* 5. Also persist to adminEmail so index.html setEmail picks it up */
      localStorage.setItem('adminEmail', email);
    }

    /* Override the input live-binding for adm-ct-email after it's built */
    function bindEmailInput() {
      const inp = document.getElementById('adm-ct-email');
      if (!inp || inp.__patchBound) return;
      inp.__patchBound = true;
      inp.addEventListener('input', e => {
        applyEmail(e.target.value);
      });
    }

    /* Patch window.setEmail if defined */
    if (typeof window.setEmail === 'function') {
      const _orig = window.setEmail;
      window.setEmail = function(email) {
        _orig(email);
        applyEmail(email);
      };
    }

    /* Run email from stored data on patch load */
    function applyStoredEmail() {
      try {
        const D = JSON.parse(localStorage.getItem('adm-portfolio-data')) || {};
        if (D.email) applyEmail(D.email);
      } catch(e) {}
    }

    /* Keep retrying to bind input after admin panel builds it */
    let emailRetries = 0;
    const emailInterval = setInterval(() => {
      bindEmailInput();
      emailRetries++;
      if (emailRetries > 40) clearInterval(emailInterval);
    }, 300);

    applyStoredEmail();
    return applyEmail;
  }


  /* ════════════════════════════════════════════════════════════════
     FIX 2 — TABBED CERTIFICATE EDITOR
     Replaces the flat cert grid in the admin panel with a tabbed
     system. Each tab has its own cert list + upload zone + preview.
     Data schema: { tabs: [{ id, name, certs: [{id,title,image}] }] }
  ════════════════════════════════════════════════════════════════ */

  const KEY_CERT_TABS = 'portfolio-cert-tabs';

  function loadCertTabs() {
    try {
      const raw = localStorage.getItem(KEY_CERT_TABS);
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    /* Default: migrate existing flat certs into "All" tab */
    const existingCerts = (() => {
      try { return JSON.parse(localStorage.getItem('portfolio-certificates')) || []; } catch { return []; }
    })();
    return [{ id: uid(), name: 'All Certificates', certs: existingCerts }];
  }

  function saveCertTabs(tabs) {
    try {
      localStorage.setItem(KEY_CERT_TABS, JSON.stringify(tabs));
    } catch(e) {
      showToast('Storage full — try smaller images', 'error');
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* Build the tabbed cert editor inside #adm-cert-grid's parent */
  function buildTabbedCertEditor(containerEl) {
    if (!containerEl || containerEl.__tabsBuilt) return;
    containerEl.__tabsBuilt = true;

    let tabs = loadCertTabs();
    let activeTabId = tabs[0]?.id;

    containerEl.innerHTML = '';

    /* ── Tab bar ── */
    const tabBar = document.createElement('div');
    tabBar.className = 'adm-cert-tabs';
    containerEl.appendChild(tabBar);

    /* ── Content area ── */
    const contentArea = document.createElement('div');
    containerEl.appendChild(contentArea);

    /* ── Preview modal ── */
    let previewModal = document.getElementById('adm-cert-preview-modal');
    if (!previewModal) {
      previewModal = document.createElement('div');
      previewModal.id = 'adm-cert-preview-modal';
      previewModal.innerHTML = `
        <div class="adm-cert-preview-box">
          <button class="adm-cert-preview-close" id="adm-cert-preview-close">✕</button>
          <div class="adm-cert-preview-title" id="adm-cert-preview-title"></div>
          <img class="adm-cert-preview-img" id="adm-cert-preview-img" src="" alt="Certificate preview"/>
        </div>`;
      document.body.appendChild(previewModal);
      document.getElementById('adm-cert-preview-close').onclick = closeCertPreview;
      previewModal.addEventListener('click', e => { if (e.target === previewModal) closeCertPreview(); });
    }

    function openCertPreview(title, src) {
      document.getElementById('adm-cert-preview-title').textContent = title || 'Certificate Preview';
      document.getElementById('adm-cert-preview-img').src = src;
      previewModal.classList.add('open');
    }
    function closeCertPreview() {
      previewModal.classList.remove('open');
    }

    function renderTabBar() {
      tabBar.innerHTML = '';
      tabs.forEach(tab => {
        const btn = document.createElement('div');
        btn.className = 'adm-cert-tab' + (tab.id === activeTabId ? ' active' : '');
        btn.dataset.id = tab.id;

        const nameInp = document.createElement('input');
        nameInp.className = 'adm-cert-tab-rename';
        nameInp.value = tab.name;
        nameInp.title = 'Click to rename tab';
        nameInp.addEventListener('input', e => {
          tab.name = e.target.value;
          saveCertTabs(tabs);
          renderPortfolioCertTabs();
        });
        nameInp.addEventListener('click', e => {
          e.stopPropagation();
          if (tab.id !== activeTabId) {
            activeTabId = tab.id;
            renderTabBar();
            renderTabContent();
          }
        });

        const delBtn = document.createElement('button');
        delBtn.className = 'adm-cert-tab-del';
        delBtn.title = 'Delete tab';
        delBtn.textContent = '✕';
        delBtn.addEventListener('click', e => {
          e.stopPropagation();
          if (tabs.length === 1) { showToast('Cannot delete the last tab', 'error'); return; }
          if (!confirm(`Delete tab "${tab.name}" and all its certificates?`)) return;
          tabs = tabs.filter(t => t.id !== tab.id);
          if (activeTabId === tab.id) activeTabId = tabs[0].id;
          saveCertTabs(tabs);
          renderTabBar();
          renderTabContent();
          renderPortfolioCertTabs();
        });

        btn.appendChild(nameInp);
        btn.appendChild(delBtn);
        btn.addEventListener('click', () => {
          activeTabId = tab.id;
          renderTabBar();
          renderTabContent();
        });
        tabBar.appendChild(btn);
      });

      /* Add tab button */
      const addBtn = document.createElement('button');
      addBtn.className = 'adm-cert-tab-add';
      addBtn.textContent = '＋ New Tab';
      addBtn.addEventListener('click', () => {
        const newTab = { id: uid(), name: 'New Tab', certs: [] };
        tabs.push(newTab);
        activeTabId = newTab.id;
        saveCertTabs(tabs);
        renderTabBar();
        renderTabContent();
        renderPortfolioCertTabs();
      });
      tabBar.appendChild(addBtn);
    }

    function renderTabContent() {
      contentArea.innerHTML = '';
      const tab = tabs.find(t => t.id === activeTabId);
      if (!tab) return;

      /* Upload zone */
      const dropZone = document.createElement('div');
      dropZone.className = 'adm-certs-drop-zone';
      dropZone.innerHTML = `
        <span class="adm-drop-ico">🖼</span>
        <span style="font-size:0.65rem;letter-spacing:1px;color:rgba(255,255,255,0.3);text-transform:uppercase">
          Drop images here or click to upload
        </span>
        <span style="font-size:0.55rem;opacity:0.4;margin-top:2px">JPG · PNG · multiple files</span>
      `;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/jpeg,image/png';
      fileInput.multiple = true;
      fileInput.style.display = 'none';
      dropZone.appendChild(fileInput);

      dropZone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', e => processFiles(e.target.files, tab));
      dropZone.addEventListener('dragenter', e => { e.preventDefault(); dropZone.classList.add('adm-certs-drop-active'); });
      dropZone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('adm-certs-drop-active'); });
      dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('adm-certs-drop-active'); });
      dropZone.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove('adm-certs-drop-active');
        processFiles(e.dataTransfer.files, tab);
      });
      contentArea.appendChild(dropZone);

      /* Error */
      const errEl = document.createElement('div');
      errEl.style.cssText = 'font-size:0.65rem;color:#f87171;min-height:16px;margin-top:6px;margin-bottom:6px';
      contentArea.appendChild(errEl);

      /* Grid */
      const grid = document.createElement('div');
      grid.className = 'adm-cert-grid';
      contentArea.appendChild(grid);

      function renderGrid() {
        if (!tab.certs.length) {
          grid.innerHTML = '<p style="font-size:0.68rem;color:rgba(255,255,255,0.22);text-align:center;padding:20px 0">No certificates yet. Upload images above.</p>';
          return;
        }
        grid.innerHTML = tab.certs.map((c, i) => `
          <div class="adm-cert-card" draggable="true" data-idx="${i}" data-id="${esc(c.id)}">
            <div class="adm-cert-card-drag" title="Drag to reorder">⠿</div>
            <div class="adm-cert-card-img-wrap">
              ${c.image
                ? `<img src="${c.image}" alt="${esc(c.title)}" class="adm-cert-card-img" loading="lazy"/>`
                : `<div class="adm-cert-card-placeholder">🖼</div>`}
            </div>
            <input class="adm-cert-card-title" type="text" value="${esc(c.title)}"
              placeholder="Certificate title" data-idx="${i}" style="width:100%;margin-top:8px"/>
            <button class="adm-cert-card-del" data-idx="${i}" title="Delete">✕</button>
            ${c.image ? `<button class="adm-cert-card-preview" data-idx="${i}" title="Preview">👁</button>` : ''}
          </div>`).join('');

        /* Bind title edits */
        grid.querySelectorAll('.adm-cert-card-title').forEach(inp => {
          inp.addEventListener('input', e => {
            const idx = parseInt(e.target.dataset.idx);
            if (tab.certs[idx]) { tab.certs[idx].title = e.target.value; saveCertTabs(tabs); renderPortfolioCertTabs(); }
          });
        });

        /* Bind delete */
        grid.querySelectorAll('.adm-cert-card-del').forEach(btn => {
          btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            tab.certs.splice(idx, 1);
            saveCertTabs(tabs);
            renderGrid();
            renderPortfolioCertTabs();
            showToast('Certificate deleted');
          });
        });

        /* Bind preview */
        grid.querySelectorAll('.adm-cert-card-preview').forEach(btn => {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            const idx = parseInt(btn.dataset.idx);
            const c = tab.certs[idx];
            if (c?.image) openCertPreview(c.title, c.image);
          });
        });

        /* Drag-to-reorder */
        initGridDrag(grid, tab, renderGrid);
      }

      function processFiles(files, tab) {
        const valid = [...files].filter(f => {
          if (!['image/jpeg','image/png'].includes(f.type)) { errEl.textContent = 'Only JPG/PNG allowed.'; setTimeout(()=>errEl.textContent='',3000); return false; }
          if (f.size > 2*1024*1024) { errEl.textContent = 'File exceeds 2 MB limit.'; setTimeout(()=>errEl.textContent='',3000); return false; }
          return true;
        });
        if (!valid.length) return;
        let done = 0;
        valid.forEach(file => {
          /* Convert to base64 for local storage (Cloudinary optional) */
          const reader = new FileReader();
          reader.onload = e => {
            tab.certs.push({ id: uid(), title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), image: e.target.result });
            done++;
            if (done === valid.length) {
              saveCertTabs(tabs);
              renderGrid();
              renderPortfolioCertTabs();
              showToast(valid.length === 1 ? 'Certificate added' : `${valid.length} certificates added`);
            }
          };
          reader.readAsDataURL(file);
        });
      }

      renderGrid();
    }

    function initGridDrag(grid, tab, onDone) {
      if (grid.__certDragBound) return;
      grid.__certDragBound = true;
      let dragIdx = null, overEl = null;
      function clearOver() { if (overEl) { overEl.classList.remove('adm-cert-card-over'); overEl = null; } }
      grid.addEventListener('dragstart', e => {
        const card = e.target.closest('.adm-cert-card'); if (!card) return;
        dragIdx = parseInt(card.dataset.idx);
        card.classList.add('adm-cert-card-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      });
      grid.addEventListener('dragend', e => {
        e.target.closest('.adm-cert-card')?.classList.remove('adm-cert-card-dragging');
        clearOver(); dragIdx = null;
      });
      grid.addEventListener('dragover', e => {
        e.preventDefault(); e.stopPropagation();
        const card = e.target.closest('.adm-cert-card'); if (!card || card === overEl) return;
        clearOver(); overEl = card; overEl.classList.add('adm-cert-card-over');
      });
      grid.addEventListener('dragleave', e => { if (!grid.contains(e.relatedTarget)) clearOver(); });
      grid.addEventListener('drop', e => {
        e.preventDefault(); e.stopPropagation();
        const dropCard = e.target.closest('.adm-cert-card'); clearOver();
        if (!dropCard || dragIdx === null) return;
        const dropIdx = parseInt(dropCard.dataset.idx);
        if (dragIdx === dropIdx) return;
        const [moved] = tab.certs.splice(dragIdx, 1);
        tab.certs.splice(dropIdx, 0, moved);
        saveCertTabs(tabs);
        onDone();
        renderPortfolioCertTabs();
        showToast('Order saved');
      });
    }

    renderTabBar();
    renderTabContent();
  }

  /* ── Render tabbed certs to the live portfolio ── */
  function renderPortfolioCertTabs() {
    // Delegate to the unified CertSectionRenderer in index.html
    if (window.__renderCerts) { window.__renderCerts(); return; }
  }

  /* openCertPreviewLive removed — openCertModal handles all cert previews */


  /* ════════════════════════════════════════════════════════════════
     FIX 3 — DRAG & DROP IMAGE ZONES FOR EVERY SECTION
     Adds an image upload group to each section panel in the admin.
     Images are stored per-section and overlaid on the live section.
  ════════════════════════════════════════════════════════════════ */

  const KEY_SECTION_IMGS = 'portfolio-section-images';

  function loadSectionImages() {
    try { return JSON.parse(localStorage.getItem(KEY_SECTION_IMGS)) || {}; }
    catch { return {}; }
  }
  function saveSectionImages(obj) {
    try { localStorage.setItem(KEY_SECTION_IMGS, JSON.stringify(obj)); }
    catch(e) { showToast('Could not save image', 'error'); }
  }

  function applySectionImage(sectionId, src) {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.style.position = 'relative';

    let bg = section.querySelector('.section-bg-img');
    if (src) {
      if (!bg) {
        bg = document.createElement('img');
        bg.className = 'section-bg-img';
        section.insertBefore(bg, section.firstChild);
      }
      bg.src = src;
    } else {
      if (bg) bg.remove();
    }
  }

  function applyAllSectionImages() {
    const imgs = loadSectionImages();
    Object.entries(imgs).forEach(([id, src]) => applySectionImage(id, src));
  }

  function buildSectionImageZone(panelEl, sectionId, label) {
    if (!panelEl) return;

    /* Don't add twice */
    if (panelEl.querySelector('.adm-section-img-zone')) return;

    const imgs = loadSectionImages();
    const currentSrc = imgs[sectionId] || '';

    const group = document.createElement('div');
    group.className = 'adm-group';
    group.innerHTML = `
      <div class="adm-group-title">Section Background Image</div>
      <p style="font-size:0.64rem;color:rgba(255,255,255,0.25);margin-bottom:12px;line-height:1.6">
        Upload an image to use as a decorative background in the <strong>${label}</strong> section.
        It will appear as a subtle overlay.
      </p>
      <div class="adm-section-img-zone" data-section="${sectionId}">
        <img class="adm-section-img-preview ${currentSrc ? 'visible' : ''}"
             src="${currentSrc}" alt="Section background"/>
        <span class="zone-ico">🖼</span>
        <span class="zone-label">Drop image or click to upload</span>
        <span class="zone-hint">JPG · PNG · shown as background overlay</span>
        <input type="file" accept="image/jpeg,image/png" style="display:none"/>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <span class="adm-section-img-clear ${currentSrc ? 'visible' : ''}" 
              style="font-size:0.60rem;color:#f87171;cursor:pointer;text-decoration:underline">
          ✕ Remove image
        </span>
      </div>
      <div class="adm-img-err" style="font-size:0.65rem;color:#f87171;min-height:16px;margin-top:4px"></div>
    `;

    const zone = group.querySelector('.adm-section-img-zone');
    const fileInput = group.querySelector('input[type="file"]');
    const preview = group.querySelector('.adm-section-img-preview');
    const clearBtn = group.querySelector('.adm-section-img-clear');
    const errEl = group.querySelector('.adm-img-err');

    function setPreview(src) {
      if (src) {
        preview.src = src;
        preview.classList.add('visible');
        clearBtn.classList.add('visible');
        zone.querySelector('.zone-ico').style.display = 'none';
        zone.querySelector('.zone-label').style.display = 'none';
        zone.querySelector('.zone-hint').style.display = 'none';
      } else {
        preview.src = '';
        preview.classList.remove('visible');
        clearBtn.classList.remove('visible');
        zone.querySelector('.zone-ico').style.display = '';
        zone.querySelector('.zone-label').style.display = '';
        zone.querySelector('.zone-hint').style.display = '';
      }
    }

    function handleFile(file) {
      if (!['image/jpeg','image/png'].includes(file.type)) {
        errEl.textContent = 'Only JPG/PNG files allowed.';
        setTimeout(() => errEl.textContent = '', 3000);
        return;
      }
      if (file.size > 3*1024*1024) {
        errEl.textContent = 'Image exceeds 3 MB limit.';
        setTimeout(() => errEl.textContent = '', 3000);
        return;
      }
      const reader = new FileReader();
      reader.onload = e => {
        const src = e.target.result;
        const imgs = loadSectionImages();
        imgs[sectionId] = src;
        saveSectionImages(imgs);
        setPreview(src);
        applySectionImage(sectionId, src);
        showToast(`${label} background updated`);
      };
      reader.readAsDataURL(file);
    }

    zone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
    zone.addEventListener('dragenter', e => { e.preventDefault(); zone.classList.add('drop-active'); });
    zone.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('drop-active'); });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-active'); });
    zone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove('drop-active');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    clearBtn.addEventListener('click', e => {
      e.stopPropagation();
      const imgs = loadSectionImages();
      delete imgs[sectionId];
      saveSectionImages(imgs);
      setPreview('');
      applySectionImage(sectionId, '');
      showToast(`${label} background removed`);
    });

    /* Insert at the top of the panel */
    panelEl.insertBefore(group, panelEl.firstChild);
  }

  /* Inject image zones into each panel once they're built */
  const SECTION_PANEL_MAP = [
    { panelId: 'admp-hero',     sectionId: 'home',     label: 'Hero' },
    { panelId: 'admp-about',    sectionId: 'about',    label: 'About' },
    { panelId: 'admp-skills',   sectionId: 'skills',   label: 'Skills' },
    { panelId: 'admp-projects', sectionId: 'projects', label: 'Projects' },
    { panelId: 'admp-journey',  sectionId: 'journey',  label: 'Journey' },
    { panelId: 'admp-certs',    sectionId: 'certs',    label: 'Certificates' },
    { panelId: 'admp-contact',  sectionId: 'contact',  label: 'Contact' },
  ];

  function injectImageZones() {
    SECTION_PANEL_MAP.forEach(({ panelId, sectionId, label }) => {
      const panel = document.getElementById(panelId);
      if (panel) buildSectionImageZone(panel, sectionId, label);
    });
  }


  /* ════════════════════════════════════════════════════════════════
     CERT PANEL HIJACK
     Replace the static cert panel content with our tabbed version
  ════════════════════════════════════════════════════════════════ */
  function hijackCertPanel() {
    const certPanel = document.getElementById('admp-certs');
    if (!certPanel || certPanel.__tabsHijacked) return;
    certPanel.__tabsHijacked = true;

    /* Find the "My Certificates" group and replace its grid */
    const groups = certPanel.querySelectorAll('.adm-group');
    let certGroup = null;
    groups.forEach(g => {
      const title = g.querySelector('.adm-group-title');
      if (title && title.textContent.includes('Certif')) certGroup = g;
    });

    if (certGroup) {
      /* Replace everything from the drop zone down with our tabbed editor */
      const existing = certGroup.querySelector('.adm-certs-drop-zone');
      if (existing) existing.remove();
      const existingGrid = certGroup.querySelector('#adm-cert-grid');
      if (existingGrid) existingGrid.remove();
      const existingErr = certGroup.querySelector('#adm-certs-err');
      if (existingErr) existingErr.remove();

      /* Remove old instructions */
      certGroup.querySelectorAll('p').forEach(p => p.remove());

      const tabContainer = document.createElement('div');
      tabContainer.id = 'adm-cert-tabs-container';
      certGroup.appendChild(tabContainer);
      buildTabbedCertEditor(tabContainer);
    }
  }


  /* ════════════════════════════════════════════════════════════════
     TOAST HELPER (works even before admin.js initialises its own)
  ════════════════════════════════════════════════════════════════ */
  function showToast(msg, type = 'ok') {
    let t = document.getElementById('toast') || document.getElementById('adm-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'patch-toast';
      t.style.cssText = 'position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(16px);background:rgba(13,13,28,0.97);border:1px solid rgba(255,255,255,0.1);border-radius:10px;padding:12px 26px;font-size:0.76rem;color:rgba(255,255,255,0.8);letter-spacing:.5px;z-index:999999;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;white-space:nowrap;font-family:Rajdhani,sans-serif';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = type === 'error' ? 'err' : 'ok';
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(16px)';
    }, 2800);
  }


  /* ── Escape HTML ── */
  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }


  /* ════════════════════════════════════════════════════════════════
     BOOT — poll for admin panels to appear then inject
  ════════════════════════════════════════════════════════════════ */
  function boot() {
    injectStyles();
    patchEmailUpdate();
    applyAllSectionImages();
    renderPortfolioCertTabs();

    /* Poll until admin overlay is opened and panels are built */
    let pollCount = 0;
    const poll = setInterval(() => {
      pollCount++;

      /* Inject image zones whenever panels appear */
      injectImageZones();

      /* Hijack cert panel once it's built */
      hijackCertPanel();

      /* Stop after 3 minutes */
      if (pollCount > 360) clearInterval(poll);
    }, 500);

    /* Also hook into MutationObserver for panel builds */
    const adminOverlay = document.getElementById('adm-overlay');
    if (adminOverlay) {
      const mo = new MutationObserver(() => {
        injectImageZones();
        hijackCertPanel();
      });
      mo.observe(adminOverlay, { childList: true, subtree: true });
    }

    /* Also observe the full body for adm-overlay being added */
    const bodyObs = new MutationObserver((mutations, obs) => {
      const ov = document.getElementById('adm-overlay');
      if (ov) {
        obs.disconnect();
        const mo = new MutationObserver(() => {
          injectImageZones();
          hijackCertPanel();
        });
        mo.observe(ov, { childList: true, subtree: true });
      }
    });
    bodyObs.observe(document.body, { childList: true, subtree: false });
  }

  ready(boot);

  console.log('%c✦ Admin Patch v1.0 — Tabbed Certs + Image Zones + Email Fix', 'color:#22d3ee;font-family:monospace;font-weight:bold');

})();
