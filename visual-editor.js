/* ═══════════════════════════════════════════════════════════════════
   VISUAL-EDITOR.JS  v1.0  — Element-Level Visual Editor
   Extends admin.js without touching it. Zero conflicts.

   Architecture:
   • Self-contained IIFE — exposes nothing to global scope
   • Waits for admin.js to finish (DOMContentLoaded + rAF)
   • Hooks into admin panel open/close via MutationObserver
   • All state in localStorage under key "ve-element-styles"
   • Undo/Redo: in-memory stack (50 steps max)
   • Safe limits enforced on every slider + input
   • Edit mode / Preview mode toggle built-in

   localStorage keys used:
     "ve-element-styles"  — { [data-ve-id]: { prop: value, … } }
   ═══════════════════════════════════════════════════════════════════ */

(function VisualEditor() {
  'use strict';

  /* ── Guard: only run once ── */
  if (window.__veLoaded) return;
  window.__veLoaded = true;

  /* ════════════════════════════════════════════════════════════════
     CONSTANTS & STATE
  ════════════════════════════════════════════════════════════════ */
  const VE_KEY         = 've-element-styles';
  const UNDO_LIMIT     = 50;
  const NO_MOTION      = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Prop limits — min / max / step / unit */
  const PROP_LIMITS = {
    fontSize:     { min: 12,  max: 60,   step: 1,   unit: 'px'  },
    paddingTop:   { min: 0,   max: 100,  step: 1,   unit: 'px'  },
    paddingRight: { min: 0,   max: 100,  step: 1,   unit: 'px'  },
    paddingBottom:{ min: 0,   max: 100,  step: 1,   unit: 'px'  },
    paddingLeft:  { min: 0,   max: 100,  step: 1,   unit: 'px'  },
    marginTop:    { min: -80, max: 100,  step: 1,   unit: 'px'  },
    marginBottom: { min: -80, max: 100,  step: 1,   unit: 'px'  },
    borderRadius: { min: 0,   max: 40,   step: 1,   unit: 'px'  },
    opacity:      { min: 0.1, max: 1,    step: 0.05,unit: ''    },
    lineHeight:   { min: 1,   max: 3,    step: 0.1, unit: ''    },
    letterSpacing:{ min: -2,  max: 10,   step: 0.5, unit: 'px'  },
  };

  let editMode       = false;
  let selectedEl     = null;
  let selectedVeId   = null;
  let previewActive  = false;

  /* Undo / Redo stacks: each entry is a deep-clone of the full styles map */
  let undoStack = [];
  let redoStack = [];

  /* In-memory styles map: { [veId]: { prop: rawValue } }
     rawValue for numeric props is just the number (unit added on apply).
     rawValue for color is hex string. */
  let stylesMap = {};

  /* ════════════════════════════════════════════════════════════════
     STORAGE
  ════════════════════════════════════════════════════════════════ */
  function loadStyles() {
    try { return JSON.parse(localStorage.getItem(VE_KEY)) || {}; }
    catch { return {}; }
  }

  function persistStyles() {
    try { localStorage.setItem(VE_KEY, JSON.stringify(stylesMap)); }
    catch (e) { veToast('Storage limit reached — try resetting some elements', 'error'); }
  }

  /* ════════════════════════════════════════════════════════════════
     UNDO / REDO
  ════════════════════════════════════════════════════════════════ */
  function saveUndoState() {
    const snap = JSON.stringify(stylesMap);
    if (undoStack.length && undoStack[undoStack.length - 1] === snap) return;
    undoStack.push(snap);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
    updateUndoUI();
  }

  function doUndo() {
    if (undoStack.length < 2) return;
    const current = undoStack.pop();
    redoStack.push(current);
    stylesMap = JSON.parse(undoStack[undoStack.length - 1]);
    persistStyles();
    applyAllStyles();
    if (selectedVeId) refreshControlPanel();
    updateUndoUI();
    veToast('Undo ✓');
  }

  function doRedo() {
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(next);
    stylesMap = JSON.parse(next);
    persistStyles();
    applyAllStyles();
    if (selectedVeId) refreshControlPanel();
    updateUndoUI();
    veToast('Redo ✓');
  }

  function updateUndoUI() {
    const undoBtn = document.getElementById('ve-undo');
    const redoBtn = document.getElementById('ve-redo');
    if (undoBtn) undoBtn.disabled = undoStack.length < 2;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  /* ════════════════════════════════════════════════════════════════
     APPLY STYLES TO DOM
  ════════════════════════════════════════════════════════════════ */
  function applyStylesToEl(el, styles) {
    if (!el || !styles) return;
    Object.entries(styles).forEach(([prop, val]) => {
      if (prop === 'color' || prop === 'background') {
        el.style[prop] = val;
      } else if (PROP_LIMITS[prop]) {
        el.style[prop] = val + PROP_LIMITS[prop].unit;
      }
    });
  }

  function applyAllStyles() {
    Object.entries(stylesMap).forEach(([veId, styles]) => {
      const el = document.querySelector(`[data-ve-id="${veId}"]`);
      if (el) applyStylesToEl(el, styles);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     STAMP data-ve-id ONTO EDITABLE ELEMENTS
     Called once on boot + after any DOM re-render by admin.js
  ════════════════════════════════════════════════════════════════ */
  const EDITABLE_SELECTORS = [
    /* Hero */
    { sel: '.h-greet',         id: 've-hero-greet'    },
    { sel: '.h-name',          id: 've-hero-name'     },
    { sel: '.h-desc',          id: 've-hero-desc'     },
    { sel: '.h-badge',         id: 've-hero-badge'    },
    { sel: '.h-btns .btn-p',   id: 've-btn-primary'   },
    { sel: '.h-btns .btn-o',   id: 've-btn-outline'   },
    /* About */
    { sel: '.about-sub-h',     id: 've-about-sub'     },
    { sel: '.about-left p:nth-child(1)', id: 've-about-p1'  },
    { sel: '.about-left p:nth-child(2)', id: 've-about-p2'  },
    /* Section headings */
    { sel: '#about  .stit',    id: 've-about-title'   },
    { sel: '#skills .stit',    id: 've-skills-title'  },
    { sel: '#projects .stit',  id: 've-projects-title'},
    { sel: '#journey .stit',   id: 've-journey-title' },
    { sel: '#certs   .stit',   id: 've-certs-title'   },
    { sel: '#contact h2',      id: 've-contact-title' },
    /* Section tags */
    { sel: '#about   .stag',   id: 've-about-tag'     },
    { sel: '#skills  .stag',   id: 've-skills-tag'    },
    { sel: '#projects .stag',  id: 've-projects-tag'  },
    { sel: '#journey .stag',   id: 've-journey-tag'   },
    { sel: '#certs   .stag',   id: 've-certs-tag'     },
    /* Sections themselves (spacing control) */
    { sel: '#about',           id: 've-sec-about'     },
    { sel: '#skills',          id: 've-sec-skills'    },
    { sel: '#projects',        id: 've-sec-projects'  },
    { sel: '#journey',         id: 've-sec-journey'   },
    { sel: '#certs',           id: 've-sec-certs'     },
    { sel: '#contact',         id: 've-sec-contact'   },
    /* Nav */
    { sel: '#nav',             id: 've-nav'           },
    { sel: '.nav-logo',        id: 've-nav-logo'      },
    /* Contact info */
    { sel: '.ct-inner',        id: 've-contact-inner' },
  ];

  function stampEditableElements() {
    EDITABLE_SELECTORS.forEach(({ sel, id }) => {
      const el = document.querySelector(sel);
      if (el && !el.dataset.veId) {
        el.setAttribute('data-ve-id', id);
        el.setAttribute('data-editable', 'true');
      }
    });
    /* Also stamp skill cards, project cards, journey items dynamically */
    document.querySelectorAll('.sk-card').forEach((el, i) => {
      if (!el.dataset.veId) el.setAttribute('data-ve-id', `ve-sk-card-${i}`);
      el.setAttribute('data-editable', 'true');
    });
    document.querySelectorAll('.pj').forEach((el, i) => {
      if (!el.dataset.veId) el.setAttribute('data-ve-id', `ve-pj-${i}`);
      el.setAttribute('data-editable', 'true');
    });
    document.querySelectorAll('.vtl-card').forEach((el, i) => {
      if (!el.dataset.veId) el.setAttribute('data-ve-id', `ve-vtl-${i}`);
      el.setAttribute('data-editable', 'true');
    });
    document.querySelectorAll('.ach-card').forEach((el, i) => {
      if (!el.dataset.veId) el.setAttribute('data-ve-id', `ve-ach-${i}`);
      el.setAttribute('data-editable', 'true');
    });
    document.querySelectorAll('.about-card').forEach((el, i) => {
      if (!el.dataset.veId) el.setAttribute('data-ve-id', `ve-about-card-${i}`);
      el.setAttribute('data-editable', 'true');
    });
    document.querySelectorAll('.cg-card').forEach((el, i) => {
      if (!el.dataset.veId) el.setAttribute('data-ve-id', `ve-cg-${i}`);
      el.setAttribute('data-editable', 'true');
    });
  }

  /* ════════════════════════════════════════════════════════════════
     INJECT CSS
  ════════════════════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('ve-css')) return;
    const style = document.createElement('style');
    style.id = 've-css';
    style.textContent = `
/* ── Visual Editor CSS ── */

/* Edit mode highlight on hover */
body.edit-mode [data-editable="true"] {
  cursor: crosshair !important;
  position: relative;
}
body.edit-mode [data-editable="true"]::after {
  content: '';
  position: absolute;
  inset: -2px;
  border: 1px dashed rgba(79,110,245,0.35);
  border-radius: 4px;
  pointer-events: none;
  z-index: 9999;
  transition: border-color 0.2s;
}
body.edit-mode [data-editable="true"]:hover::after {
  border-color: var(--acc);
  border-style: solid;
}
/* Selected element */
.ve-selected {
  outline: 2px solid var(--acc) !important;
  outline-offset: 2px !important;
}
body.edit-mode .ve-selected::after {
  border: none !important;
}

/* Edit mode floating badge */
#ve-mode-badge {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 99999;
  background: var(--acc);
  color: #000;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.50rem;
  font-weight: 700;
  letter-spacing: 2px;
  padding: 7px 14px;
  border-radius: 20px;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1);
  display: none;
  user-select: none;
  transition: opacity 0.2s, transform 0.2s;
}
#ve-mode-badge:hover { opacity: 0.85; transform: translateY(-1px); }

/* VE Sidebar Panel */
#ve-sidebar {
  position: fixed;
  top: 0; right: 0;
  width: 300px;
  height: 100vh;
  z-index: 99998;
  background: rgba(6,6,14,0.97);
  border-left: 1px solid rgba(255,255,255,0.07);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  transform: translateX(105%);
  transition: transform 0.35s cubic-bezier(0.4,0,0.2,1);
  font-family: 'Rajdhani', sans-serif;
  overflow: hidden;
}
#ve-sidebar.ve-open {
  transform: translateX(0);
}

/* VE Sidebar Header */
.ve-hdr {
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.ve-hdr-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.56rem;
  font-weight: 700;
  letter-spacing: 3px;
  color: var(--acc);
  text-transform: uppercase;
}
.ve-hdr-close {
  width: 26px; height: 26px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: rgba(255,255,255,0.5);
  font-size: 0.75rem;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.2s, color 0.2s;
}
.ve-hdr-close:hover { background: rgba(255,255,255,0.12); color: #fff; }

/* Selected element info */
.ve-sel-info {
  padding: 10px 18px;
  background: rgba(255,255,255,0.025);
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
}
.ve-sel-label {
  font-family: 'Space Mono', monospace;
  font-size: 0.50rem;
  letter-spacing: 1.5px;
  color: rgba(255,255,255,0.25);
  text-transform: uppercase;
  margin-bottom: 3px;
}
.ve-sel-id {
  font-family: 'Space Mono', monospace;
  font-size: 0.62rem;
  color: var(--acc);
  letter-spacing: 0.5px;
}
.ve-sel-none {
  font-size: 0.68rem;
  color: rgba(255,255,255,0.22);
  font-style: italic;
}

/* Scrollable controls area */
.ve-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 18px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.1) transparent;
}
.ve-body::-webkit-scrollbar { width: 3px; }
.ve-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

/* Control group */
.ve-group {
  margin-bottom: 20px;
}
.ve-group-title {
  font-family: 'Space Mono', monospace;
  font-size: 0.48rem;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.22);
  text-transform: uppercase;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

/* Row with label + slider + number */
.ve-row {
  display: grid;
  grid-template-columns: 80px 1fr 46px;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
}
.ve-lbl {
  font-size: 0.62rem;
  color: rgba(200,205,230,0.65);
  white-space: nowrap;
}
.ve-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  border-radius: 2px;
  background: rgba(255,255,255,0.1);
  outline: none;
  cursor: pointer;
}
.ve-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--acc);
  cursor: pointer;
  box-shadow: 0 0 0 2px rgba(0,0,0,0.4);
  transition: transform 0.15s;
}
.ve-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
.ve-slider::-moz-range-thumb {
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--acc);
  cursor: pointer;
  border: none;
}
.ve-num {
  width: 46px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: var(--text, #dde0f0);
  font-family: 'Space Mono', monospace;
  font-size: 0.58rem;
  padding: 4px 6px;
  text-align: center;
  outline: none;
  transition: border-color 0.2s;
}
.ve-num:focus { border-color: var(--acc); }

/* Color row */
.ve-color-row {
  display: grid;
  grid-template-columns: 80px 1fr 36px;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
}
.ve-color-hex {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: var(--text, #dde0f0);
  font-family: 'Space Mono', monospace;
  font-size: 0.58rem;
  padding: 5px 8px;
  outline: none;
  transition: border-color 0.2s;
  width: 100%;
}
.ve-color-hex:focus { border-color: var(--acc); }
.ve-color-swatch {
  width: 34px; height: 30px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.12);
  cursor: pointer;
  overflow: hidden;
  padding: 0;
}

/* Text toggle row */
.ve-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
}
.ve-toggle-lbl {
  font-size: 0.62rem;
  color: rgba(200,205,230,0.65);
}
.ve-toggle {
  position: relative;
  width: 34px; height: 18px;
  cursor: pointer;
}
.ve-toggle input { opacity: 0; width: 0; height: 0; }
.ve-toggle-track {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.12);
  border-radius: 9px;
  transition: background 0.25s;
}
.ve-toggle input:checked + .ve-toggle-track { background: var(--acc); }
.ve-toggle-track::after {
  content: '';
  position: absolute;
  top: 2px; left: 2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.25s;
}
.ve-toggle input:checked + .ve-toggle-track::after { transform: translateX(16px); }

/* Divider */
.ve-divider {
  height: 1px;
  background: rgba(255,255,255,0.05);
  margin: 14px 0;
}

/* Footer actions */
.ve-footer {
  padding: 12px 18px;
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}
.ve-footer-row {
  display: flex;
  gap: 6px;
}
.ve-btn {
  flex: 1;
  padding: 7px 10px;
  border-radius: 7px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.7);
  transition: background 0.2s, color 0.2s, border-color 0.2s;
  text-align: center;
}
.ve-btn:hover { background: rgba(255,255,255,0.1); color: #fff; border-color: rgba(255,255,255,0.14); }
.ve-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.ve-btn.ve-btn-acc {
  background: var(--acc);
  color: #000;
  border-color: transparent;
  font-weight: 700;
}
.ve-btn.ve-btn-acc:hover { opacity: 0.85; }
.ve-btn.ve-btn-danger {
  border-color: rgba(248,113,113,0.25);
  color: #f87171;
}
.ve-btn.ve-btn-danger:hover { background: rgba(248,113,113,0.12); border-color: #f87171; }

/* Toast */
#ve-toast {
  position: fixed;
  bottom: 80px;
  right: 24px;
  z-index: 999999;
  background: rgba(13,17,23,0.95);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 10px 16px;
  font-family: 'Rajdhani', sans-serif;
  font-size: 0.72rem;
  color: #dde0f0;
  pointer-events: none;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.25s, transform 0.25s;
  max-width: 240px;
}
#ve-toast.show {
  opacity: 1;
  transform: translateY(0);
}
#ve-toast.success { border-left: 3px solid #56d364; }
#ve-toast.error   { border-left: 3px solid #f87171; }
#ve-toast.info    { border-left: 3px solid var(--acc); }

/* No element selected placeholder */
.ve-empty {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255,255,255,0.18);
  font-size: 0.72rem;
  line-height: 1.8;
}
.ve-empty-ico {
  font-size: 1.8rem;
  display: block;
  margin-bottom: 12px;
  opacity: 0.4;
}

/* contenteditable highlight */
[contenteditable="true"]:focus {
  outline: 2px solid var(--acc) !important;
  outline-offset: 2px !important;
  border-radius: 3px;
}

/* Pill showing element label on hover in edit mode */
body.edit-mode [data-editable="true"]:hover > .ve-label-pill,
body.edit-mode [data-editable="true"]:hover .ve-label-pill {
  opacity: 1;
}
.ve-label-pill {
  position: absolute;
  top: -20px; left: 0;
  background: var(--acc);
  color: #000;
  font-family: 'Space Mono', monospace;
  font-size: 0.42rem;
  letter-spacing: 1px;
  padding: 2px 6px;
  border-radius: 3px;
  pointer-events: none;
  z-index: 99999;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s;
}

/* Preview mode overlay */
#ve-preview-bar {
  position: fixed;
  top: 0; left: 0; right: 0;
  z-index: 999999;
  background: rgba(79,110,245,0.9);
  color: #fff;
  font-family: 'Orbitron', sans-serif;
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: 3px;
  text-align: center;
  padding: 8px;
  cursor: pointer;
  display: none;
  user-select: none;
}
#ve-preview-bar:hover { opacity: 0.85; }

/* ── Add Visual Editor nav item in admin sidebar ── */
.adm-nav-item[data-panel="visual-editor"] .adm-ico {
  color: var(--acc);
}

/* ── Reset confirmation mini modal ── */
#ve-reset-modal {
  position: fixed;
  inset: 0;
  z-index: 999999;
  background: rgba(0,0,0,0.7);
  display: none;
  align-items: center;
  justify-content: center;
}
#ve-reset-modal.show { display: flex; }
.ve-reset-box {
  background: rgba(13,13,28,0.98);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  padding: 32px 28px;
  width: min(340px, 92vw);
  text-align: center;
  font-family: 'Rajdhani', sans-serif;
}
.ve-reset-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.65rem;
  letter-spacing: 2px;
  color: #f87171;
  margin-bottom: 10px;
}
.ve-reset-msg {
  font-size: 0.75rem;
  color: rgba(255,255,255,0.5);
  line-height: 1.6;
  margin-bottom: 20px;
}
.ve-reset-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

@media (prefers-reduced-motion: reduce) {
  #ve-sidebar { transition: none !important; }
  .ve-slider::-webkit-slider-thumb { transition: none !important; }
  #ve-toast { transition: none !important; }
}
    `;
    document.head.appendChild(style);
  }

  /* ════════════════════════════════════════════════════════════════
     TOAST
  ════════════════════════════════════════════════════════════════ */
  let _veToastTimer = null;
  function veToast(msg, type = 'success') {
    let el = document.getElementById('ve-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 've-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = `show ${type}`;
    clearTimeout(_veToastTimer);
    _veToastTimer = setTimeout(() => { el.className = ''; }, 2200);
  }

  /* ════════════════════════════════════════════════════════════════
     BUILD SIDEBAR UI
  ════════════════════════════════════════════════════════════════ */
  function buildSidebar() {
    if (document.getElementById('ve-sidebar')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 've-sidebar';
    sidebar.innerHTML = `
      <div class="ve-hdr">
        <div class="ve-hdr-title">✦ Visual Editor</div>
        <button class="ve-hdr-close" id="ve-close-btn" title="Close editor">✕</button>
      </div>
      <div class="ve-sel-info" id="ve-sel-info">
        <div class="ve-sel-label">Selected element</div>
        <div class="ve-sel-none" id="ve-sel-none">Click any element on the page →</div>
        <div class="ve-sel-id" id="ve-sel-id" style="display:none"></div>
      </div>
      <div class="ve-body" id="ve-body">
        <div class="ve-empty">
          <span class="ve-empty-ico">◎</span>
          Click any element on the portfolio<br>to select and style it
        </div>
      </div>
      <div class="ve-footer">
        <div class="ve-footer-row">
          <button class="ve-btn" id="ve-undo" disabled title="Undo (Ctrl+Z)">↩ Undo</button>
          <button class="ve-btn" id="ve-redo" disabled title="Redo (Ctrl+Y)">↪ Redo</button>
        </div>
        <div class="ve-footer-row">
          <button class="ve-btn ve-btn-acc" id="ve-save-btn">💾 Save All</button>
          <button class="ve-btn" id="ve-preview-btn">👁 Preview</button>
        </div>
        <div class="ve-footer-row">
          <button class="ve-btn ve-btn-danger" id="ve-reset-el-btn" disabled>↺ Reset Element</button>
          <button class="ve-btn ve-btn-danger" id="ve-reset-all-btn">⊘ Reset All</button>
        </div>
      </div>
    `;
    document.body.appendChild(sidebar);

    /* Mode badge (floating, bottom-right) */
    const badge = document.createElement('div');
    badge.id = 've-mode-badge';
    badge.textContent = '◎ EDIT MODE ACTIVE';
    badge.onclick = () => exitEditMode();
    document.body.appendChild(badge);

    /* Preview bar */
    const prevBar = document.createElement('div');
    prevBar.id = 've-preview-bar';
    prevBar.textContent = '⬡ PREVIEW MODE — CLICK TO RETURN TO EDITOR';
    prevBar.onclick = exitPreviewMode;
    document.body.appendChild(prevBar);

    /* Reset modal */
    const resetModal = document.createElement('div');
    resetModal.id = 've-reset-modal';
    resetModal.innerHTML = `
      <div class="ve-reset-box">
        <div class="ve-reset-title">⚠ RESET ALL STYLES?</div>
        <div class="ve-reset-msg">This will remove all visual editor customizations from the entire site. This action cannot be undone.</div>
        <div class="ve-reset-actions">
          <button class="ve-btn" id="ve-reset-cancel">Cancel</button>
          <button class="ve-btn ve-btn-danger" id="ve-reset-confirm">Yes, Reset All</button>
        </div>
      </div>
    `;
    document.body.appendChild(resetModal);

    /* Bind sidebar controls */
    document.getElementById('ve-close-btn').onclick   = exitEditMode;
    document.getElementById('ve-save-btn').onclick    = saveAndToast;
    document.getElementById('ve-preview-btn').onclick = enterPreviewMode;
    document.getElementById('ve-undo').onclick        = doUndo;
    document.getElementById('ve-redo').onclick        = doRedo;

    document.getElementById('ve-reset-el-btn').onclick = () => {
      if (!selectedVeId) return;
      delete stylesMap[selectedVeId];
      persistStyles();
      if (selectedEl) selectedEl.removeAttribute('style');
      refreshControlPanel();
      veToast('Element reset ✓');
    };

    document.getElementById('ve-reset-all-btn').onclick = () => {
      document.getElementById('ve-reset-modal').classList.add('show');
    };
    document.getElementById('ve-reset-cancel').onclick = () => {
      document.getElementById('ve-reset-modal').classList.remove('show');
    };
    document.getElementById('ve-reset-confirm').onclick = () => {
      document.getElementById('ve-reset-modal').classList.remove('show');
      resetAll();
    };

    /* Keyboard: Ctrl+Z / Ctrl+Y when edit mode active */
    document.addEventListener('keydown', e => {
      if (!editMode) return;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); doUndo(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); doRedo(); }
    });
  }

  /* ════════════════════════════════════════════════════════════════
     CONTROL PANEL — build slider/picker controls for selected el
  ════════════════════════════════════════════════════════════════ */
  function getElStyles(veId) {
    return stylesMap[veId] || {};
  }

  function getComputedProp(el, cssProp) {
    try {
      const cs = getComputedStyle(el);
      const val = cs[cssProp];
      if (!val) return null;
      /* Parse numeric value */
      const num = parseFloat(val);
      return isNaN(num) ? val : num;
    } catch { return null; }
  }

  function getCurrentValue(veId, prop, el) {
    const stored = (stylesMap[veId] || {})[prop];
    if (stored !== undefined) return stored;
    if (!el) return null;
    const computed = getComputedProp(el, prop);
    return computed;
  }

  function buildSliderRow(veId, el, prop, label) {
    const limits = PROP_LIMITS[prop];
    if (!limits) return '';
    let val = getCurrentValue(veId, prop, el);
    if (val === null || isNaN(parseFloat(val))) val = limits.min;
    val = Math.max(limits.min, Math.min(limits.max, parseFloat(val)));

    const id = `ve-ctrl-${prop}`;
    return `
      <div class="ve-row">
        <span class="ve-lbl">${label}</span>
        <input type="range" class="ve-slider" id="${id}-range"
          min="${limits.min}" max="${limits.max}" step="${limits.step}" value="${val}"/>
        <input type="number" class="ve-num" id="${id}-num"
          min="${limits.min}" max="${limits.max}" step="${limits.step}" value="${val}"/>
      </div>`;
  }

  function buildColorRow(veId, el, prop, label) {
    let val = getCurrentValue(veId, prop, el);
    if (!val || typeof val !== 'string' || !val.startsWith('#')) {
      /* Try to convert rgb to hex */
      try {
        const cs = getComputedStyle(el);
        const rgb = cs[prop];
        if (rgb && rgb.startsWith('rgb')) {
          const m = rgb.match(/\d+/g);
          if (m) val = '#' + m.slice(0,3).map(n => parseInt(n).toString(16).padStart(2,'0')).join('');
        }
      } catch {}
    }
    if (!val || !val.startsWith('#')) val = '#ffffff';
    const id = `ve-ctrl-${prop}`;
    return `
      <div class="ve-color-row">
        <span class="ve-lbl">${label}</span>
        <input type="text" class="ve-color-hex" id="${id}-hex" value="${val}" placeholder="#ffffff" maxlength="7"/>
        <input type="color" class="ve-color-swatch" id="${id}-swatch" value="${val}"/>
      </div>`;
  }

  function buildTextEditRow(el) {
    const hasText = el && el.textContent.trim().length > 0 &&
      !['SECTION','NAV','DIV'].includes(el.tagName) ||
      (el && el.children.length === 0);
    if (!hasText) return '';
    const isEditing = el.isContentEditable;
    return `
      <div class="ve-toggle-row">
        <span class="ve-toggle-lbl">Inline Text Edit</span>
        <label class="ve-toggle">
          <input type="checkbox" id="ve-text-toggle" ${isEditing ? 'checked' : ''}/>
          <div class="ve-toggle-track"></div>
        </label>
      </div>`;
  }

  function refreshControlPanel() {
    const body = document.getElementById('ve-body');
    if (!body) return;

    /* Update selected info bar */
    const noneEl = document.getElementById('ve-sel-none');
    const idEl   = document.getElementById('ve-sel-id');
    const resetElBtn = document.getElementById('ve-reset-el-btn');

    if (!selectedVeId || !selectedEl) {
      if (noneEl) { noneEl.style.display = ''; noneEl.textContent = 'Click any element on the page →'; }
      if (idEl)   idEl.style.display = 'none';
      if (resetElBtn) resetElBtn.disabled = true;
      body.innerHTML = `
        <div class="ve-empty">
          <span class="ve-empty-ico">◎</span>
          Click any element on the portfolio<br>to select and style it
        </div>`;
      return;
    }

    if (noneEl) noneEl.style.display = 'none';
    if (idEl) { idEl.style.display = ''; idEl.textContent = selectedVeId; }
    if (resetElBtn) resetElBtn.disabled = false;

    const veId = selectedVeId;
    const el   = selectedEl;
    const isSection = ['SECTION','ARTICLE'].includes(el.tagName);
    const isText = !isSection && el.children.length === 0 ||
      ['H1','H2','H3','H4','P','SPAN','DIV','A','BUTTON'].includes(el.tagName);

    body.innerHTML = `
      ${isText ? `
      <div class="ve-group">
        <div class="ve-group-title">Text</div>
        ${buildTextEditRow(el)}
        ${buildSliderRow(veId, el, 'fontSize',     'Font size')}
        ${buildSliderRow(veId, el, 'letterSpacing', 'Letter sp.')}
        ${buildSliderRow(veId, el, 'lineHeight',    'Line height')}
      </div>
      <div class="ve-divider"></div>
      ` : ''}

      <div class="ve-group">
        <div class="ve-group-title">Color</div>
        ${buildColorRow(veId, el, 'color',      'Text color')}
        ${!isSection ? buildColorRow(veId, el, 'background', 'Background') : ''}
      </div>
      <div class="ve-divider"></div>

      <div class="ve-group">
        <div class="ve-group-title">Spacing</div>
        ${buildSliderRow(veId, el, 'paddingTop',    'Pad top')}
        ${buildSliderRow(veId, el, 'paddingBottom', 'Pad btm')}
        ${buildSliderRow(veId, el, 'paddingLeft',   'Pad left')}
        ${buildSliderRow(veId, el, 'paddingRight',  'Pad right')}
        ${buildSliderRow(veId, el, 'marginTop',     'Margin top')}
        ${buildSliderRow(veId, el, 'marginBottom',  'Margin btm')}
      </div>
      <div class="ve-divider"></div>

      <div class="ve-group">
        <div class="ve-group-title">Shape & Opacity</div>
        ${buildSliderRow(veId, el, 'borderRadius', 'Radius')}
        ${buildSliderRow(veId, el, 'opacity',      'Opacity')}
      </div>
    `;

    bindControlEvents(veId, el);
  }

  /* ════════════════════════════════════════════════════════════════
     BIND CONTROL EVENTS — sliders / pickers / text toggle
  ════════════════════════════════════════════════════════════════ */
  function bindControlEvents(veId, el) {
    /* Numeric sliders */
    Object.keys(PROP_LIMITS).forEach(prop => {
      const rangeEl = document.getElementById(`ve-ctrl-${prop}-range`);
      const numEl   = document.getElementById(`ve-ctrl-${prop}-num`);
      if (!rangeEl || !numEl) return;

      const limits = PROP_LIMITS[prop];

      function applyNumProp(rawVal) {
        let v = parseFloat(rawVal);
        if (isNaN(v)) return;
        v = Math.max(limits.min, Math.min(limits.max, v));
        /* Snap to step */
        v = Math.round(v / limits.step) * limits.step;
        v = parseFloat(v.toFixed(2));

        /* Sync UI */
        rangeEl.value = v;
        numEl.value   = v;

        /* Apply live */
        el.style[prop] = v + limits.unit;

        /* Store */
        if (!stylesMap[veId]) stylesMap[veId] = {};
        stylesMap[veId][prop] = v;
      }

      let _debounce = null;
      function scheduleUndo() {
        clearTimeout(_debounce);
        _debounce = setTimeout(saveUndoState, 400);
      }

      rangeEl.addEventListener('input',  e => { applyNumProp(e.target.value); scheduleUndo(); });
      numEl.addEventListener('input',    e => { applyNumProp(e.target.value); scheduleUndo(); });
      numEl.addEventListener('blur',     e => { applyNumProp(e.target.value); saveUndoState(); });
      numEl.addEventListener('keydown',  e => {
        if (e.key === 'Enter') { applyNumProp(e.target.value); saveUndoState(); }
        if (e.key === 'ArrowUp')   { e.preventDefault(); applyNumProp(parseFloat(numEl.value) + limits.step); saveUndoState(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); applyNumProp(parseFloat(numEl.value) - limits.step); saveUndoState(); }
      });
    });

    /* Color pickers */
    ['color','background'].forEach(prop => {
      const hexEl    = document.getElementById(`ve-ctrl-${prop}-hex`);
      const swatchEl = document.getElementById(`ve-ctrl-${prop}-swatch`);
      if (!hexEl || !swatchEl) return;

      function applyColor(hex) {
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
        el.style[prop] = hex;
        hexEl.value    = hex;
        swatchEl.value = hex;
        if (!stylesMap[veId]) stylesMap[veId] = {};
        stylesMap[veId][prop] = hex;
      }

      swatchEl.addEventListener('input',  e => { applyColor(e.target.value); saveUndoState(); });
      hexEl.addEventListener('input', e => {
        const v = e.target.value;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) { applyColor(v); saveUndoState(); }
        else if (v.length >= 7) { hexEl.style.borderColor = '#f87171'; }
        else { hexEl.style.borderColor = ''; }
      });
      hexEl.addEventListener('blur', e => {
        hexEl.style.borderColor = '';
        const v = e.target.value;
        if (/^#[0-9a-fA-F]{6}$/.test(v)) applyColor(v);
      });
    });

    /* Inline text edit toggle */
    const textToggle = document.getElementById('ve-text-toggle');
    if (textToggle) {
      textToggle.addEventListener('change', e => {
        if (e.target.checked) {
          el.setAttribute('contenteditable', 'true');
          el.focus();
          el.addEventListener('input', onTextInput, { once: false });
          el.__veTextBound = true;
        } else {
          el.removeAttribute('contenteditable');
          el.blur();
          if (el.__veTextBound) {
            el.removeEventListener('input', onTextInput);
            el.__veTextBound = false;
          }
        }
      });

      function onTextInput() {
        /* Save text to stylesMap as special key */
        if (!stylesMap[veId]) stylesMap[veId] = {};
        stylesMap[veId].__text = el.innerHTML;
        saveUndoState();
        persistStyles();
      }
    }
  }

  /* ════════════════════════════════════════════════════════════════
     ELEMENT SELECTION — click handler in edit mode
  ════════════════════════════════════════════════════════════════ */
  function handleEditClick(e) {
    if (!editMode) return;

    /* Ignore clicks inside the VE sidebar itself */
    const sidebar = document.getElementById('ve-sidebar');
    if (sidebar && sidebar.contains(e.target)) return;

    /* Ignore admin overlay */
    const admOverlay = document.getElementById('adm-overlay');
    if (admOverlay && admOverlay.contains(e.target)) return;

    /* Find closest editable ancestor */
    const target = e.target.closest('[data-editable="true"]');
    if (!target) {
      /* Click on non-editable area → deselect */
      clearSelection();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    selectElement(target);
  }

  function selectElement(el) {
    /* Deselect previous */
    if (selectedEl && selectedEl !== el) {
      selectedEl.classList.remove('ve-selected');
      if (selectedEl.isContentEditable) {
        selectedEl.removeAttribute('contenteditable');
        if (selectedEl.__veTextBound) {
          selectedEl.removeEventListener('input', () => {});
          selectedEl.__veTextBound = false;
        }
      }
    }

    selectedEl    = el;
    selectedVeId  = el.dataset.veId;

    el.classList.add('ve-selected');

    /* Open sidebar if not already open */
    const sidebar = document.getElementById('ve-sidebar');
    if (sidebar) sidebar.classList.add('ve-open');

    refreshControlPanel();
  }

  function clearSelection() {
    if (selectedEl) {
      selectedEl.classList.remove('ve-selected');
      if (selectedEl.isContentEditable) {
        selectedEl.removeAttribute('contenteditable');
      }
    }
    selectedEl   = null;
    selectedVeId = null;
    refreshControlPanel();
  }

  /* ════════════════════════════════════════════════════════════════
     EDIT MODE — enter / exit
  ════════════════════════════════════════════════════════════════ */
  function enterEditMode() {
    editMode = true;
    window.isAdminMode = true;          /* bridge flag for external systems */
    document.body.classList.add('edit-mode');
    stampEditableElements();

    const badge   = document.getElementById('ve-mode-badge');
    const sidebar = document.getElementById('ve-sidebar');

    if (badge)   badge.style.display = 'block';
    if (sidebar) sidebar.classList.add('ve-open');

    /* Capture click on the whole doc to intercept editable clicks */
    document.addEventListener('click', handleEditClick, true);

    veToast('Edit mode active — click any element', 'info');
    updateUndoUI();
  }

  function exitEditMode() {
    editMode = false;
    window.isAdminMode = false;         /* bridge flag for external systems */
    document.body.classList.remove('edit-mode');
    clearSelection();

    const badge   = document.getElementById('ve-mode-badge');
    const sidebar = document.getElementById('ve-sidebar');

    if (badge)   badge.style.display = 'none';
    if (sidebar) sidebar.classList.remove('ve-open');

    document.removeEventListener('click', handleEditClick, true);

    /* Persist on exit */
    persistStyles();
  }

  /* ════════════════════════════════════════════════════════════════
     PREVIEW MODE
  ════════════════════════════════════════════════════════════════ */
  function enterPreviewMode() {
    previewActive = true;
    exitEditMode();
    const bar = document.getElementById('ve-preview-bar');
    if (bar) bar.style.display = 'block';
    veToast('Preview mode — click the bar to return', 'info');
  }

  function exitPreviewMode() {
    previewActive = false;
    const bar = document.getElementById('ve-preview-bar');
    if (bar) bar.style.display = 'none';
    enterEditMode();
  }

  /* ════════════════════════════════════════════════════════════════
     SAVE & RESET
  ════════════════════════════════════════════════════════════════ */
  function saveAndToast() {
    persistStyles();
    saveUndoState();
    veToast('Visual styles saved ✓');
  }

  function resetAll() {
    stylesMap = {};
    persistStyles();
    undoStack = [];
    redoStack = [];
    updateUndoUI();
    /* Remove inline styles from all stamped elements */
    document.querySelectorAll('[data-ve-id]').forEach(el => {
      el.removeAttribute('style');
    });
    clearSelection();
    veToast('All visual styles reset ✓');
  }

  /* ════════════════════════════════════════════════════════════════
     RESTORE SAVED TEXT CONTENT
  ════════════════════════════════════════════════════════════════ */
  function applyAllTextContent() {
    Object.entries(stylesMap).forEach(([veId, styles]) => {
      if (styles.__text !== undefined) {
        const el = document.querySelector(`[data-ve-id="${veId}"]`);
        if (el && !el.isContentEditable) el.innerHTML = styles.__text;
      }
    });
  }

  /* ════════════════════════════════════════════════════════════════
     INJECT VISUAL EDITOR NAV ITEM INTO ADMIN SIDEBAR
     Waits for the admin overlay to appear, then injects the nav item
  ════════════════════════════════════════════════════════════════ */
  function injectAdminNavItem() {
    const sidebar = document.querySelector('.adm-sidebar');
    if (!sidebar || sidebar.querySelector('[data-panel="visual-editor"]')) return;

    /* Find the "System" label — insert before it */
    const systemLabel = [...sidebar.querySelectorAll('.adm-nav-label')]
      .find(el => el.textContent.trim() === 'System');

    const item = document.createElement('div');
    item.className = 'adm-nav-item';
    item.dataset.panel = 'visual-editor';
    item.innerHTML = `<span class="adm-ico" style="color:var(--acc)">◈</span><span>Visual Editor</span>`;
    item.addEventListener('click', () => {
      /* Highlight nav item */
      document.querySelectorAll('.adm-nav-item').forEach(n =>
        n.classList.toggle('adm-active', n === item));
      /* Activate the panel */
      document.querySelectorAll('.adm-panel').forEach(p =>
        p.classList.remove('adm-active'));
      const vePanel = document.getElementById('admp-visual-editor');
      if (vePanel) vePanel.classList.add('adm-active');
      /* Update topbar */
      const tb = document.getElementById('adm-topbar-title');
      if (tb) tb.textContent = 'Visual Editor';
      /* Enter edit mode if not already */
      if (!editMode) enterEditMode();
    });

    if (systemLabel) {
      sidebar.insertBefore(item, systemLabel);
    } else {
      /* Fallback: append before footer */
      const footer = sidebar.querySelector('.adm-sidebar-footer');
      if (footer) sidebar.insertBefore(item, footer);
      else sidebar.appendChild(item);
    }

    /* Build the VE admin panel */
    injectAdminPanel();
  }

  /* ════════════════════════════════════════════════════════════════
     ADMIN PANEL CONTENT (rendered inside adm-content area)
  ════════════════════════════════════════════════════════════════ */
  function injectAdminPanel() {
    const content = document.getElementById('adm-content');
    if (!content || document.getElementById('admp-visual-editor')) return;

    const panel = document.createElement('div');
    panel.className = 'adm-panel';
    panel.id = 'admp-visual-editor';
    panel.innerHTML = `
      <div class="adm-section-title">Visual Editor</div>

      <div class="adm-group">
        <div class="adm-group-title">Edit Mode</div>
        <p style="font-size:0.68rem;color:rgba(255,255,255,0.28);margin-bottom:14px;line-height:1.7">
          Activate edit mode to click any element on the portfolio and customize its styles live — font size, color, spacing, border radius, opacity, and inline text.
        </p>
        <button class="adm-btn-primary" id="admp-ve-enter-btn" style="width:100%;margin-bottom:10px">
          ◎ Enter Edit Mode
        </button>
        <button class="adm-btn-sm adm-btn-preview" id="admp-ve-preview-btn" style="width:100%;margin-bottom:10px">
          👁 Preview Changes
        </button>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">History</div>
        <div style="display:flex;gap:8px">
          <button class="adm-btn-sm" id="admp-ve-undo" disabled style="flex:1">↩ Undo</button>
          <button class="adm-btn-sm" id="admp-ve-redo" disabled style="flex:1">↪ Redo</button>
        </div>
        <p style="font-size:0.60rem;color:rgba(255,255,255,0.2);margin-top:8px">
          Also available: Ctrl+Z / Ctrl+Y when edit mode is active.
        </p>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">Reset Controls</div>
        <div style="display:flex;gap:8px;flex-direction:column">
          <button class="adm-btn-sm" id="admp-ve-reset-el" disabled style="color:#f87171;border-color:rgba(248,113,113,0.25)">
            ↺ Reset Selected Element
          </button>
          <button class="adm-btn-sm" id="admp-ve-reset-all" style="color:#f87171;border-color:rgba(248,113,113,0.25)">
            ⊘ Reset All Visual Styles
          </button>
        </div>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">Editable Elements</div>
        <p style="font-size:0.68rem;color:rgba(255,255,255,0.28);margin-bottom:8px;line-height:1.6">
          The following element types are clickable in edit mode:
        </p>
        <div style="font-size:0.62rem;color:rgba(255,255,255,0.35);line-height:2.2;letter-spacing:0.3px">
          Hero • Headings • Descriptions • Section Tags<br>
          Skill Cards • Project Cards • Journey Cards<br>
          Achievement Cards • About Info Cards<br>
          Buttons • Nav Logo • All Section Panels
        </div>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">Keyboard Shortcuts</div>
        <div style="font-size:0.62rem;color:rgba(255,255,255,0.35);line-height:2.0">
          <span style="color:var(--acc);font-family:'Space Mono',monospace">Ctrl+Z</span> — Undo<br>
          <span style="color:var(--acc);font-family:'Space Mono',monospace">Ctrl+Y</span> — Redo<br>
          <span style="color:var(--acc);font-family:'Space Mono',monospace">Esc</span> — Deselect / Close
        </div>
      </div>
    `;
    content.appendChild(panel);

    /* Bind admin panel buttons */
    document.getElementById('admp-ve-enter-btn').onclick = () => {
      if (!editMode) enterEditMode();
      else exitEditMode();
      document.getElementById('admp-ve-enter-btn').textContent =
        editMode ? '✕ Exit Edit Mode' : '◎ Enter Edit Mode';
    };

    document.getElementById('admp-ve-preview-btn').onclick = enterPreviewMode;

    /* Mirror undo/redo from sidebar into admin panel */
    function syncAdminUndoUI() {
      const adminUndo = document.getElementById('admp-ve-undo');
      const adminRedo = document.getElementById('admp-ve-redo');
      const sideUndo  = document.getElementById('ve-undo');
      const sideRedo  = document.getElementById('ve-redo');
      if (adminUndo) adminUndo.disabled = sideUndo ? sideUndo.disabled : true;
      if (adminRedo) adminRedo.disabled = sideRedo ? sideRedo.disabled : true;
    }

    document.getElementById('admp-ve-undo').onclick = () => { doUndo(); syncAdminUndoUI(); };
    document.getElementById('admp-ve-redo').onclick = () => { doRedo(); syncAdminUndoUI(); };

    document.getElementById('admp-ve-reset-el').onclick = () => {
      if (!selectedVeId) return;
      delete stylesMap[selectedVeId];
      persistStyles();
      if (selectedEl) selectedEl.removeAttribute('style');
      refreshControlPanel();
      veToast('Element reset ✓');
    };

    document.getElementById('admp-ve-reset-all').onclick = () => {
      document.getElementById('ve-reset-modal').classList.add('show');
    };

    /* Keep reset-el button state in sync */
    const origRefresh = refreshControlPanel;
    /* Patch: update admin reset-el button after refreshControlPanel */
    const patchedRefresh = function() {
      origRefresh();
      const btn = document.getElementById('admp-ve-reset-el');
      if (btn) btn.disabled = !selectedVeId;
      syncAdminUndoUI();
    };
    /* We can't reassign a const so we hook via MutationObserver on selection info */
    const selInfo = document.getElementById('ve-sel-id');
    if (selInfo) {
      new MutationObserver(() => {
        const btn = document.getElementById('admp-ve-reset-el');
        if (btn) btn.disabled = !selectedVeId;
        syncAdminUndoUI();
      }).observe(selInfo, { childList: true, characterData: true, subtree: true });
    }
  }

  /* ════════════════════════════════════════════════════════════════
     WATCH FOR ADMIN OVERLAY OPEN — inject nav item when ready
  ════════════════════════════════════════════════════════════════ */
  function watchAdminOverlay() {
    const obs = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.id === 'adm-overlay' || (node.nodeType === 1 && node.querySelector?.('#adm-overlay'))) {
            requestAnimationFrame(() => {
              injectAdminNavItem();
              /* Re-stamp editable elements after any panel re-renders */
              stampEditableElements();
              applyAllStyles();
              applyAllTextContent();
            });
          }
        });

        /* Also watch for admin overlay becoming visible */
        if (m.target && m.target.id === 'adm-overlay') {
          if (m.target.classList.contains('adm-visible')) {
            requestAnimationFrame(() => {
              injectAdminNavItem();
              stampEditableElements();
            });
          } else {
            /* Admin closed — exit edit mode gracefully */
            if (editMode) exitEditMode();
          }
        }
      });
    });

    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

    /* Also check immediately if admin overlay already exists */
    const existing = document.getElementById('adm-overlay');
    if (existing) {
      requestAnimationFrame(() => {
        injectAdminNavItem();
        stampEditableElements();
      });
    }
  }

  /* Watch for admin.js re-renders (skill/project grid rebuilds) */
  function watchGridRebuilds() {
    const grids = ['.sk-grid', '.projects-grid', '.vtl', '.ach-grid', '.about-inner'];
    const obs = new MutationObserver(() => {
      requestAnimationFrame(() => {
        stampEditableElements();
        applyAllStyles();
        applyAllTextContent();
      });
    });

    grids.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) obs.observe(el, { childList: true, subtree: false });
    });

    /* Re-attach when grids are rebuilt by admin.js */
    document.addEventListener('ve-restamp', () => {
      stampEditableElements();
      applyAllStyles();
    });
  }

  /* ════════════════════════════════════════════════════════════════
     BOOT
  ════════════════════════════════════════════════════════════════ */
  function boot() {
    injectCSS();
    buildSidebar();

    /* Load stored styles */
    stylesMap = loadStyles();

    /* Stamp editable elements */
    stampEditableElements();

    /* Apply all stored styles to live DOM */
    applyAllStyles();
    applyAllTextContent();

    /* Seed initial undo state */
    requestAnimationFrame(saveUndoState);

    /* Watch for admin overlay */
    watchAdminOverlay();

    /* Watch for grid rebuilds */
    requestAnimationFrame(watchGridRebuilds);

    /* Esc key to close sidebar / deselect */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && editMode) {
        if (selectedVeId) { clearSelection(); }
        else { exitEditMode(); }
      }
    });

    console.log('%c✦ Visual Editor v1.0 — Admin → Visual Editor tab', 'color:#a855f7;font-family:monospace;font-weight:bold');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    /* admin.js may still be initializing — wait one extra rAF */
    requestAnimationFrame(() => requestAnimationFrame(boot));
  }

})();
