/* ═══════════════════════════════════════════════════════════════════
   ADMIN-EXTEND.JS  v1.0
   ───────────────────────────────────────────────────────────────────
   Adds three purely additive features to the existing admin system:

   MODULE A — IMAGE EDITOR
     Canvas-based crop modal (no external libs).
     Hooks into handleImageUpload() intercept point.
     Supports: 1:1 / 16:9 / 4:3 aspect ratios, zoom, drag-to-reposition,
     brightness, contrast. Passes final canvas blob to the
     existing upload pipeline — zero changes to admin.js.

   MODULE B — DYNAMIC SECTIONS
     Full create / edit / reorder / delete for dynamically-built
     sections stored in localStorage key "dynamic-sections".
     Types: text · cards · image+text · timeline · gallery · testimonials
     Rendered live on the portfolio via a small inline renderer in index.html.
     New nav item "Dynamic Sections" added to sidebar CMS group.

   MODULE C — EXTENDED PRESETS
     8 new rich presets (text, cards, skills-cards, testimonials,
     gallery, image+text, timeline, faq). Each auto-fills a full
     section data object including sample items.
     Rendered inside the existing preset-grid below existing presets.
   ═══════════════════════════════════════════════════════════════════ */

(function AdminExtend() {
  'use strict';

  /* ── Guard: run once ── */
  if (window.__adminExtendLoaded) return;
  window.__adminExtendLoaded = true;

  /* ── Wait for the admin shell ── */
  function onAdminReady(fn) {
    const shell = document.getElementById('admin-shell');
    if (!shell) { document.addEventListener('DOMContentLoaded', () => onAdminReady(fn)); return; }
    if (shell.classList.contains('visible')) { fn(); return; }
    const mo = new MutationObserver(() => {
      if (shell.classList.contains('visible')) { mo.disconnect(); fn(); }
    });
    mo.observe(shell, { attributes: true, attributeFilter: ['class'] });
  }

  /* ══════════════════════════════════════════════════════════
     SHARED UTILITIES
  ══════════════════════════════════════════════════════════ */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function val(id) { const e = document.getElementById(id); return e ? e.value : ''; }
  function setVal(id, v) { const e = document.getElementById(id); if (e) e.value = String(v || ''); }

  function loadJSON(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; }
  }
  function saveJSON(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); return true; }
    catch { adminToast('Storage full', 'err'); return false; }
  }

  function adminToast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg; el.className = 'show ' + type;
    clearTimeout(el.__t); el.__t = setTimeout(() => el.className = '', 2500);
  }

  /* ── Reuse existing openModal from admin.js scope ── */
  function extOpenModal(title, bodyHTML, onSave) {
    const titleEl = document.getElementById('modal-title');
    const bodyEl  = document.getElementById('modal-body');
    const saveBtn = document.getElementById('modal-save');
    const cancelBtn = document.getElementById('modal-cancel');
    const ov = document.getElementById('modal-ov');
    if (!ov) return;
    if (titleEl) titleEl.textContent = title;
    if (bodyEl)  bodyEl.innerHTML = bodyHTML;

    /* Swap the save handler for this call only */
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    const newCancelBtn = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newSaveBtn.onclick = () => { if (onSave) onSave(); ov.classList.remove('open'); };
    newCancelBtn.onclick = () => ov.classList.remove('open');
    ov.classList.add('open');
    setTimeout(() => ov.querySelector('input,select,textarea')?.focus(), 120);
  }

  /* ══════════════════════════════════════════════════════════
     INJECT STYLES
  ══════════════════════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('ext-styles')) return;
    const s = document.createElement('style');
    s.id = 'ext-styles';
    s.textContent = `

/* ══ IMAGE EDITOR MODAL ══════════════════════════════════════════ */
#img-editor-overlay {
  position: fixed; inset: 0; z-index: 10001;
  background: rgba(4,4,12,.92);
  backdrop-filter: blur(14px);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; pointer-events: none;
  transition: opacity .25s;
}
#img-editor-overlay.open { opacity: 1; pointer-events: all; }

.img-editor-box {
  background: rgba(10,10,22,.98);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 20px;
  width: min(760px, 96vw);
  max-height: 92vh;
  overflow: hidden;
  display: flex; flex-direction: column;
  transform: scale(.94); transition: transform .25s;
}
#img-editor-overlay.open .img-editor-box { transform: scale(1); }

.img-editor-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255,255,255,.07);
  flex-shrink: 0;
}
.img-editor-title {
  font-family: 'Orbitron', sans-serif;
  font-size: .68rem; font-weight: 700;
  letter-spacing: 2px; color: rgba(255,255,255,.6);
  text-transform: uppercase;
}
.img-editor-close {
  width: 30px; height: 30px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.04);
  color: rgba(255,255,255,.45);
  font-size: .75rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background .18s, color .18s;
}
.img-editor-close:hover { background: rgba(239,68,68,.2); color: #f87171; }

.img-editor-body {
  flex: 1; display: flex; gap: 0;
  overflow: hidden; min-height: 0;
}

/* ── Canvas viewport ── */
.img-editor-canvas-wrap {
  flex: 1; position: relative;
  background: repeating-conic-gradient(rgba(255,255,255,.04) 0% 25%, transparent 0% 50%)
              0 0 / 20px 20px;
  overflow: hidden; cursor: crosshair; user-select: none;
  min-height: 320px;
}
#img-editor-canvas {
  position: absolute; top: 0; left: 0;
  width: 100%; height: 100%;
}
/* Crop overlay box */
.crop-outline {
  position: absolute; pointer-events: none;
  border: 2px solid var(--acc, #4f6ef5);
  box-shadow: 0 0 0 9999px rgba(0,0,0,.55);
  box-sizing: border-box;
}
.crop-corner {
  position: absolute; width: 10px; height: 10px;
  border-color: var(--acc, #4f6ef5); border-style: solid;
}
.crop-corner.tl { top:-1px; left:-1px; border-width:2px 0 0 2px; }
.crop-corner.tr { top:-1px; right:-1px; border-width:2px 2px 0 0; }
.crop-corner.bl { bottom:-1px; left:-1px; border-width:0 0 2px 2px; }
.crop-corner.br { bottom:-1px; right:-1px; border-width:0 2px 2px 0; }

/* Rule-of-thirds grid */
.crop-grid-line {
  position: absolute; background: rgba(255,255,255,.12); pointer-events: none;
}

/* ── Controls sidebar ── */
.img-editor-controls {
  width: 200px; flex-shrink: 0;
  background: rgba(6,6,14,.9);
  border-left: 1px solid rgba(255,255,255,.06);
  padding: 16px 14px;
  overflow-y: auto; display: flex; flex-direction: column; gap: 16px;
}
.ctrl-group-title {
  font-family: 'Space Mono', monospace;
  font-size: .46rem; letter-spacing: 2px;
  color: rgba(255,255,255,.25); text-transform: uppercase;
  margin-bottom: 8px;
}
.ratio-pills { display: flex; flex-wrap: wrap; gap: 5px; }
.ratio-pill {
  padding: 4px 10px; border-radius: 20px;
  border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.03);
  color: rgba(255,255,255,.4);
  font-size: .62rem; font-weight: 600;
  cursor: pointer; transition: border-color .18s, color .18s, background .18s;
  white-space: nowrap;
}
.ratio-pill:hover { border-color: rgba(255,255,255,.2); color: rgba(255,255,255,.7); }
.ratio-pill.active { border-color: var(--acc, #4f6ef5); color: var(--acc, #4f6ef5); background: rgba(79,110,245,.1); }

.ctrl-slider-row { display: flex; flex-direction: column; gap: 5px; }
.ctrl-slider-label {
  display: flex; justify-content: space-between;
  font-size: .62rem; color: rgba(255,255,255,.4);
}
.ctrl-slider {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 4px;
  background: rgba(255,255,255,.1); border-radius: 2px; outline: none; cursor: pointer;
}
.ctrl-slider::-webkit-slider-thumb {
  -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: var(--acc, #4f6ef5); border: 2px solid #000; cursor: pointer;
}
.ctrl-slider::-moz-range-thumb {
  width: 14px; height: 14px; border-radius: 50%;
  background: var(--acc, #4f6ef5); border: 2px solid #000; cursor: pointer;
}

.img-editor-footer {
  display: flex; gap: 8px; justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid rgba(255,255,255,.07);
  flex-shrink: 0;
}

/* ══ DYNAMIC SECTIONS PANEL ══════════════════════════════════════ */
.dyn-section-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }

.dyn-row {
  background: rgba(255,255,255,.025);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 12px; padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
  transition: border-color .2s, transform .18s;
  cursor: default;
}
.dyn-row:hover { border-color: rgba(255,255,255,.12); transform: translateX(3px); }
.dyn-row.dyn-dragging { opacity: .4; transform: scale(.97); }
.dyn-row.dyn-over { border: 1px dashed var(--acc) !important; background: var(--acc2) !important; }

.dyn-drag { font-size: 1.1rem; color: rgba(255,255,255,.2); cursor: grab; flex-shrink: 0; }
.dyn-row:hover .dyn-drag { color: rgba(255,255,255,.5); }

.dyn-info { flex: 1; min-width: 0; }
.dyn-name { font-size: .84rem; font-weight: 700; color: rgba(255,255,255,.8); margin-bottom: 2px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dyn-meta { font-size: .63rem; color: rgba(255,255,255,.3); font-family: 'Space Mono', monospace; letter-spacing: .5px; }

.dyn-type-badge {
  padding: 2px 8px; border-radius: 20px;
  font-size: .54rem; font-weight: 700; letter-spacing: .8px;
  font-family: 'Space Mono', monospace; text-transform: uppercase;
  border: 1px solid rgba(255,255,255,.1); color: rgba(255,255,255,.35);
  flex-shrink: 0;
}

.dyn-actions { display: flex; gap: 5px; flex-shrink: 0; }

/* ── Extended preset grid tag ── */
.ext-preset-group-label {
  font-family: 'Space Mono', monospace;
  font-size: .48rem; letter-spacing: 3px;
  color: rgba(255,255,255,.2); text-transform: uppercase;
  margin: 16px 0 8px;
  padding-top: 14px;
  border-top: 1px solid rgba(255,255,255,.05);
}

/* ── Dynamic section item editor ── */
.dyn-item-list { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
.dyn-item-row {
  display: flex; align-items: center; gap: 8px;
  background: rgba(255,255,255,.025);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 8px; padding: 8px 10px;
}
.dyn-item-row input {
  flex: 1; background: transparent; border: none; outline: none;
  color: rgba(255,255,255,.7); font-size: .78rem; font-family: 'Rajdhani', sans-serif;
}
.dyn-item-del {
  width: 22px; height: 22px; border-radius: 50%;
  border: 1px solid rgba(239,68,68,.25); background: rgba(239,68,68,.08);
  color: #f87171; font-size: .6rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: background .18s;
}
.dyn-item-del:hover { background: rgba(239,68,68,.25); }
.dyn-item-add {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  width: 100%; padding: 7px; margin-top: 4px;
  background: rgba(79,110,245,.05);
  border: 1px dashed rgba(79,110,245,.25);
  border-radius: 8px; color: var(--acc, #4f6ef5);
  font-size: .68rem; font-weight: 600; cursor: pointer;
  transition: background .18s;
}
.dyn-item-add:hover { background: rgba(79,110,245,.12); }

/* Dynamic section rendered on portfolio */
.dyn-section {
  padding: 80px 0;
  position: relative;
}
.dyn-section .stag {
  font-family: 'Space Mono', monospace; font-size: .62rem;
  letter-spacing: 3px; color: var(--acc); text-transform: uppercase; margin-bottom: 8px;
}
.dyn-section .stit {
  font-family: 'Orbitron', sans-serif; font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 800; margin-bottom: 32px;
  background: linear-gradient(135deg, var(--text, #dde0f0), var(--acc));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.dyn-text-body {
  max-width: 680px; font-size: 1rem; line-height: 1.8;
  color: rgba(221,224,240,.65); white-space: pre-wrap;
}
.dyn-cards-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px;
}
.dyn-card {
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08);
  border-radius: 14px; padding: 20px;
  transition: border-color .2s, transform .2s, box-shadow .2s;
}
.dyn-card:hover { border-color: var(--acc); transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,.4); }
.dyn-card-ico { font-size: 1.8rem; margin-bottom: 10px; }
.dyn-card-title { font-size: 1rem; font-weight: 700; color: rgba(255,255,255,.85); margin-bottom: 6px; }
.dyn-card-desc { font-size: .82rem; color: rgba(255,255,255,.45); line-height: 1.6; }

.dyn-img-text-wrap {
  display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center;
}
.dyn-img-text-wrap img {
  width: 100%; border-radius: 16px; object-fit: cover; max-height: 380px;
}
.dyn-img-text-body { font-size: .95rem; line-height: 1.8; color: rgba(221,224,240,.65); }

.dyn-timeline { position: relative; padding-left: 28px; }
.dyn-timeline::before {
  content: ''; position: absolute; left: 6px; top: 8px; bottom: 8px;
  width: 2px; background: linear-gradient(to bottom, var(--acc), transparent);
}
.dyn-tl-item { position: relative; margin-bottom: 28px; }
.dyn-tl-dot {
  position: absolute; left: -25px; top: 4px;
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--acc); border: 2px solid rgba(6,6,15,1);
  box-shadow: 0 0 8px var(--acc);
}
.dyn-tl-date { font-family: 'Space Mono', monospace; font-size: .58rem; letter-spacing: 1.5px; color: var(--acc); margin-bottom: 4px; }
.dyn-tl-title { font-size: .92rem; font-weight: 700; color: rgba(255,255,255,.85); margin-bottom: 4px; }
.dyn-tl-desc { font-size: .80rem; color: rgba(255,255,255,.45); line-height: 1.6; }

.dyn-gallery-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;
}
.dyn-gallery-item {
  aspect-ratio: 1; border-radius: 10px; overflow: hidden;
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06);
  cursor: pointer; transition: transform .2s, border-color .2s;
}
.dyn-gallery-item:hover { transform: scale(1.04); border-color: var(--acc); }
.dyn-gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dyn-gallery-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 1.4rem; opacity: .25; }

.dyn-testimonials-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px;
}
.dyn-testimonial {
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
  border-radius: 16px; padding: 24px;
  position: relative;
  transition: border-color .2s, transform .2s;
}
.dyn-testimonial:hover { border-color: var(--acc); transform: translateY(-3px); }
.dyn-testimonial::before {
  content: '"'; position: absolute; top: 14px; right: 18px;
  font-family: Georgia, serif; font-size: 3rem; color: var(--acc); opacity: .2; line-height: 1;
}
.dyn-testimonial-text { font-size: .88rem; line-height: 1.7; color: rgba(255,255,255,.6); margin-bottom: 14px; }
.dyn-testimonial-author { font-size: .72rem; font-weight: 700; color: rgba(255,255,255,.75); }
.dyn-testimonial-role { font-size: .65rem; color: rgba(255,255,255,.35); margin-top: 2px; }

.dyn-skills-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px;
}
.dyn-skill-card {
  background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.07);
  border-radius: 12px; padding: 18px 16px; text-align: center;
  transition: border-color .2s, transform .2s;
}
.dyn-skill-card:hover { border-color: var(--acc); transform: translateY(-3px); }
.dyn-skill-ico { font-size: 1.8rem; margin-bottom: 8px; }
.dyn-skill-name { font-size: .82rem; font-weight: 700; color: rgba(255,255,255,.8); margin-bottom: 8px; }
.dyn-skill-bar { height: 4px; background: rgba(255,255,255,.08); border-radius: 2px; overflow: hidden; }
.dyn-skill-fill { height: 100%; background: var(--acc); border-radius: 2px; transition: width 1s cubic-bezier(.22,1,.36,1); }

.dyn-faq { display: flex; flex-direction: column; gap: 10px; }
.dyn-faq-item {
  background: rgba(255,255,255,.025); border: 1px solid rgba(255,255,255,.07);
  border-radius: 12px; overflow: hidden;
  transition: border-color .2s;
}
.dyn-faq-item.open { border-color: var(--acc); }
.dyn-faq-q {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; cursor: pointer; font-size: .88rem; font-weight: 600;
  color: rgba(255,255,255,.75); user-select: none;
  transition: color .18s;
}
.dyn-faq-q:hover { color: rgba(255,255,255,.95); }
.dyn-faq-arrow { font-size: .75rem; color: var(--acc); transition: transform .25s; flex-shrink: 0; }
.dyn-faq-item.open .dyn-faq-arrow { transform: rotate(180deg); }
.dyn-faq-a {
  max-height: 0; overflow: hidden;
  transition: max-height .3s cubic-bezier(.22,1,.36,1), padding .3s;
  font-size: .82rem; line-height: 1.7; color: rgba(255,255,255,.45);
}
.dyn-faq-item.open .dyn-faq-a { max-height: 400px; padding: 0 18px 16px; }

@media (max-width: 700px) {
  .dyn-img-text-wrap { grid-template-columns: 1fr; }
  .img-editor-controls { width: 160px; }
}
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     MODULE A — IMAGE EDITOR
  ══════════════════════════════════════════════════════════ */
  const ImageEditor = (() => {
    let pendingCallback = null; // called with final dataURL
    let sourceImg = null;       // HTMLImageElement of the source

    /* State */
    let zoom = 1;
    let panX = 0, panY = 0;
    let brightness = 100, contrast = 100;
    let aspectRatio = 1;        // width/height ratio of crop box
    let cropW = 0, cropH = 0;  // crop box size in canvas pixels
    let cropX = 0, cropY = 0;  // crop box position
    let dragging = false, dragStartX = 0, dragStartY = 0, dragStartPanX = 0, dragStartPanY = 0;

    const RATIOS = [
      { label: '1:1',  value: 1 },
      { label: '4:3',  value: 4/3 },
      { label: '16:9', value: 16/9 },
      { label: 'Free', value: 0 },
    ];

    /* ── Build the modal DOM (once) ── */
    function buildModal() {
      if (document.getElementById('img-editor-overlay')) return;
      const html = `
      <div id="img-editor-overlay">
        <div class="img-editor-box">
          <div class="img-editor-header">
            <div class="img-editor-title">✂ Image Editor</div>
            <button class="img-editor-close" id="ie-close">✕</button>
          </div>
          <div class="img-editor-body">
            <div class="img-editor-canvas-wrap" id="ie-canvas-wrap">
              <canvas id="img-editor-canvas"></canvas>
              <div class="crop-outline" id="ie-crop-outline">
                <div class="crop-corner tl"></div><div class="crop-corner tr"></div>
                <div class="crop-corner bl"></div><div class="crop-corner br"></div>
                <div class="crop-grid-line" id="ie-grid-v1" style="left:33.3%;top:0;width:1px;height:100%"></div>
                <div class="crop-grid-line" id="ie-grid-v2" style="left:66.6%;top:0;width:1px;height:100%"></div>
                <div class="crop-grid-line" id="ie-grid-h1" style="top:33.3%;left:0;height:1px;width:100%"></div>
                <div class="crop-grid-line" id="ie-grid-h2" style="top:66.6%;left:0;height:1px;width:100%"></div>
              </div>
            </div>
            <div class="img-editor-controls">
              <div>
                <div class="ctrl-group-title">Aspect Ratio</div>
                <div class="ratio-pills" id="ie-ratio-pills">
                  ${RATIOS.map((r,i)=>`<div class="ratio-pill${i===0?' active':''}" data-ratio="${r.value}">${r.label}</div>`).join('')}
                </div>
              </div>
              <div class="ctrl-slider-row">
                <div class="ctrl-slider-label">
                  <span>Zoom</span><span id="ie-zoom-val">100%</span>
                </div>
                <input type="range" class="ctrl-slider" id="ie-zoom" min="100" max="400" step="1" value="100"/>
              </div>
              <div class="ctrl-slider-row">
                <div class="ctrl-slider-label">
                  <span>Brightness</span><span id="ie-bright-val">100</span>
                </div>
                <input type="range" class="ctrl-slider" id="ie-bright" min="30" max="200" step="1" value="100"/>
              </div>
              <div class="ctrl-slider-row">
                <div class="ctrl-slider-label">
                  <span>Contrast</span><span id="ie-contrast-val">100</span>
                </div>
                <input type="range" class="ctrl-slider" id="ie-contrast" min="30" max="200" step="1" value="100"/>
              </div>
              <button class="btn-secondary btn-sm" id="ie-reset" style="margin-top:4px">↺ Reset</button>
            </div>
          </div>
          <div class="img-editor-footer">
            <button class="btn-secondary btn-sm" id="ie-cancel">Cancel</button>
            <button class="btn-primary btn-sm" id="ie-apply">✓ Apply Crop</button>
          </div>
        </div>
      </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
      bindModalEvents();
    }

    function bindModalEvents() {
      document.getElementById('ie-close').onclick  = close;
      document.getElementById('ie-cancel').onclick = close;
      document.getElementById('ie-apply').onclick  = applyCrop;
      document.getElementById('ie-reset').onclick  = () => { resetState(); draw(); };

      document.getElementById('ie-zoom').oninput = e => {
        zoom = e.target.value / 100;
        document.getElementById('ie-zoom-val').textContent = e.target.value + '%';
        clampPan(); draw();
      };
      document.getElementById('ie-bright').oninput = e => {
        brightness = parseInt(e.target.value);
        document.getElementById('ie-bright-val').textContent = brightness;
        draw();
      };
      document.getElementById('ie-contrast').oninput = e => {
        contrast = parseInt(e.target.value);
        document.getElementById('ie-contrast-val').textContent = contrast;
        draw();
      };

      document.getElementById('ie-ratio-pills').addEventListener('click', e => {
        const pill = e.target.closest('.ratio-pill'); if (!pill) return;
        document.querySelectorAll('.ratio-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        aspectRatio = parseFloat(pill.dataset.ratio);
        resetCropBox(); draw();
      });

      const wrap = document.getElementById('ie-canvas-wrap');
      wrap.addEventListener('mousedown', onMouseDown);
      wrap.addEventListener('mousemove', onMouseMove);
      wrap.addEventListener('mouseup',   onMouseUp);
      wrap.addEventListener('mouseleave',onMouseUp);
      wrap.addEventListener('wheel', e => {
        e.preventDefault();
        const zSlider = document.getElementById('ie-zoom');
        const newVal  = Math.min(400, Math.max(100, parseFloat(zSlider.value) - e.deltaY * 0.2));
        zSlider.value = newVal;
        zoom = newVal / 100;
        document.getElementById('ie-zoom-val').textContent = Math.round(newVal) + '%';
        clampPan(); draw();
      }, { passive: false });
    }

    function onMouseDown(e) { dragging = true; dragStartX = e.clientX; dragStartY = e.clientY; dragStartPanX = panX; dragStartPanY = panY; }
    function onMouseMove(e) {
      if (!dragging) return;
      panX = dragStartPanX + (e.clientX - dragStartX);
      panY = dragStartPanY + (e.clientY - dragStartY);
      clampPan(); draw();
    }
    function onMouseUp() { dragging = false; }

    function clampPan() {
      const wrap = document.getElementById('ie-canvas-wrap');
      if (!wrap || !sourceImg) return;
      const cw = wrap.clientWidth, ch = wrap.clientHeight;
      const sw = sourceImg.naturalWidth * zoom;
      const sh = sourceImg.naturalHeight * zoom;
      const maxPanX = Math.max(0, (sw - cw) / 2);
      const maxPanY = Math.max(0, (sh - ch) / 2);
      panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
      panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
    }

    function resetState() {
      zoom = 1; panX = 0; panY = 0; brightness = 100; contrast = 100;
      const zS = document.getElementById('ie-zoom'); if(zS){zS.value=100;}
      const bS = document.getElementById('ie-bright'); if(bS){bS.value=100;}
      const cS = document.getElementById('ie-contrast'); if(cS){cS.value=100;}
      const zV = document.getElementById('ie-zoom-val'); if(zV)zV.textContent='100%';
      const bV = document.getElementById('ie-bright-val'); if(bV)bV.textContent='100';
      const cV = document.getElementById('ie-contrast-val'); if(cV)cV.textContent='100';
      resetCropBox();
    }

    function resetCropBox() {
      const wrap = document.getElementById('ie-canvas-wrap');
      if (!wrap) return;
      const cw = wrap.clientWidth, ch = wrap.clientHeight;
      const margin = 20;
      if (aspectRatio > 0) {
        const maxW = cw - margin*2, maxH = ch - margin*2;
        if (maxW / aspectRatio <= maxH) {
          cropW = maxW; cropH = cropW / aspectRatio;
        } else {
          cropH = maxH; cropW = cropH * aspectRatio;
        }
      } else {
        cropW = cw - margin*2; cropH = ch - margin*2;
      }
      cropX = (cw - cropW) / 2; cropY = (ch - cropH) / 2;
      updateCropOverlay();
    }

    function updateCropOverlay() {
      const outline = document.getElementById('ie-crop-outline');
      if (!outline) return;
      outline.style.left   = cropX + 'px';
      outline.style.top    = cropY + 'px';
      outline.style.width  = cropW + 'px';
      outline.style.height = cropH + 'px';
    }

    function draw() {
      const canvas = document.getElementById('img-editor-canvas');
      const wrap   = document.getElementById('ie-canvas-wrap');
      if (!canvas || !wrap || !sourceImg) return;
      const cw = wrap.clientWidth, ch = wrap.clientHeight;
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, cw, ch);
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      const sw = sourceImg.naturalWidth * zoom;
      const sh = sourceImg.naturalHeight * zoom;
      const x = (cw - sw) / 2 + panX;
      const y = (ch - sh) / 2 + panY;
      ctx.drawImage(sourceImg, x, y, sw, sh);
      ctx.filter = 'none';
      updateCropOverlay();
    }

    function applyCrop() {
      const canvas = document.getElementById('img-editor-canvas');
      const wrap   = document.getElementById('ie-canvas-wrap');
      if (!canvas || !wrap || !sourceImg) return;

      const cw = wrap.clientWidth, ch = wrap.clientHeight;
      const sw = sourceImg.naturalWidth * zoom;
      const sh = sourceImg.naturalHeight * zoom;
      const imgX = (cw - sw) / 2 + panX;
      const imgY = (ch - sh) / 2 + panY;

      /* Map crop box back to source image pixels */
      const scaleX = sourceImg.naturalWidth / sw;
      const scaleY = sourceImg.naturalHeight / sh;
      const srcX = Math.max(0, (cropX - imgX) * scaleX);
      const srcY = Math.max(0, (cropY - imgY) * scaleY);
      const srcW = Math.min(sourceImg.naturalWidth  - srcX, cropW * scaleX);
      const srcH = Math.min(sourceImg.naturalHeight - srcY, cropH * scaleY);

      const out = document.createElement('canvas');
      out.width  = Math.round(srcW);
      out.height = Math.round(srcH);
      const ctx = out.getContext('2d');
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      ctx.drawImage(sourceImg, srcX, srcY, srcW, srcH, 0, 0, out.width, out.height);

      const dataURL = out.toDataURL('image/jpeg', 0.90);
      close();
      if (pendingCallback) pendingCallback(dataURL);
    }

    function open(imgSrc, callback) {
      buildModal();
      pendingCallback = callback;
      zoom = 1; panX = 0; panY = 0; brightness = 100; contrast = 100;
      /* Reset sliders */
      ['ie-zoom','ie-bright','ie-contrast'].forEach((id,i)=>{
        const el=document.getElementById(id); if(el) el.value=[100,100,100][i];
      });
      ['ie-zoom-val','ie-bright-val','ie-contrast-val'].forEach((id,i)=>{
        const el=document.getElementById(id); if(el) el.textContent=['100%','100','100'][i];
      });
      /* Default to 1:1 */
      aspectRatio = 1;
      document.querySelectorAll('.ratio-pill').forEach((p,i)=>p.classList.toggle('active',i===0));

      sourceImg = new Image();
      sourceImg.onload = () => {
        document.getElementById('img-editor-overlay').classList.add('open');
        setTimeout(() => { resetCropBox(); draw(); }, 50);
      };
      sourceImg.src = imgSrc;
    }

    function close() {
      const ov = document.getElementById('img-editor-overlay');
      if (ov) ov.classList.remove('open');
      pendingCallback = null; sourceImg = null;
    }

    return { open };
  })();

  /* ── Intercept file inputs to inject image editor ── */
  function interceptUploads() {
    /* Wrap the global handleImageUpload to show the editor first */
    const origHandleImageUpload = window.handleImageUpload;
    if (!origHandleImageUpload || window.__imgEditorPatched) return;
    window.__imgEditorPatched = true;

    /* We DON'T replace handleImageUpload (it's inside an IIFE).
       Instead we intercept at the known file-input event binding points
       by patching processProfileFile and processCertUpload at window level. */

    /* Patch processProfileFile: exposed via window by admin.js? Check. */
    /* The functions are inside IIFE so we can't reach them directly.
       The safe hook is to intercept the file input 'change' events
       that fire BEFORE the existing handlers by using capture. */

    function fileInputInterceptor(e) {
      const file = e.target.files[0];
      if (!file) return;
      if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) return; // let existing code show error
      /* Stop the event so existing handler doesn't fire */
      e.stopImmediatePropagation();
      const originalInput = e.target;
      /* Read the file as a data URL, open editor, then invoke original pipeline */
      const reader = new FileReader();
      reader.onload = ev => {
        ImageEditor.open(ev.target.result, croppedDataURL => {
          /* Convert dataURL back to a File-like Blob and re-dispatch a synthetic change */
          fetch(croppedDataURL)
            .then(r => r.blob())
            .then(blob => {
              const croppedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
              /* Create a fresh DataTransfer to carry the cropped file */
              const dt = new DataTransfer();
              dt.items.add(croppedFile);
              originalInput.files = dt.files;
              /* Fire original handler by re-triggering change WITHOUT capture */
              originalInput.dispatchEvent(new Event('change', { bubbles: true }));
            });
        });
      };
      reader.readAsDataURL(file);
    }

    /* Attach in capture phase to intercept before other listeners */
    document.addEventListener('change', e => {
      if (e.target.tagName !== 'INPUT' || e.target.type !== 'file') return;
      if (!e.target.accept || !e.target.accept.includes('image')) return;
      if (e.__isEditorOutput) return; // prevent infinite loop
      fileInputInterceptor(e);
    }, true);
  }

  /* ══════════════════════════════════════════════════════════
     MODULE B — DYNAMIC SECTIONS
  ══════════════════════════════════════════════════════════ */
  const KEY_DYN = 'dynamic-sections';

  function loadDynSections() { return loadJSON(KEY_DYN, []); }
  function saveDynSections(arr) { saveJSON(KEY_DYN, arr); }

  /* ── Panel HTML ── */
  function buildDynPanel() {
    return `
    <div class="panel" id="p-dynamic">
      <div class="panel-title">
        Dynamic Sections
        <button class="btn-primary btn-sm" id="dyn-add-btn">＋ Add Section</button>
      </div>
      <p style="font-size:.72rem;color:rgba(255,255,255,.35);margin-bottom:18px;line-height:1.7">
        Create custom sections without touching code. They render automatically on your portfolio
        between the existing sections, in the order set here.
      </p>
      <div class="drag-hint">⠿ drag to reorder · use edit to manage content</div>
      <div class="dyn-section-list" id="dyn-list"></div>
    </div>`;
  }

  function injectDynPanel() {
    if (document.getElementById('p-dynamic')) return;
    const content = document.getElementById('adm-content');
    if (!content) return;
    content.insertAdjacentHTML('beforeend', buildDynPanel());
  }

  function injectDynNavItem() {
    if (document.querySelector('[data-panel="dynamic"]')) return;
    /* Find the CMS nav group injected by admin-cms.js or create fallback */
    const cmsLabel = [...document.querySelectorAll('.adm-nav-label')].find(el => el.textContent.trim() === 'CMS');
    const insertAfter = cmsLabel?.closest('.adm-nav-group') || document.querySelector('.adm-nav-group:last-child');
    if (!insertAfter) return;
    const item = document.createElement('div');
    item.className = 'adm-nav-item';
    item.dataset.panel = 'dynamic';
    item.innerHTML = '<span class="adm-nav-ico">⊞</span><span>Dynamic Sections</span>';
    /* Insert inside the CMS group, after the last item */
    insertAfter.appendChild(item);
    item.addEventListener('click', () => {
      document.querySelectorAll('.adm-nav-item').forEach(n => n.classList.toggle('active', n === item));
      document.querySelectorAll('.panel').forEach(p => {
        p.classList.remove('active');
        if (p.id === 'p-dynamic') { void p.offsetWidth; p.classList.add('active'); }
      });
      const pt = document.getElementById('page-title');
      const bc = document.getElementById('breadcrumb-sub');
      if (pt) pt.textContent = 'Dynamic Sections';
      if (bc) bc.textContent = 'dynamic';
      document.getElementById('adm-content')?.scrollTo({ top: 0, behavior: 'smooth' });
      renderDynList();
    });
  }

  /* ── Section type display names ── */
  const DYN_TYPE_LABELS = {
    'text':         'Text Block',
    'cards':        'Card Grid',
    'image-text':   'Image + Text',
    'timeline':     'Timeline',
    'gallery':      'Image Gallery',
    'testimonials': 'Testimonials',
    'skills-cards': 'Skills Cards',
    'faq':          'FAQ / Accordion',
  };

  function renderDynList() {
    const list = document.getElementById('dyn-list');
    if (!list) return;
    const sections = loadDynSections();
    if (!sections.length) {
      list.innerHTML = '<p style="font-size:.68rem;color:rgba(255,255,255,.22);text-align:center;padding:28px 0">No dynamic sections yet — click ＋ Add Section above.</p>';
      return;
    }
    list.innerHTML = sections.map((sec, i) => `
      <div class="dyn-row" draggable="true" data-idx="${i}" data-id="${esc(sec.id)}">
        <span class="dyn-drag">⠿</span>
        <div class="dyn-info">
          <div class="dyn-name">${esc(sec.title || 'Untitled')}</div>
          <div class="dyn-meta"># ${esc(sec.id)} · ${(sec.items||sec.content?.items||[]).length||0} items</div>
        </div>
        <span class="dyn-type-badge">${esc(DYN_TYPE_LABELS[sec.type] || sec.type)}</span>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          <label class="sec-vis-toggle" title="Show/Hide">
            <input type="checkbox" ${sec.visible!==false?'checked':''} data-action="toggle" data-idx="${i}"/>
            <div class="sec-vis-track"></div>
          </label>
        </div>
        <div class="dyn-actions">
          <button class="icon-btn" data-action="edit" data-idx="${i}" title="Edit content">✎</button>
          <button class="icon-btn del" data-action="del" data-idx="${i}" title="Delete">✕</button>
        </div>
      </div>`).join('');

    /* Bind actions */
    list.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => editDynSection(parseInt(btn.dataset.idx)));
    });
    list.querySelectorAll('[data-action="del"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const sec = loadDynSections()[idx];
        if (!confirm(`Delete section "${sec?.title || 'this section'}"?`)) return;
        const arr = loadDynSections(); arr.splice(idx, 1);
        saveDynSections(arr); renderDynList(); renderDynOnPortfolio();
        adminToast('Section deleted');
      });
    });
    list.querySelectorAll('[data-action="toggle"]').forEach(chk => {
      chk.addEventListener('change', () => {
        const idx = parseInt(chk.dataset.idx);
        const arr = loadDynSections(); arr[idx].visible = chk.checked;
        saveDynSections(arr); renderDynOnPortfolio();
        adminToast((chk.checked ? 'Showing' : 'Hiding') + ' ' + (arr[idx].title || 'section'));
      });
    });

    initDynDrag(list);
  }

  function initDynDrag(list) {
    let dragIdx = null, overEl = null;
    function clearOver() { if (overEl) { overEl.classList.remove('dyn-over'); overEl = null; } }
    list.addEventListener('dragstart', e => {
      const row = e.target.closest('.dyn-row'); if (!row) return;
      dragIdx = parseInt(row.dataset.idx); row.classList.add('dyn-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    list.addEventListener('dragend', e => {
      e.target.closest('.dyn-row')?.classList.remove('dyn-dragging'); clearOver(); dragIdx = null;
    });
    list.addEventListener('dragover', e => {
      e.preventDefault();
      const row = e.target.closest('.dyn-row');
      if (!row || row === overEl) return; clearOver(); overEl = row; overEl.classList.add('dyn-over');
    });
    list.addEventListener('dragleave', e => { if (!list.contains(e.relatedTarget)) clearOver(); });
    list.addEventListener('drop', e => {
      e.preventDefault();
      const drop = e.target.closest('.dyn-row'); clearOver();
      if (!drop || dragIdx === null) return;
      const dropIdx = parseInt(drop.dataset.idx);
      if (dragIdx === dropIdx) return;
      const arr = loadDynSections();
      const [moved] = arr.splice(dragIdx, 1); arr.splice(dropIdx, 0, moved);
      saveDynSections(arr); renderDynList(); renderDynOnPortfolio(); adminToast('Order saved');
    });
  }

  /* ── Add section ── */
  function bindAddDynSection() {
    const btn = document.getElementById('dyn-add-btn');
    if (!btn || btn.__bound) return; btn.__bound = true;
    btn.addEventListener('click', () => {
      extOpenModal('Add Dynamic Section', `
        <div class="form-grid" style="margin-bottom:14px">
          <div class="form-col">
            <label class="lbl">Section Title *</label>
            <input class="inp" id="m-dyn-title" placeholder="e.g. Testimonials"/>
          </div>
          <div class="form-col">
            <label class="lbl">Section Type</label>
            <select class="sel" id="m-dyn-type">
              ${Object.entries(DYN_TYPE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-col" style="margin-bottom:14px">
          <label class="lbl">Section ID (URL anchor)</label>
          <input class="inp" id="m-dyn-id" placeholder="e.g. testimonials"/>
          <div style="font-size:.58rem;color:rgba(255,255,255,.2);margin-top:4px">Leave blank to auto-generate</div>
        </div>
        <div class="form-col">
          <label class="lbl">Tag Line <span style="opacity:.5">(optional, e.g. "// WHAT PEOPLE SAY")</span></label>
          <input class="inp" id="m-dyn-tag" placeholder="// SECTION TAG"/>
        </div>
      `, () => {
        const title = document.getElementById('m-dyn-title')?.value.trim();
        if (!title) { adminToast('Title is required', 'err'); return; }
        const rawId = document.getElementById('m-dyn-id')?.value.trim();
        const id    = (rawId || title).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'section-' + uid();
        const arr   = loadDynSections();
        if (arr.find(s => s.id === id)) { adminToast('Section ID already exists — choose a different one', 'err'); return; }
        const type  = document.getElementById('m-dyn-type')?.value || 'text';
        const tag   = document.getElementById('m-dyn-tag')?.value.trim() || '';
        const sec   = buildDefaultSection(type, id, title, tag);
        arr.push(sec);
        saveDynSections(arr); renderDynList(); renderDynOnPortfolio();
        adminToast(`Section "${title}" created`);
      });
    });
  }

  function buildDefaultSection(type, id, title, tag) {
    const base = { id, type, title, tag, visible: true };
    switch (type) {
      case 'text':
        return { ...base, content: 'Write your content here. You can add multiple paragraphs.' };
      case 'cards':
        return { ...base, items: [
          { ico:'✦', title:'Feature One',   desc:'Describe this feature in a few words.' },
          { ico:'◈', title:'Feature Two',   desc:'Another highlight worth mentioning.' },
          { ico:'◉', title:'Feature Three', desc:'Something that sets you apart.' },
        ]};
      case 'image-text':
        return { ...base, image: '', imageAlt: title, content: 'Write the text content that appears beside the image here.' };
      case 'timeline':
        return { ...base, items: [
          { date:'2024', title:'Milestone One', desc:'Describe what happened.' },
          { date:'2025', title:'Milestone Two', desc:'Another important step.' },
          { date:'2026', title:'Looking Ahead', desc:'What comes next.' },
        ]};
      case 'gallery':
        return { ...base, items: [] };
      case 'testimonials':
        return { ...base, items: [
          { text:'Working with them was a fantastic experience. Highly recommended!', author:'Jane Doe', role:'Product Manager' },
          { text:'Delivered exceptional results. Clean code and great communication.', author:'John Smith', role:'CTO, Startup' },
        ]};
      case 'skills-cards':
        return { ...base, items: [
          { ico:'⚙️', name:'Skill One',  level: 85 },
          { ico:'🐍', name:'Skill Two',  level: 70 },
          { ico:'🤖', name:'Skill Three',level: 55 },
        ]};
      case 'faq':
        return { ...base, items: [
          { q:'What is your primary skill?',      a:'I specialise in Python and AI/ML development.' },
          { q:'Are you available for freelance?', a:'Yes, I am open to freelance and part-time projects.' },
          { q:'How do I contact you?',            a:'Use the contact section below or email me directly.' },
        ]};
      default:
        return { ...base, content: '' };
    }
  }

  /* ── Edit section content ── */
  function editDynSection(idx) {
    const arr = loadDynSections();
    const sec = arr[idx];
    if (!sec) return;

    /* Meta fields (shared by all types) */
    const metaFields = `
      <div class="form-grid" style="margin-bottom:14px">
        <div class="form-col">
          <label class="lbl">Title</label>
          <input class="inp" id="m-edit-title" value="${esc(sec.title)}"/>
        </div>
        <div class="form-col">
          <label class="lbl">Tag Line</label>
          <input class="inp" id="m-edit-tag" value="${esc(sec.tag||'')}"/>
        </div>
      </div>`;

    let typeFields = '';
    let saveFn;

    if (sec.type === 'text') {
      typeFields = `
        <div class="form-col">
          <label class="lbl">Content</label>
          <textarea class="ta" id="m-edit-content" style="min-height:120px">${esc(sec.content||'')}</textarea>
        </div>`;
      saveFn = () => {
        sec.title = document.getElementById('m-edit-title')?.value.trim() || sec.title;
        sec.tag   = document.getElementById('m-edit-tag')?.value.trim()   || '';
        sec.content = document.getElementById('m-edit-content')?.value    || '';
      };
    }
    else if (sec.type === 'image-text') {
      typeFields = `
        <div class="form-col" style="margin-bottom:12px">
          <label class="lbl">Image URL</label>
          <input class="inp" id="m-edit-img" value="${esc(sec.image||'')}" placeholder="https://..."/>
        </div>
        <div class="form-col">
          <label class="lbl">Text Content</label>
          <textarea class="ta" id="m-edit-content" style="min-height:100px">${esc(sec.content||'')}</textarea>
        </div>`;
      saveFn = () => {
        sec.title   = document.getElementById('m-edit-title')?.value.trim() || sec.title;
        sec.tag     = document.getElementById('m-edit-tag')?.value.trim()   || '';
        sec.image   = document.getElementById('m-edit-img')?.value.trim()   || '';
        sec.content = document.getElementById('m-edit-content')?.value      || '';
      };
    }
    else {
      /* Item-based types: cards, timeline, testimonials, skills-cards, gallery, faq */
      const items = sec.items || [];
      const fieldDefs = getItemFieldDefs(sec.type);
      typeFields = `
        <label class="lbl" style="margin-bottom:8px">Items (${DYN_TYPE_LABELS[sec.type]})</label>
        <div class="dyn-item-list" id="m-edit-items">
          ${items.map((item, i) => buildItemRow(sec.type, item, i, fieldDefs)).join('')}
        </div>
        <button class="dyn-item-add" id="m-edit-add-item">＋ Add Item</button>`;
      saveFn = () => {
        sec.title = document.getElementById('m-edit-title')?.value.trim() || sec.title;
        sec.tag   = document.getElementById('m-edit-tag')?.value.trim()   || '';
        sec.items = collectItems(sec.type, fieldDefs);
      };
    }

    extOpenModal(`Edit: ${sec.title}`, metaFields + typeFields, () => {
      saveFn();
      arr[idx] = sec;
      saveDynSections(arr); renderDynList(); renderDynOnPortfolio();
      adminToast('Section updated');
    });

    /* Bind add-item button after modal opens */
    setTimeout(() => {
      const addBtn = document.getElementById('m-edit-add-item');
      if (!addBtn) return;
      const fieldDefs = getItemFieldDefs(sec.type);
      addBtn.addEventListener('click', () => {
        const list = document.getElementById('m-edit-items');
        const newIdx = list.querySelectorAll('.dyn-item-row').length;
        const empty = buildEmptyItem(sec.type);
        list.insertAdjacentHTML('beforeend', buildItemRow(sec.type, empty, newIdx, fieldDefs));
        bindItemDelBtns();
      });
      bindItemDelBtns();
    }, 80);
  }

  function bindItemDelBtns() {
    document.querySelectorAll('#m-edit-items .dyn-item-del').forEach(btn => {
      if (btn.__bound) return; btn.__bound = true;
      btn.addEventListener('click', () => btn.closest('.dyn-item-row').remove());
    });
  }

  function getItemFieldDefs(type) {
    const defs = {
      'cards':        [{ key:'ico', ph:'✦', w:'50px' }, { key:'title', ph:'Title', w:'1' }, { key:'desc', ph:'Description', w:'2' }],
      'timeline':     [{ key:'date', ph:'2025', w:'80px' }, { key:'title', ph:'Milestone title', w:'1' }, { key:'desc', ph:'Description', w:'2' }],
      'testimonials': [{ key:'text', ph:'Testimonial text…', w:'3' }, { key:'author', ph:'Author', w:'1' }, { key:'role', ph:'Role / Company', w:'1' }],
      'skills-cards': [{ key:'ico', ph:'⚙️', w:'50px' }, { key:'name', ph:'Skill name', w:'2' }, { key:'level', ph:'0-100', w:'60px' }],
      'gallery':      [{ key:'src', ph:'Image URL', w:'1' }, { key:'alt', ph:'Alt text', w:'1' }],
      'faq':          [{ key:'q', ph:'Question…', w:'2' }, { key:'a', ph:'Answer…', w:'3' }],
    };
    return defs[type] || [{ key:'text', ph:'Content', w:'1' }];
  }

  function buildEmptyItem(type) {
    const empties = {
      'cards':        { ico:'✦', title:'', desc:'' },
      'timeline':     { date:'', title:'', desc:'' },
      'testimonials': { text:'', author:'', role:'' },
      'skills-cards': { ico:'⚙️', name:'', level:50 },
      'gallery':      { src:'', alt:'' },
      'faq':          { q:'', a:'' },
    };
    return empties[type] || { text:'' };
  }

  function buildItemRow(type, item, i, fieldDefs) {
    const inputs = fieldDefs.map(f => {
      const flexW = isNaN(f.w) ? `width:${f.w}` : `flex:${f.w}`;
      return `<input style="${flexW};background:transparent;border:none;outline:none;color:rgba(255,255,255,.7);font-size:.78rem;font-family:'Rajdhani',sans-serif;"
               placeholder="${esc(f.ph)}" value="${esc(item[f.key]||'')}"
               data-key="${f.key}" data-idx="${i}"/>`;
    }).join('');
    return `<div class="dyn-item-row" data-row-idx="${i}">
      ${inputs}
      <button class="dyn-item-del" title="Remove">✕</button>
    </div>`;
  }

  function collectItems(type, fieldDefs) {
    const rows = document.querySelectorAll('#m-edit-items .dyn-item-row');
    return Array.from(rows).map(row => {
      const item = {};
      row.querySelectorAll('[data-key]').forEach(inp => {
        item[inp.dataset.key] = inp.value;
      });
      if (type === 'skills-cards') item.level = parseInt(item.level) || 0;
      return item;
    });
  }

  /* ── Render dynamic sections in the portfolio ── */
  function renderDynOnPortfolio() {
    /* On the admin page this is a no-op; the renderer lives in index.html */
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('portfolio-admin-sync');
        bc.postMessage({ type: 'dyn-sections-updated', ts: Date.now() });
        bc.close();
      }
    } catch {}
  }

  /* ══════════════════════════════════════════════════════════
     MODULE C — EXTENDED PRESETS
  ══════════════════════════════════════════════════════════ */
  const EXTENDED_PRESETS = {
    'ext-text': {
      ico: '¶', name: 'Text Block', desc: 'Rich paragraph section with tag line',
      build: () => buildDefaultSection('text', 'text-' + uid(), 'Text Block', '// SECTION'),
    },
    'ext-cards': {
      ico: '⊞', name: 'Feature Cards', desc: '3-column card grid with icons',
      build: () => buildDefaultSection('cards', 'features-' + uid(), 'Features', '// HIGHLIGHTS'),
    },
    'ext-skills': {
      ico: '◎', name: 'Skills Cards', desc: 'Icon + name + progress bar cards',
      build: () => buildDefaultSection('skills-cards', 'skills2-' + uid(), 'Technical Skills', '// EXPERTISE'),
    },
    'ext-testimonials': {
      ico: '❝', name: 'Testimonials', desc: 'Quote cards from collaborators',
      build: () => buildDefaultSection('testimonials', 'testimonials-' + uid(), 'What People Say', '// TESTIMONIALS'),
    },
    'ext-gallery': {
      ico: '⊡', name: 'Image Gallery', desc: 'Responsive grid of images',
      build: () => buildDefaultSection('gallery', 'gallery-' + uid(), 'Gallery', '// GALLERY'),
    },
    'ext-img-text': {
      ico: '◧', name: 'Image + Text', desc: 'Side-by-side image and paragraph',
      build: () => buildDefaultSection('image-text', 'imgtext-' + uid(), 'About This', '// SPOTLIGHT'),
    },
    'ext-timeline': {
      ico: '◷', name: 'Timeline', desc: 'Vertical milestone timeline',
      build: () => buildDefaultSection('timeline', 'timeline2-' + uid(), 'My Story', '// JOURNEY'),
    },
    'ext-faq': {
      ico: '?', name: 'FAQ', desc: 'Accordion-style frequently asked questions',
      build: () => buildDefaultSection('faq', 'faq-' + uid(), 'FAQ', '// QUESTIONS'),
    },
  };

  function injectExtendedPresets() {
    const grid = document.getElementById('preset-grid');
    if (!grid || grid.querySelector('.ext-preset-group-label')) return;

    /* Group label */
    const label = document.createElement('div');
    label.className = 'ext-preset-group-label';
    label.textContent = 'Dynamic Section Presets';
    grid.parentNode.insertBefore(label, grid.nextSibling);

    /* New grid */
    const newGrid = document.createElement('div');
    newGrid.className = 'preset-grid';
    newGrid.id = 'ext-preset-grid';

    Object.entries(EXTENDED_PRESETS).forEach(([key, preset]) => {
      const card = document.createElement('div');
      card.className = 'preset-card';
      card.dataset.extPreset = key;
      card.innerHTML = `
        <div class="preset-card-ico">${preset.ico}</div>
        <div class="preset-card-name">${preset.name}</div>
        <div class="preset-card-desc">${preset.desc}</div>`;
      newGrid.appendChild(card);
    });

    label.after(newGrid);

    newGrid.addEventListener('click', e => {
      const card = e.target.closest('.preset-card'); if (!card) return;
      const key  = card.dataset.extPreset;
      const preset = EXTENDED_PRESETS[key]; if (!preset) return;
      const sec = preset.build();
      const arr = loadDynSections();
      arr.push(sec);
      saveDynSections(arr);
      renderDynOnPortfolio();
      adminToast(`"${sec.title}" added as a dynamic section`);
      /* Switch to dynamic sections panel */
      const dynNavItem = document.querySelector('[data-panel="dynamic"]');
      if (dynNavItem) dynNavItem.click();
    });
  }

  /* ══════════════════════════════════════════════════════════
     MAIN INIT
  ══════════════════════════════════════════════════════════ */
  function init() {
    injectStyles();
    injectDynPanel();
    injectDynNavItem();
    interceptUploads();
    injectExtendedPresets();

    /* Bind add button once panel is visible */
    const observer = new MutationObserver(() => {
      if (document.getElementById('dyn-add-btn')) {
        bindAddDynSection();
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    /* Render list when panel becomes active */
    document.addEventListener('click', e => {
      if (e.target.closest('[data-panel="dynamic"]')) {
        setTimeout(renderDynList, 80);
      }
    });

    console.log('%c✦ Admin Extend v1.0 — Image Editor · Dynamic Sections · Extended Presets',
      'color:#22d3ee;font-family:monospace;font-weight:bold');
  }

  onAdminReady(init);

})();
