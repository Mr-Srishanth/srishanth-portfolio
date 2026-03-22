/* ═══════════════════════════════════════════════════════════════════
   VISUAL-BUILDER.JS  v2.0
   Extends admin.js + visual-editor.js. Zero conflicts.

   PARTS:
   1  — Theme cycle (single-button, smooth transition)
   3  — Multi-column builder (add/remove cols, drag between cols)
   4  — Ghost drag engine (ghost preview, FLIP, snap, push effects)
   5  — Template system (save/load full layout snapshots)
   6  — Global undo/redo (unified history across all operations)
   7  — Design control panel (font, spacing, radius, glow, speed)
   8  — Floating toolbar on element selection
   9  — Advanced reset (element / section / full site)
   10 — Performance (rAF loops, passive listeners, no layout thrashing)

   localStorage keys:
     "vb-design-system"   — design token values
     "vb-col-layouts"     — per-section column counts
     "vb-templates"       — named layout snapshots
     "vb-global-history"  — NOT persisted (in-memory only)
   ═══════════════════════════════════════════════════════════════════ */

(function VisualBuilder() {
  'use strict';

  if (window.__vbLoaded) return;
  window.__vbLoaded = true;

  const NO_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IS_TOUCH  = 'ontouchstart' in window;

  /* ── rAF-safe passive helper ── */
  function on(el, ev, fn, opts) {
    if (!el) return;
    el.addEventListener(ev, fn, { passive: true, ...opts });
  }


  /* ════════════════════════════════════════════════════════════════
     STORAGE HELPERS
  ════════════════════════════════════════════════════════════════ */
  const KEYS = {
    DESIGN:    'vb-design-system',
    COLS:      'vb-col-layouts',
    TEMPLATES: 'vb-templates',
  };

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { vbToast('Storage full', 'error'); }
  }


  /* ════════════════════════════════════════════════════════════════
     TOAST
  ════════════════════════════════════════════════════════════════ */
  let _toastTimer = null;
  function vbToast(msg, type = 'success') {
    let el = document.getElementById('vb-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'vb-toast';
      el.style.cssText = [
        'position:fixed;bottom:70px;left:50%;transform:translateX(-50%) translateY(10px)',
        'z-index:999999;background:rgba(13,17,23,0.97)',
        'border:1px solid rgba(255,255,255,0.09);border-radius:10px',
        'padding:9px 18px;font-family:Rajdhani,sans-serif;font-size:0.76rem',
        'color:#dde0f0;pointer-events:none;opacity:0',
        'transition:opacity 0.22s,transform 0.22s;white-space:nowrap'
      ].join(';');
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.borderLeftColor = type === 'error' ? '#f87171' : type === 'info' ? 'var(--acc)' : '#56d364';
    el.style.borderLeftWidth = '3px';
    el.style.borderLeftStyle = 'solid';
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-50%) translateY(10px)';
    }, 2400);
  }


  /* ════════════════════════════════════════════════════════════════
     PART 1 — THEME CYCLE SYSTEM
     Single click on #thm-btn cycles through THEMES[].
     Palette (#thm-picker) is hidden via CSS.
     Smooth 0.45s transition on all colour properties.
  ════════════════════════════════════════════════════════════════ */
  const ThemeCycle = (() => {
    const THEMES = [
      'blue','pink','green','yellow','purple',
      'orange','cyan','rose','emerald','gold','sunset','ocean','rainbow'
    ];

    let idx = 0;

    function getIdx() {
      const cur = document.documentElement.getAttribute('data-theme') || 'blue';
      const i = THEMES.indexOf(cur);
      return i >= 0 ? i : 0;
    }

    function applyTheme(key, fromCycle) {
      // If a custom accent is locked in, only remove it when user explicitly cycles
      if (!fromCycle && localStorage.getItem('adm-custom-accent')) return;
      document.documentElement.setAttribute('data-theme', key);
      try { localStorage.setItem('user-theme', key); } catch(e) { console.warn('Storage full'); }
      /* Remove custom hex override */
      const ov = document.getElementById('admin-theme-override');
      if (ov) ov.remove();
      try { localStorage.removeItem('adm-custom-accent'); } catch(e) {}
      /* Sync swatch UIs */
      document.querySelectorAll('.tsw').forEach(s =>
        s.classList.toggle('on', s.dataset.t === key));
      document.querySelectorAll('.adm-swatch').forEach(s =>
        s.classList.toggle('adm-swatch-active', s.dataset.theme === key));
      /* Broadcast to admin page if open */
      if (fromCycle) {
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            const bc = new BroadcastChannel('portfolio-admin-sync');
            bc.postMessage({ type: 'theme', theme: key, custom: '' });
            bc.close();
          }
        } catch(e) {}
        vbToast(`Theme: ${key}`);
      }
    }

    function cycle() {
      idx = (getIdx() + 1) % THEMES.length;
      applyTheme(THEMES[idx], true);
      /* Theme flash overlay — CSS handles the animation via .theme-flash::before */
      document.body.classList.remove('theme-flash');
      void document.body.offsetWidth; /* force reflow so re-adding restarts animation */
      document.body.classList.add('theme-flash');
      setTimeout(() => document.body.classList.remove('theme-flash'), 350);
    }

    function init() {
      const btn = document.getElementById('thm-btn');
      if (!btn) return;

      /* Remove any legacy spans from old markup */
      btn.querySelectorAll('.thm-dot, .core, .ring').forEach(el => el.remove());

      /* Inject pulse element once */
      let pulse = document.querySelector('.theme-pulse');
      if (!pulse) {
        pulse = document.createElement('div');
        pulse.className = 'theme-pulse';
        document.body.appendChild(pulse);
      }

      /* Restore saved theme — custom accent takes priority */
      let saved = null;
      try { saved = localStorage.getItem('user-theme'); } catch(e) {}
      const customAccent = localStorage.getItem('adm-custom-accent') || '';
      if (customAccent && /^#[0-9a-fA-F]{6}$/.test(customAccent)) {
        // Custom color is active — don't override with preset
        document.documentElement.removeAttribute('data-theme');
        idx = 0;
      } else if (saved && THEMES.includes(saved)) {
        applyTheme(saved, false);
        idx = THEMES.indexOf(saved);
      } else {
        idx = getIdx();
      }

      /* Replace existing click handlers by cloning to drop all previous listeners */
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      // Expose sync hooks for PortfolioSync
      window.__themeCycleSync = (key) => {
        const i = THEMES.indexOf(key);
        if (i >= 0) { idx = i; applyTheme(key, false); }
      };
      window.__themeCycleOverride = (hex) => {
        // Custom color applied — remove preset data-theme
        document.documentElement.removeAttribute('data-theme');
        document.querySelectorAll('.tsw').forEach(s => s.classList.remove('on'));
      };

      newBtn.addEventListener('click', (e) => {
        /* Press animation */
        newBtn.style.transform = 'scale(0.92)';
        setTimeout(() => { newBtn.style.transform = ''; }, 150);

        /* Pulse from button centre */
        const rect = newBtn.getBoundingClientRect();
        pulse.style.left = (rect.left + rect.width  / 2) + 'px';
        pulse.style.top  = (rect.top  + rect.height / 2) + 'px';
        pulse.classList.remove('active');
        void pulse.offsetWidth; /* force reflow to restart animation */
        pulse.classList.add('active');
        setTimeout(() => pulse.classList.remove('active'), 500);

        cycle();
      });

      /* Hide the palette picker (belt + suspenders over CSS) */
      const picker = document.getElementById('thm-picker');
      if (picker) picker.style.display = 'none';
    }

    return { init, applyTheme, cycle };
  })();


  /* ════════════════════════════════════════════════════════════════
     PART 6 — GLOBAL UNDO / REDO
     Unified history for all builder operations.
     saveState() is called by every Part that mutates layout.
  ════════════════════════════════════════════════════════════════ */
  const History = (() => {
    const LIMIT = 50;
    let stack = [];
    let future = [];
    let _listeners = [];

    function snapshot() {
      return JSON.stringify({
        colLayouts:  load(KEYS.COLS),
        designSys:   load(KEYS.DESIGN),
        sectionOrder: getSectionOrder(),
        ts: Date.now(),
      });
    }

    function saveState() {
      const snap = snapshot();
      if (stack.length && stack[stack.length - 1] === snap) return;
      stack.push(snap);
      if (stack.length > LIMIT) stack.shift();
      future = [];
      _listeners.forEach(fn => fn());
    }

    function undo() {
      if (stack.length < 2) return;
      future.push(stack.pop());
      const prev = JSON.parse(stack[stack.length - 1]);
      applySnapshot(prev);
      _listeners.forEach(fn => fn());
      vbToast('Undo ✓');
    }

    function redo() {
      if (!future.length) return;
      const next = JSON.parse(future.pop());
      stack.push(JSON.stringify(next));
      applySnapshot(next);
      _listeners.forEach(fn => fn());
      vbToast('Redo ✓');
    }

    function canUndo() { return stack.length >= 2; }
    function canRedo() { return future.length > 0; }
    function onChange(fn) { _listeners.push(fn); }

    function applySnapshot(snap) {
      if (snap.colLayouts) {
        save(KEYS.COLS, snap.colLayouts);
        ColBuilder.applyAll(snap.colLayouts);
      }
      if (snap.designSys) {
        save(KEYS.DESIGN, snap.designSys);
        DesignPanel.applyAll(snap.designSys);
      }
    }

    /* Seed initial state after boot */
    function seed() { requestAnimationFrame(saveState); }

    return { saveState, undo, redo, canUndo, canRedo, onChange, seed };
  })();

  /* Helper — get current section order from DOM */
  function getSectionOrder() {
    return ['about','skills','projects','journey','certs','contact']
      .map(id => ({ id, exists: !!document.getElementById(id) }))
      .filter(s => s.exists).map(s => s.id);
  }


  /* ════════════════════════════════════════════════════════════════
     PART 5 — TEMPLATE SYSTEM
  ════════════════════════════════════════════════════════════════ */
  const Templates = (() => {
    function getAll() { return load(KEYS.TEMPLATES); }

    function saveTemplate(name) {
      if (!name.trim()) return vbToast('Enter a template name', 'error');
      const tpls = getAll();
      tpls[name.trim()] = {
        colLayouts: load(KEYS.COLS),
        designSys:  load(KEYS.DESIGN),
        sectionOrder: getSectionOrder(),
        savedAt: Date.now(),
      };
      save(KEYS.TEMPLATES, tpls);
      vbToast(`Template "${name.trim()}" saved ✓`);
      renderTemplateList();
    }

    function loadTemplate(name) {
      const tpls = getAll();
      const tpl = tpls[name];
      if (!tpl) return vbToast('Template not found', 'error');
      History.saveState();
      if (tpl.colLayouts) { save(KEYS.COLS, tpl.colLayouts); ColBuilder.applyAll(tpl.colLayouts); }
      if (tpl.designSys)  { save(KEYS.DESIGN, tpl.designSys); DesignPanel.applyAll(tpl.designSys); }
      History.saveState();
      vbToast(`Template "${name}" loaded ✓`);
      renderTemplateList();
    }

    function deleteTemplate(name) {
      const tpls = getAll();
      delete tpls[name];
      save(KEYS.TEMPLATES, tpls);
      vbToast(`Template "${name}" deleted`);
      renderTemplateList();
    }

    function renderTemplateList() {
      const el = document.getElementById('vb-tpl-list');
      if (!el) return;
      const tpls = getAll();
      const names = Object.keys(tpls);
      if (!names.length) {
        el.innerHTML = '<div style="font-size:0.65rem;color:rgba(255,255,255,0.2);padding:10px 0">No saved templates yet</div>';
        return;
      }
      el.innerHTML = names.map(name => `
        <div class="vb-tpl-item">
          <span>${esc(name)}</span>
          <div class="vb-tpl-actions">
            <button class="vb-tpl-act" data-tpl-load="${esc(name)}">↗ Load</button>
            <button class="vb-tpl-act del" data-tpl-del="${esc(name)}">✕</button>
          </div>
        </div>`).join('');

      el.querySelectorAll('[data-tpl-load]').forEach(btn =>
        btn.addEventListener('click', () => loadTemplate(btn.dataset.tplLoad)));
      el.querySelectorAll('[data-tpl-del]').forEach(btn =>
        btn.addEventListener('click', () => deleteTemplate(btn.dataset.tplDel)));
    }

    return { saveTemplate, loadTemplate, deleteTemplate, renderTemplateList };
  })();


  /* ════════════════════════════════════════════════════════════════
     PART 7 — DESIGN CONTROL PANEL
     Controls CSS custom properties live on :root
  ════════════════════════════════════════════════════════════════ */
  const DesignPanel = (() => {
    const TOKENS = [
      { key: 'radius',     cssVar: '--ds-radius',     label: 'Border Radius', unit: 'px', min: 0,   max: 32,  step: 1,   def: 12  },
      { key: 'spacing',    cssVar: '--ds-spacing',    label: 'Base Spacing',  unit: 'px', min: 8,   max: 48,  step: 2,   def: 20  },
      { key: 'glowMult',   cssVar: '--ds-glow-mult',  label: 'Glow Power',    unit: '',   min: 0,   max: 3,   step: 0.1, def: 1   },
      { key: 'animSpeed',  cssVar: '--ds-anim-speed', label: 'Anim Speed',    unit: 'x',  min: 0.5, max: 3,   step: 0.1, def: 1   },
      { key: 'fontScale',  cssVar: '--ds-font-scale', label: 'Font Scale',    unit: 'x',  min: 0.8, max: 1.4, step: 0.05,def: 1   },
    ];

    function applyToken(key, val) {
      const tk = TOKENS.find(t => t.key === key);
      if (!tk) return;
      let cssVal = val + (tk.unit === 'px' ? 'px' : '');
      if (tk.key === 'fontScale') {
        document.documentElement.style.fontSize = (val * 16) + 'px';
      } else {
        document.documentElement.style.setProperty(tk.cssVar, cssVal);
      }
    }

    function applyAll(stored) {
      TOKENS.forEach(tk => {
        const val = stored[tk.key] !== undefined ? stored[tk.key] : tk.def;
        applyToken(tk.key, val);
      });
    }

    function buildPanel(container) {
      if (!container) return;
      const stored = load(KEYS.DESIGN);

      container.innerHTML = `
        <div class="adm-section-title">Design System</div>
        <div class="adm-group">
          <div class="adm-group-title">Global Design Tokens</div>
          <p style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-bottom:14px;line-height:1.6">
            Controls apply live across the entire site using CSS variables.
          </p>
          <div class="ds-panel-grid" id="ds-token-grid"></div>
        </div>
        <div class="adm-group">
          <div class="adm-group-title">Actions</div>
          <div style="display:flex;gap:8px">
            <button class="adm-btn-sm adm-btn-save" id="ds-save-btn" style="flex:1">💾 Save Design</button>
            <button class="adm-btn-sm adm-btn-logout" id="ds-reset-btn" style="flex:1;color:#f87171">↺ Reset</button>
          </div>
        </div>
      `;

      const grid = container.querySelector('#ds-token-grid');
      TOKENS.forEach(tk => {
        const val = stored[tk.key] !== undefined ? stored[tk.key] : tk.def;
        const isWide = tk.key === 'fontScale';
        const card = document.createElement('div');
        card.className = `ds-token-card${isWide ? ' ds-full' : ''}`;
        card.innerHTML = `
          <div class="ds-token-label">
            <span>${tk.label}</span>
            <span class="ds-token-val" id="ds-val-${tk.key}">${val}${tk.unit}</span>
          </div>
          <input type="range" class="ds-slider" id="ds-${tk.key}"
            min="${tk.min}" max="${tk.max}" step="${tk.step}" value="${val}"/>
          <div class="ds-preview-swatch"></div>
        `;
        grid.appendChild(card);

        const slider = card.querySelector(`#ds-${tk.key}`);
        const valEl  = card.querySelector(`#ds-val-${tk.key}`);

        let _raf = null;
        slider.addEventListener('input', () => {
          const v = parseFloat(slider.value);
          valEl.textContent = v + tk.unit;
          if (_raf) cancelAnimationFrame(_raf);
          _raf = requestAnimationFrame(() => { applyToken(tk.key, v); });
        }, { passive: true });

        slider.addEventListener('change', () => {
          History.saveState();
        }, { passive: true });
      });

      /* Save button */
      container.querySelector('#ds-save-btn').addEventListener('click', () => {
        const stored = {};
        TOKENS.forEach(tk => {
          const sl = document.getElementById(`ds-${tk.key}`);
          if (sl) stored[tk.key] = parseFloat(sl.value);
        });
        save(KEYS.DESIGN, stored);
        History.saveState();
        vbToast('Design system saved ✓');
      });

      /* Reset button */
      container.querySelector('#ds-reset-btn').addEventListener('click', () => {
        const defaults = {};
        TOKENS.forEach(tk => {
          defaults[tk.key] = tk.def;
          const sl = document.getElementById(`ds-${tk.key}`);
          const vl = document.getElementById(`ds-val-${tk.key}`);
          if (sl) sl.value = tk.def;
          if (vl) vl.textContent = tk.def + tk.unit;
        });
        applyAll(defaults);
        save(KEYS.DESIGN, defaults);
        History.saveState();
        vbToast('Design tokens reset ✓');
      });
    }

    function init() {
      const stored = load(KEYS.DESIGN);
      if (Object.keys(stored).length) applyAll(stored);
    }

    return { buildPanel, applyAll, applyToken, init };
  })();


  /* ════════════════════════════════════════════════════════════════
     PART 3 — MULTI-COLUMN BUILDER
  ════════════════════════════════════════════════════════════════ */
  const ColBuilder = (() => {
    const SECTION_IDS = ['about','skills','projects','journey','certs','contact'];

    function getColCount(secId) {
      return (load(KEYS.COLS)[secId] || 1);
    }

    function setColCount(secId, count) {
      const cols = load(KEYS.COLS);
      cols[secId] = Math.max(1, Math.min(3, count));
      save(KEYS.COLS, cols);
      applySection(secId, cols[secId]);
      History.saveState();
      vbToast(`${secId}: ${cols[secId]} column${cols[secId] > 1 ? 's' : ''}`);
    }

    function applySection(secId, colCount) {
      const sec = document.getElementById(secId);
      if (!sec) return;

      /* Find or create the wrapper */
      let wrap = sec.querySelector('.vb-col-wrap');
      if (!wrap && colCount > 1) {
        /* Create wrap, move section's content children into it */
        wrap = document.createElement('div');
        wrap.className = 'vb-col-wrap vb-section-wrap';

        /* Find the inner content (skip the heading block) */
        const headingBlock = sec.querySelector('.reveal.ta-center, .ta-center.mb-52');
        const children = [...sec.children].filter(c =>
          c !== headingBlock && !c.classList.contains('vb-col-strip'));

        /* Distribute children across columns */
        const cols = [];
        for (let i = 0; i < colCount; i++) {
          const col = document.createElement('div');
          col.className = 'vb-col';
          col.dataset.col = i + 1;
          cols.push(col);
          wrap.appendChild(col);
        }

        children.forEach((child, i) => {
          cols[i % colCount].appendChild(child);
        });

        sec.appendChild(wrap);
      } else if (wrap) {
        /* Collect all items from existing columns */
        if (colCount === 1) {
          /* Flatten back */
          const allItems = [...wrap.querySelectorAll('.vb-col > *')];
          allItems.forEach(item => sec.insertBefore(item, wrap));
          wrap.remove();
          return;
        }

        /* Rebuild columns with new count */
        const allItems = [...wrap.querySelectorAll('.vb-col > *')];
        wrap.innerHTML = '';
        const cols = [];
        for (let i = 0; i < colCount; i++) {
          const col = document.createElement('div');
          col.className = 'vb-col';
          col.dataset.col = i + 1;
          cols.push(col);
          wrap.appendChild(col);
        }
        allItems.forEach((item, i) => cols[i % colCount].appendChild(item));
      }

      /* Inject column control strip */
      if (wrap) injectColStrip(sec, secId, wrap);
    }

    function injectColStrip(sec, secId, wrap) {
      let strip = sec.querySelector('.vb-col-strip');
      if (!strip) {
        strip = document.createElement('div');
        strip.className = 'vb-col-strip';
        sec.style.position = 'relative';
        sec.insertBefore(strip, sec.firstChild);
      }
      const cur = getColCount(secId);
      strip.innerHTML = `
        <span style="color:rgba(255,255,255,0.3);font-size:0.45rem;letter-spacing:1px;margin-right:4px">COLS</span>
        <button class="vb-col-strip-btn" data-action="col-dec" title="Remove column">−</button>
        <span class="vb-col-strip-count">${cur}</span>
        <button class="vb-col-strip-btn" data-action="col-inc" title="Add column">+</button>
      `;
      strip.querySelector('[data-action="col-dec"]').addEventListener('click', (e) => {
        e.stopPropagation();
        setColCount(secId, getColCount(secId) - 1);
      });
      strip.querySelector('[data-action="col-inc"]').addEventListener('click', (e) => {
        e.stopPropagation();
        setColCount(secId, getColCount(secId) + 1);
      });
    }

    function applyAll(colMap) {
      Object.entries(colMap).forEach(([secId, count]) => applySection(secId, count));
    }

    function buildAdminPanel(container) {
      if (!container) return;
      const colMap = load(KEYS.COLS);
      const labels = { about:'About', skills:'Skills', projects:'Projects',
                       journey:'Journey', certs:'Certificates', contact:'Contact' };

      container.innerHTML = `
        <div class="adm-section-title">Layout Builder</div>
        <div class="adm-group">
          <div class="adm-group-title">Column Layout</div>
          <p style="font-size:0.65rem;color:rgba(255,255,255,0.25);margin-bottom:14px;line-height:1.6">
            Set column count per section. Changes apply live. Max 3 columns.
          </p>
          <div id="vb-col-section-list"></div>
        </div>
        <div class="adm-group">
          <div class="adm-group-title">History</div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <button class="adm-btn-sm" id="vb-undo-btn" disabled style="flex:1">↩ Undo</button>
            <button class="adm-btn-sm" id="vb-redo-btn" disabled style="flex:1">↪ Redo</button>
          </div>
          <p style="font-size:0.60rem;color:rgba(255,255,255,0.2)">Ctrl+Z / Ctrl+Y also work.</p>
        </div>
        <div class="adm-group">
          <div class="adm-group-title">Templates</div>
          <div style="display:flex;gap:8px;margin-bottom:10px">
            <input class="adm-input" id="vb-tpl-name" type="text" placeholder="Template name…" style="flex:1"/>
            <button class="adm-btn-sm adm-btn-save" id="vb-tpl-save-btn">💾 Save</button>
          </div>
          <div id="vb-tpl-list"></div>
        </div>
        <div class="adm-group">
          <div class="adm-group-title">Reset</div>
          <div style="display:flex;gap:8px;flex-direction:column">
            <button class="adm-btn-sm" id="vb-reset-cols-btn" style="color:#f87171;border-color:rgba(248,113,113,0.25)">
              ↺ Reset All Column Layouts
            </button>
            <button class="adm-btn-sm" id="vb-reset-full-btn" style="color:#f87171;border-color:rgba(248,113,113,0.25)">
              ⊘ Reset Full Visual System
            </button>
          </div>
        </div>
      `;

      /* Section column controls */
      const secList = container.querySelector('#vb-col-section-list');
      SECTION_IDS.forEach(secId => {
        const cur = colMap[secId] || 1;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;';
        row.innerHTML = `
          <span style="font-size:0.70rem;color:rgba(255,255,255,0.6)">${labels[secId]}</span>
          <div class="vb-col-presets" data-sec="${secId}">
            ${[1,2,3].map(n => `
              <button class="vb-col-preset${cur === n ? ' active' : ''}" data-sec="${secId}" data-cols="${n}"
                title="${n} column${n > 1 ? 's' : ''}">
                ${Array(n).fill('<div class="vb-col-preset-bar"></div>').join('')}
              </button>`).join('')}
          </div>
        `;
        secList.appendChild(row);
      });

      secList.addEventListener('click', e => {
        const btn = e.target.closest('.vb-col-preset');
        if (!btn) return;
        const secId = btn.dataset.sec;
        const cols  = parseInt(btn.dataset.cols);
        btn.closest('.vb-col-presets').querySelectorAll('.vb-col-preset')
          .forEach(b => b.classList.toggle('active', b === btn));
        setColCount(secId, cols);
      });

      /* Undo/redo */
      const undoBtn = container.querySelector('#vb-undo-btn');
      const redoBtn = container.querySelector('#vb-redo-btn');
      const syncBtns = () => {
        if (undoBtn) undoBtn.disabled = !History.canUndo();
        if (redoBtn) redoBtn.disabled = !History.canRedo();
      };
      undoBtn?.addEventListener('click', () => { History.undo(); syncBtns(); });
      redoBtn?.addEventListener('click', () => { History.redo(); syncBtns(); });
      History.onChange(syncBtns);
      syncBtns();

      /* Templates */
      Templates.renderTemplateList();
      const tplInput = container.querySelector('#vb-tpl-name');
      container.querySelector('#vb-tpl-save-btn')?.addEventListener('click', () => {
        Templates.saveTemplate(tplInput?.value || '');
        if (tplInput) tplInput.value = '';
      });

      /* Reset column layouts */
      container.querySelector('#vb-reset-cols-btn')?.addEventListener('click', () => {
        showResetConfirm('Reset all column layouts?', () => {
          save(KEYS.COLS, {});
          SECTION_IDS.forEach(id => {
            const sec = document.getElementById(id);
            if (!sec) return;
            const wrap = sec.querySelector('.vb-col-wrap');
            if (wrap) {
              const allItems = [...wrap.querySelectorAll('.vb-col > *')];
              allItems.forEach(item => sec.insertBefore(item, wrap));
              wrap.remove();
            }
            const strip = sec.querySelector('.vb-col-strip');
            if (strip) strip.remove();
          });
          History.saveState();
          vbToast('Column layouts reset ✓');
        });
      });

      /* Reset full visual system */
      container.querySelector('#vb-reset-full-btn')?.addEventListener('click', () => {
        showResetConfirm(
          'Reset ALL visual styles, columns, and design tokens?',
          () => {
            try { [KEYS.COLS, KEYS.DESIGN, KEYS.TEMPLATES].forEach(k => localStorage.removeItem(k)); } catch(e) {}
            /* Reset CSS tokens */
            document.documentElement.removeAttribute('style');
            /* Reset inline styles on stamped elements */
            document.querySelectorAll('[data-ve-id]').forEach(el => el.removeAttribute('style'));
            SECTION_IDS.forEach(id => {
              const sec = document.getElementById(id);
              if (!sec) return;
              const wrap = sec.querySelector('.vb-col-wrap');
              if (wrap) {
                [...wrap.querySelectorAll('.vb-col > *')].forEach(item => sec.insertBefore(item, wrap));
                wrap.remove();
              }
              const strip = sec.querySelector('.vb-col-strip');
              if (strip) strip.remove();
            });
            History.saveState();
            vbToast('Full visual system reset ✓');
          }
        );
      });
    }

    function init() {
      const stored = load(KEYS.COLS);
      if (Object.keys(stored).length) applyAll(stored);
    }

    return { init, buildAdminPanel, applyAll, setColCount, getColCount };
  })();


  /* ════════════════════════════════════════════════════════════════
     PART 4 — GHOST DRAG ENGINE
     Handles drag-and-drop of card-level items with:
     • Ghost mirror element following mouse (GPU transform only)
     • FLIP animation for displaced elements
     • Snap pulse on drop
     • Push effect on neighbours
     • Drop placeholder
  ════════════════════════════════════════════════════════════════ */
  const GhostDrag = (() => {
    /* Draggable containers and their item selectors */
    const DRAG_CONFIGS = [
      { containerSel: '.sk-grid',       itemSel: '.sk-card' },
      { containerSel: '.projects-grid', itemSel: '.pj'      },
      { containerSel: '.ach-grid',      itemSel: '.ach-card'},
    ];

    let ghost       = null;
    let source      = null;
    let placeholder = null;
    let container   = null;
    let itemSel     = '';
    let mouseX = 0, mouseY = 0;
    let offsetX = 0, offsetY = 0;
    let ghostRAF = null;
    let isDragging = false;
    let flipRects  = new Map(); /* el → DOMRect before reorder */

    function getGhostEl() {
      if (!ghost) {
        ghost = document.createElement('div');
        ghost.className = 'vb-ghost';
        document.body.appendChild(ghost);
      }
      return ghost;
    }

    function getPlaceholder() {
      if (!placeholder) {
        placeholder = document.createElement('div');
        placeholder.className = 'vb-drop-placeholder';
      }
      return placeholder;
    }

    function startDrag(e, el, containerEl, sel) {
      if (!window.__veLoaded) return; /* only in edit mode */
      const bodyEl = document.body;
      if (!bodyEl.classList.contains('edit-mode')) return;

      source    = el;
      container = containerEl;
      itemSel   = sel;
      isDragging = true;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rect = el.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;

      /* Capture FLIP rects before any changes */
      flipRects.clear();
      containerEl.querySelectorAll(sel).forEach(item => {
        flipRects.set(item, item.getBoundingClientRect());
      });

      /* Store original position for revert */
      const originalNext    = el.nextSibling;
      const originalParent  = el.parentNode;
      el._vbOrigNext   = originalNext;
      el._vbOrigParent = originalParent;

      /* Build ghost */
      const g = getGhostEl();
      g.innerHTML = el.outerHTML;
      g.style.width  = rect.width + 'px';
      g.style.height = rect.height + 'px';
      /* Clamp initial position to viewport */
      const gx = Math.max(0, Math.min(clientX - offsetX, window.innerWidth  - rect.width));
      const gy = Math.max(0, Math.min(clientY - offsetY, window.innerHeight - rect.height));
      g.style.transform = `translate(${gx.toFixed(1)}px,${gy.toFixed(1)}px) rotate(-1deg) scale(1.04)`;
      g.style.display = 'block';

      /* Fade source */
      source.classList.add('vb-drag-source');
      bodyEl.classList.add('vb-dragging');

      mouseX = clientX;
      mouseY = clientY;

      /* Insert placeholder */
      const ph = getPlaceholder();
      ph.style.minHeight = rect.height + 'px';
      source.parentNode.insertBefore(ph, source);

      /* Start rAF loop — clamp ghost to viewport */
      function loop() {
        if (!isDragging) return;
        const gx = Math.max(0, Math.min(mouseX - offsetX, window.innerWidth  - rect.width));
        const gy = Math.max(0, Math.min(mouseY - offsetY, window.innerHeight - rect.height));
        g.style.transform = `translate(${gx.toFixed(1)}px,${gy.toFixed(1)}px) rotate(-0.8deg) scale(1.04)`;
        ghostRAF = requestAnimationFrame(loop);
      }
      ghostRAF = requestAnimationFrame(loop);
    }

    function onMove(e) {
      if (!isDragging) return;
      mouseX = e.touches ? e.touches[0].clientX : e.clientX;
      mouseY = e.touches ? e.touches[0].clientY : e.clientY;

      /* Find element under cursor (excluding ghost) */
      const g = getGhostEl();
      g.style.pointerEvents = 'none';
      const under = document.elementFromPoint(mouseX, mouseY);
      g.style.pointerEvents = '';

      if (!under) return;
      const target = under.closest(itemSel);
      if (!target || target === source || !container.contains(target)) return;

      /* Move placeholder to hovered target */
      const ph = getPlaceholder();
      const targetRect = target.getBoundingClientRect();
      const midY = targetRect.top + targetRect.height / 2;

      /* Capture before positions for FLIP */
      const items = [...container.querySelectorAll(itemSel)].filter(el => el !== source);
      items.forEach(item => { if (!flipRects.has(item)) flipRects.set(item, item.getBoundingClientRect()); });

      if (mouseY < midY) {
        target.parentNode.insertBefore(ph, target);
      } else {
        target.parentNode.insertBefore(ph, target.nextSibling);
      }

      /* FLIP — animate items to new positions */
      if (NO_MOTION) return;
      requestAnimationFrame(() => {
        items.forEach(item => {
          const oldRect = flipRects.get(item);
          if (!oldRect) return;
          const newRect = item.getBoundingClientRect();
          const dy = oldRect.top - newRect.top;
          const dx = oldRect.left - newRect.left;
          if (Math.abs(dy) < 1 && Math.abs(dx) < 1) return;
          item.style.transform = `translate(${dx}px,${dy}px)`;
          item.style.transition = 'none';
          requestAnimationFrame(() => {
            item.classList.add('vb-flip-move');
            item.style.transform = '';
            item.style.transition = '';
            item.addEventListener('transitionend', () => {
              item.classList.remove('vb-flip-move');
            }, { once: true });
          });
          flipRects.set(item, newRect);
        });
      });
    }

    function endDrag() {
      if (!isDragging) return;
      isDragging = false;
      cancelAnimationFrame(ghostRAF);
      ghostRAF = null;

      /* Always hide ghost — guaranteed cleanup regardless of drop outcome */
      const g = getGhostEl();
      g.style.display = 'none';
      g.innerHTML = '';

      const ph = getPlaceholder();
      const phParent = ph.parentNode;

      if (phParent && source) {
        /* Valid drop: insert source where placeholder is */
        phParent.insertBefore(source, ph);
        ph.remove();
      } else if (phParent) {
        /* Placeholder exists but source lost — just remove placeholder */
        ph.remove();
      } else if (source) {
        /* Fallback: revert to original position */
        const origParent = source._vbOrigParent;
        const origNext   = source._vbOrigNext;
        if (origParent && origParent.isConnected) {
          if (origNext && origNext.isConnected && origParent.contains(origNext)) {
            origParent.insertBefore(source, origNext);
          } else {
            origParent.appendChild(source);
          }
        }
      }

      if (source) {
        source.classList.remove('vb-drag-source');
        delete source._vbOrigNext;
        delete source._vbOrigParent;
        /* Snap pulse */
        if (!NO_MOTION) {
          source.classList.add('vb-snap-pulse');
          source.addEventListener('animationend', () =>
            source.classList.remove('vb-snap-pulse'), { once: true });
        }
        /* Push neighbours */
        if (!NO_MOTION) {
          const next = source.nextElementSibling;
          const prev = source.previousElementSibling;
          [next, prev].forEach(nb => {
            if (!nb || !nb.matches(itemSel)) return;
            nb.classList.add('vb-push');
            nb.addEventListener('animationend', () => nb.classList.remove('vb-push'), { once: true });
          });
        }
      }

      document.body.classList.remove('vb-dragging');
      History.saveState();
      source = null;
      flipRects.clear();
    }

    function bindContainer(cfg) {
      const container = document.querySelector(cfg.containerSel);
      if (!container || container.__vbDragBound) return;
      container.__vbDragBound = true;

      /* mousedown on items */
      container.addEventListener('mousedown', e => {
        if (!document.body.classList.contains('edit-mode')) return;
        const item = e.target.closest(cfg.itemSel);
        const grip = e.target.closest('.vb-grip');
        /* Only initiate drag from grip handle or long-press (handled separately) */
        if (!item) return;
        if (!grip && !item.dataset.vbDraggable) return;
        e.preventDefault();
        startDrag(e, item, container, cfg.itemSel);
      });

      /* Touch */
      container.addEventListener('touchstart', e => {
        if (!document.body.classList.contains('edit-mode')) return;
        const item = e.target.closest(cfg.itemSel);
        const grip = e.target.closest('.vb-grip');
        if (!item || !grip) return;
        startDrag(e, item, container, cfg.itemSel);
      }, { passive: true });
    }

    function injectGripHandles() {
      DRAG_CONFIGS.forEach(cfg => {
        document.querySelectorAll(cfg.itemSel).forEach(el => {
          if (el.querySelector('.vb-grip')) return;
          el.style.position = 'relative';
          const grip = document.createElement('div');
          grip.className = 'vb-grip';
          grip.textContent = '⠿';
          grip.title = 'Drag to reorder';
          el.insertBefore(grip, el.firstChild);
          el.dataset.vbDraggable = 'true';
        });
      });
    }

    function init() {
      if (IS_TOUCH && !('PointerEvent' in window)) return;

      DRAG_CONFIGS.forEach(cfg => bindContainer(cfg));

      on(document, 'mousemove', onMove);
      on(document, 'mouseup', endDrag);
      on(document, 'touchmove', onMove);
      on(document, 'touchend', endDrag);

      /* Inject grips after admin renders cards */
      requestAnimationFrame(injectGripHandles);
    }

    return { init, injectGripHandles };
  })();


  /* ════════════════════════════════════════════════════════════════
     PART 8 — FLOATING TOOLBAR
     Appears above selected element with quick actions:
     Edit text | Style panel | Duplicate | Move up | Move down |
     Reset element | Close
  ════════════════════════════════════════════════════════════════ */
  const FloatToolbar = (() => {
    let toolbar = null;
    let currentEl = null;

    function getToolbar() {
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = 'vb-float-toolbar';
        toolbar.innerHTML = `
          <span class="vbt-el-id" id="vbt-el-id">—</span>
          <div class="vbt-sep"></div>
          <button class="vbt-btn" id="vbt-edit-text" data-tip="EDIT TEXT">✎</button>
          <button class="vbt-btn" id="vbt-style" data-tip="STYLE PANEL">◧</button>
          <div class="vbt-sep"></div>
          <button class="vbt-btn" id="vbt-up" data-tip="MOVE UP">↑</button>
          <button class="vbt-btn" id="vbt-down" data-tip="MOVE DOWN">↓</button>
          <div class="vbt-sep"></div>
          <button class="vbt-btn" id="vbt-reset" data-tip="RESET ELEMENT" style="color:#f87171">↺</button>
          <button class="vbt-btn" id="vbt-close" data-tip="DESELECT">✕</button>
        `;
        document.body.appendChild(toolbar);
        bindToolbarButtons();
      }
      return toolbar;
    }

    function show(el) {
      const tb = getToolbar();
      currentEl = el;
      toolbar.classList.add('visible');

      /* Position above element */
      positionToolbar(el);

      /* Update ID label */
      const idEl = tb.querySelector('#vbt-el-id');
      if (idEl) idEl.textContent = el.dataset.veId || el.tagName.toLowerCase() || '?';

      /* Update text-edit toggle */
      const editBtn = tb.querySelector('#vbt-edit-text');
      if (editBtn) editBtn.classList.toggle('vbt-active', el.isContentEditable);
    }

    function positionToolbar(el) {
      if (!toolbar) return;
      const rect = el.getBoundingClientRect();
      const tbRect = toolbar.getBoundingClientRect();
      let top  = rect.top + window.scrollY - (tbRect.height || 42) - 8;
      let left = rect.left + window.scrollX;

      /* Clamp to viewport */
      const maxLeft = window.innerWidth - (tbRect.width || 280) - 10;
      left = Math.max(10, Math.min(left, maxLeft));
      top  = Math.max(10, top);

      toolbar.style.transform = `translate(${left.toFixed(0)}px,${top.toFixed(0)}px)`;
      toolbar.style.left = '0';
      toolbar.style.top  = '0';
    }

    function hide() {
      if (toolbar) toolbar.classList.remove('visible');
      currentEl = null;
    }

    function bindToolbarButtons() {
      if (!toolbar) return;

      /* Edit text inline */
      toolbar.querySelector('#vbt-edit-text')?.addEventListener('click', () => {
        if (!currentEl) return;
        const editing = currentEl.isContentEditable;
        if (!editing) {
          currentEl.setAttribute('contenteditable', 'true');
          currentEl.focus();
          toolbar.querySelector('#vbt-edit-text')?.classList.add('vbt-active');
        } else {
          currentEl.removeAttribute('contenteditable');
          currentEl.blur();
          toolbar.querySelector('#vbt-edit-text')?.classList.remove('vbt-active');
        }
      });

      /* Open VE style panel */
      toolbar.querySelector('#vbt-style')?.addEventListener('click', () => {
        const veSidebar = document.getElementById('ve-sidebar');
        if (veSidebar) {
          veSidebar.classList.add('ve-open');
          /* Trigger selection in visual-editor.js if it's loaded */
          if (currentEl && window.__veLoaded) {
            currentEl.click(); /* visual-editor.js intercepts this in edit mode */
          }
        }
      });

      /* Move up */
      toolbar.querySelector('#vbt-up')?.addEventListener('click', () => {
        if (!currentEl) return;
        const prev = currentEl.previousElementSibling;
        if (prev) {
          History.saveState();
          currentEl.parentNode.insertBefore(currentEl, prev);
          positionToolbar(currentEl);
          vbToast('Moved up ✓');
        }
      });

      /* Move down */
      toolbar.querySelector('#vbt-down')?.addEventListener('click', () => {
        if (!currentEl) return;
        const next = currentEl.nextElementSibling;
        if (next) {
          History.saveState();
          currentEl.parentNode.insertBefore(next, currentEl);
          positionToolbar(currentEl);
          vbToast('Moved down ✓');
        }
      });

      /* Reset element */
      toolbar.querySelector('#vbt-reset')?.addEventListener('click', () => {
        if (!currentEl) return;
        const veId = currentEl.dataset.veId;
        if (veId) {
          try {
            const styles = JSON.parse(localStorage.getItem('ve-element-styles') || '{}');
            delete styles[veId];
            localStorage.setItem('ve-element-styles', JSON.stringify(styles));
          } catch {}
        }
        currentEl.removeAttribute('style');
        currentEl.removeAttribute('contenteditable');
        vbToast('Element reset ✓');
        History.saveState();
      });

      /* Close / deselect */
      toolbar.querySelector('#vbt-close')?.addEventListener('click', () => {
        if (currentEl) {
          currentEl.classList.remove('ve-selected', 'vb-selected');
          currentEl.removeAttribute('contenteditable');
        }
        hide();
      });

      /* Reposition on scroll */
      on(window, 'scroll', () => {
        if (currentEl && toolbar?.classList.contains('visible')) {
          requestAnimationFrame(() => positionToolbar(currentEl));
        }
      });
    }

    function init() {
      /* Intercept selection events from visual-editor.js */
      const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            const el = m.target;
            if (el.classList.contains('ve-selected') || el.classList.contains('vb-selected')) {
              if (document.body.classList.contains('edit-mode')) show(el);
            } else if (!el.classList.contains('ve-selected') && !el.classList.contains('vb-selected')) {
              if (currentEl === el) hide();
            }
          }
        });
      });
      /* Observe entire document for class changes on editable elements */
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['class'],
        subtree: true,
      });

      /* Hide on Escape */
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape') hide();
      });
    }

    return { init, show, hide };
  })();


  /* ════════════════════════════════════════════════════════════════
     PART 9 — RESET SYSTEM
  ════════════════════════════════════════════════════════════════ */
  function showResetConfirm(msg, onConfirm) {
    let ov = document.getElementById('vb-reset-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'vb-reset-overlay';
      ov.innerHTML = `
        <div class="vb-reset-box">
          <div class="vb-reset-ico">⚠</div>
          <div class="vb-reset-title">CONFIRM RESET</div>
          <div class="vb-reset-msg" id="vb-reset-msg"></div>
          <div class="vb-reset-actions">
            <button class="vb-reset-btn" id="vb-reset-cancel-btn">Cancel</button>
            <button class="vb-reset-btn danger" id="vb-reset-ok-btn">Reset</button>
          </div>
        </div>
      `;
      document.body.appendChild(ov);
      ov.querySelector('#vb-reset-cancel-btn').addEventListener('click', () => {
        ov.classList.remove('open');
      });
    }
    ov.querySelector('#vb-reset-msg').textContent = msg;
    ov.querySelector('#vb-reset-ok-btn').onclick = () => {
      ov.classList.remove('open');
      onConfirm();
    };
    ov.classList.add('open');
  }


  /* ════════════════════════════════════════════════════════════════
     ADMIN PANEL INJECTION
     Watches for admin overlay, injects Design + Builder tabs
  ════════════════════════════════════════════════════════════════ */
  function injectAdminTabs() {
    const sidebar  = document.querySelector('.adm-sidebar');
    const content  = document.getElementById('adm-content');
    if (!sidebar || !content) return;
    if (sidebar.querySelector('[data-panel="vb-design"]')) return; /* already injected */

    /* Find System label to insert before it */
    const sysLabel = [...sidebar.querySelectorAll('.adm-nav-label')]
      .find(el => el.textContent.trim() === 'System');
    const footer = sidebar.querySelector('.adm-sidebar-footer');
    const insertBefore = sysLabel || footer;

    /* ── Design tab ── */
    const dsNav = document.createElement('div');
    dsNav.className = 'adm-nav-item';
    dsNav.dataset.panel = 'vb-design';
    dsNav.innerHTML = '<span class="adm-ico" style="color:#f97316">◈</span><span>Design</span>';
    sidebar.insertBefore(dsNav, insertBefore);

    const dsPanel = document.createElement('div');
    dsPanel.className = 'adm-panel';
    dsPanel.id = 'admp-vb-design';
    content.appendChild(dsPanel);
    DesignPanel.buildPanel(dsPanel);

    /* ── Builder tab ── */
    const blNav = document.createElement('div');
    blNav.className = 'adm-nav-item';
    blNav.dataset.panel = 'vb-builder';
    blNav.innerHTML = '<span class="adm-ico" style="color:#22d3ee">⊞</span><span>Builder</span>';
    sidebar.insertBefore(blNav, insertBefore);

    const blPanel = document.createElement('div');
    blPanel.className = 'adm-panel';
    blPanel.id = 'admp-vb-builder';
    content.appendChild(blPanel);
    ColBuilder.buildAdminPanel(blPanel);

    /* Bind nav clicks */
    [dsNav, blNav].forEach(nav => {
      nav.addEventListener('click', () => {
        document.querySelectorAll('.adm-nav-item').forEach(n =>
          n.classList.toggle('adm-active', n === nav));
        document.querySelectorAll('.adm-panel').forEach(p =>
          p.classList.toggle('adm-active', p.id === 'admp-' + nav.dataset.panel));
        const tb = document.getElementById('adm-topbar-title');
        if (tb) tb.textContent = nav.querySelector('span:last-child')?.textContent + ' Panel';
      });
    });
  }

  function watchAdminOverlay() {
    const mo = new MutationObserver(() => {
      const overlay = document.getElementById('adm-overlay');
      if (overlay && !overlay.querySelector('[data-panel="vb-design"]')) {
        requestAnimationFrame(injectAdminTabs);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    /* Also check if admin overlay already exists */
    if (document.getElementById('adm-overlay')) {
      requestAnimationFrame(injectAdminTabs);
    }
  }


  /* ════════════════════════════════════════════════════════════════
     KEYBOARD SHORTCUTS
  ════════════════════════════════════════════════════════════════ */
  function bindKeyboard() {
    document.addEventListener('keydown', e => {
      /* Only active when admin or edit mode is open */
      const inAdmin = !!document.getElementById('adm-overlay')?.classList.contains('adm-visible');
      const inEdit  = document.body.classList.contains('edit-mode');
      if (!inAdmin && !inEdit) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault(); History.undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault(); History.redo();
      }
    });
  }


  /* ════════════════════════════════════════════════════════════════
     UTILITY
  ════════════════════════════════════════════════════════════════ */
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }


  /* ════════════════════════════════════════════════════════════════
     BOOT
  ════════════════════════════════════════════════════════════════ */
  function boot() {
    /* Part 7 — apply saved design tokens first (before first paint) */
    DesignPanel.init();

    /* Part 3 — apply saved column layouts */
    ColBuilder.init();

    /* Part 4 — init ghost drag */
    GhostDrag.init();

    /* Part 8 — floating toolbar */
    FloatToolbar.init();

    /* Part 1 — theme cycle */
    ThemeCycle.init();

    /* Part 6 — undo/redo history seed */
    History.seed();

    /* Watch for admin overlay */
    watchAdminOverlay();

    /* Keyboard shortcuts */
    bindKeyboard();

    /* Re-inject grip handles after admin re-renders cards */
    const reRenderObs = new MutationObserver(() => {
      if (document.body.classList.contains('edit-mode')) {
        requestAnimationFrame(GhostDrag.injectGripHandles);
      }
    });
    ['.sk-grid', '.projects-grid', '.ach-grid'].forEach(sel => {
      const el = document.querySelector(sel);
      if (el) reRenderObs.observe(el, { childList: true });
    });

    console.log('%c✦ Visual Builder v2.0 — Full Builder System', 'color:#22d3ee;font-family:monospace;font-weight:bold');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    requestAnimationFrame(() => requestAnimationFrame(boot));
  }

})();
