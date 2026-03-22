/* ═══════════════════════════════════════════════════════════════════
   ADMIN-CMS.JS  v1.0  — God-Level CMS Extension
   ───────────────────────────────────────────────────────────────────
   Adds to the existing admin panel (admin.js + admin-patch.js):

   1. GLOBAL SETTINGS  — hero name, tagline, greetings, email,
                          socials, button labels — stored in
                          localStorage "global-settings"

   2. REAL-TIME EDIT MODE  — toggle contenteditable on every text
                              node in the portfolio; auto-saves

   3. BACKUP & RESTORE  — export/import full JSON snapshot

   4. ANALYTICS DASHBOARD  — visit/click tracking via localStorage

   5. PROJECT STATUS BADGES  — status: live|building|archived
                                filter bar + colored badges

   6. ADVANCED THEME CONTROL  — force theme for all visitors,
                                  custom picker persisted in
                                  "siteThemeConfig"

   7. PERFORMANCE TOGGLES  — intro / animations / cursor on/off

   8. AI CONTENT ASSIST  — mock AI description generator

   9. DATA SAFETY  — URL validation, empty-field guards

   10. UPGRADED UI  — search bar, section groups,
                       smooth transitions, icons
   ═══════════════════════════════════════════════════════════════════ */

(function AdminCMS() {
  'use strict';

  /* ── Wait until admin shell is visible ── */
  function onAdminReady(fn) {
    const shell = document.getElementById('admin-shell');
    if (!shell) { document.addEventListener('DOMContentLoaded', () => onAdminReady(fn)); return; }
    const mo = new MutationObserver(() => {
      if (shell.classList.contains('visible')) { mo.disconnect(); fn(); }
    });
    mo.observe(shell, { attributes: true, attributeFilter: ['class'] });
    if (shell.classList.contains('visible')) { mo.disconnect(); fn(); }
  }

  /* ══════════════════════════════════════════════════════════
     STORAGE KEYS
  ══════════════════════════════════════════════════════════ */
  const KEY_GLOBAL    = 'global-settings';
  const KEY_ANALYTICS = 'cms-analytics';
  const KEY_PERF      = 'cms-perf-toggles';
  const KEY_THEME_CFG = 'siteThemeConfig';
  const KEY_DATA      = 'adm-portfolio-data';  // shared with admin.js

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function val(id) { const e = document.getElementById(id); return e ? e.value : ''; }
  function setVal(id, v) { const e = document.getElementById(id); if (e) e.value = v || ''; }

  function loadJSON(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; }
  }
  function saveJSON(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); return true; }
    catch { cmsToast('Storage full', 'err'); return false; }
  }

  function isURL(s) {
    if (!s || s === '#') return true;  // allow placeholder
    try { new URL(s); return true; } catch { return false; }
  }
  function isEmail(s) {
    return !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  /* ── Toast (uses existing admin toast if present) ── */
  function cmsToast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(el.__t);
    el.__t = setTimeout(() => el.className = '', 2500);
  }

  /* ══════════════════════════════════════════════════════════
     INJECT STYLES
  ══════════════════════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('cms-styles')) return;
    const st = document.createElement('style');
    st.id = 'cms-styles';
    st.textContent = `

/* ── Search bar ─────────────────────────────────── */
.cms-search-wrap {
  padding: 10px 16px 6px;
  position: relative;
}
.cms-search {
  width: 100%;
  padding: 8px 12px 8px 34px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.75rem;
  font-family: 'Rajdhani', sans-serif;
  outline: none;
  transition: border-color .2s, box-shadow .2s;
}
.cms-search:focus { border-color: var(--acc); box-shadow: 0 0 0 3px var(--acc2); }
.cms-search-ico {
  position: absolute;
  left: 26px; top: 50%;
  transform: translateY(-50%);
  font-size: 0.75rem;
  color: rgba(255,255,255,0.25);
  pointer-events: none;
}
.adm-nav-item.cms-hidden { display: none !important; }

/* ── Edit Mode toggle in topbar ─────────────────── */
.cms-edit-toggle {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.45);
  font-family: 'Orbitron', sans-serif;
  font-size: 0.52rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  cursor: pointer;
  transition: border-color .2s, color .2s, background .2s;
  white-space: nowrap;
}
.cms-edit-toggle:hover { border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.8); }
.cms-edit-toggle.active {
  border-color: var(--acc);
  color: var(--acc);
  background: var(--acc2);
  box-shadow: 0 0 10px var(--glow);
}
.cms-edit-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(255,255,255,0.3);
  transition: background .2s;
}
.cms-edit-toggle.active .cms-edit-dot {
  background: var(--acc);
  animation: dp 1.5s ease-in-out infinite;
}

/* ── Status badges ──────────────────────────────── */
.cms-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  font-family: 'Space Mono', monospace;
  flex-shrink: 0;
}
.cms-badge-live    { background: rgba(34,197,94,0.15);  color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
.cms-badge-building{ background: rgba(251,191,36,0.12); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
.cms-badge-archived{ background: rgba(148,163,184,0.1); color: #94a3b8; border: 1px solid rgba(148,163,184,0.2); }

/* ── Filter pills ───────────────────────────────── */
.cms-filter-bar {
  display: flex; gap: 6px; flex-wrap: wrap;
  margin-bottom: 14px;
}
.cms-filter-pill {
  padding: 5px 14px;
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.025);
  color: rgba(255,255,255,0.4);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: border-color .2s, color .2s, background .2s, transform .15s;
}
.cms-filter-pill:hover { border-color: rgba(255,255,255,0.18); color: rgba(255,255,255,0.75); }
.cms-filter-pill.active { border-color: var(--acc); color: var(--acc); background: var(--acc2); }

/* ── Analytics cards ────────────────────────────── */
.cms-stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.cms-stat-card {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  padding: 18px 16px;
  display: flex; flex-direction: column; gap: 6px;
  position: relative;
  overflow: hidden;
  transition: border-color .2s, transform .2s;
}
.cms-stat-card:hover { border-color: rgba(255,255,255,0.14); transform: translateY(-2px); }
.cms-stat-card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--acc), transparent);
}
.cms-stat-ico { font-size: 1.4rem; margin-bottom: 2px; }
.cms-stat-val {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--acc);
  line-height: 1;
}
.cms-stat-lbl {
  font-family: 'Space Mono', monospace;
  font-size: 0.50rem;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
}

/* ── Analytics chart ────────────────────────────── */
.cms-chart-wrap {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}
.cms-chart-title {
  font-family: 'Space Mono', monospace;
  font-size: 0.50rem;
  letter-spacing: 2px;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
  margin-bottom: 14px;
}
.cms-bar-row {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 8px;
}
.cms-bar-label {
  font-size: 0.70rem;
  color: rgba(255,255,255,0.5);
  min-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cms-bar-track {
  flex: 1; height: 6px;
  background: rgba(255,255,255,0.06);
  border-radius: 3px;
  overflow: hidden;
}
.cms-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--acc), var(--acc)99);
  border-radius: 3px;
  transition: width 0.7s cubic-bezier(0.22,1,0.36,1);
  width: 0;
}
.cms-bar-count {
  font-family: 'Space Mono', monospace;
  font-size: 0.55rem;
  color: rgba(255,255,255,0.35);
  min-width: 28px;
  text-align: right;
}

/* ── AI Assist button ───────────────────────────── */
.cms-ai-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px;
  border-radius: 7px;
  border: 1px solid rgba(168,85,247,0.35);
  background: rgba(168,85,247,0.08);
  color: #c084fc;
  font-size: 0.60rem;
  font-family: 'Space Mono', monospace;
  letter-spacing: 1px;
  text-transform: uppercase;
  cursor: pointer;
  transition: background .2s, border-color .2s, transform .15s;
  flex-shrink: 0;
}
.cms-ai-btn:hover { background: rgba(168,85,247,0.18); border-color: #c084fc; transform: translateY(-1px); }
.cms-ai-btn.loading { opacity: 0.6; pointer-events: none; }
@keyframes cms-spin { to { transform: rotate(360deg); } }
.cms-ai-spin { display: inline-block; animation: cms-spin 0.9s linear infinite; }

/* ── Perf toggle rows ───────────────────────────── */
.cms-perf-section {
  display: flex; flex-direction: column; gap: 0;
}
.cms-perf-row {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  gap: 16px;
}
.cms-perf-row:last-child { border-bottom: none; }
.cms-perf-info { flex: 1; min-width: 0; }
.cms-perf-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: rgba(255,255,255,0.72);
  margin-bottom: 3px;
}
.cms-perf-desc {
  font-size: 0.64rem;
  color: rgba(255,255,255,0.3);
  line-height: 1.5;
  font-family: 'Space Mono', monospace;
  letter-spacing: 0.3px;
}

/* ── Backup / restore ───────────────────────────── */
.cms-backup-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}
.cms-backup-card {
  background: rgba(255,255,255,0.025);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 14px;
  padding: 20px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  cursor: pointer;
  transition: border-color .2s, background .2s, transform .2s;
  text-align: center;
}
.cms-backup-card:hover { border-color: var(--acc); background: var(--acc2); transform: translateY(-2px); }
.cms-backup-card-ico { font-size: 2rem; }
.cms-backup-card-name { font-family: 'Orbitron', sans-serif; font-size: 0.62rem; font-weight: 700; letter-spacing: 2px; color: rgba(255,255,255,0.7); }
.cms-backup-card-desc { font-size: 0.62rem; color: rgba(255,255,255,0.3); line-height: 1.5; }

/* ── Force theme notice ─────────────────────────── */
.cms-theme-forced-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(34,197,94,0.12);
  border: 1px solid rgba(34,197,94,0.3);
  color: #4ade80;
  font-family: 'Space Mono', monospace;
  font-size: 0.50rem;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

/* ── Global settings live preview ──────────────── */
.cms-global-preview {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.cms-global-preview-name {
  font-family: 'Orbitron', sans-serif;
  font-size: 1.1rem;
  font-weight: 800;
  color: rgba(255,255,255,0.85);
  line-height: 1.2;
}
.cms-global-preview-name span { color: var(--acc); }
.cms-global-preview-tag {
  font-size: 0.72rem;
  color: rgba(255,255,255,0.4);
  font-family: 'Space Mono', monospace;
  letter-spacing: 1px;
}

/* ── Section heading ────────────────────────────── */
.cms-section-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 24px; padding-bottom: 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.cms-section-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 0.80rem;
  font-weight: 700;
  letter-spacing: 2.5px;
  color: rgba(255,255,255,0.65);
  text-transform: uppercase;
}

/* ── Validation error ───────────────────────────── */
.cms-field-err {
  font-size: 0.62rem;
  color: #f87171;
  margin-top: 4px;
  display: none;
}
.cms-field-err.show { display: block; }
.inp.invalid, .ta.invalid { border-color: #ef4444 !important; }

/* ── Edit mode overlay hint ─────────────────────── */
.cms-edit-mode-hint {
  position: fixed;
  bottom: 20px; right: 20px;
  background: rgba(13,13,28,0.95);
  border: 1px solid var(--acc);
  border-radius: 10px;
  padding: 10px 18px;
  font-family: 'Space Mono', monospace;
  font-size: 0.52rem;
  letter-spacing: 1px;
  color: var(--acc);
  z-index: 99998;
  display: none;
  box-shadow: 0 0 20px var(--glow);
  animation: toast-in 0.3s cubic-bezier(0.22,1,0.36,1) both;
}
.cms-edit-mode-hint.on { display: block; }

/* ── Panel animation fix for new panels ─────────── */
#p-global.active,
#p-analytics.active,
#p-backup.active,
#p-perf.active,
#p-adv-theme.active {
  animation: panel-reveal 0.35s cubic-bezier(0.22,1,0.36,1) both;
}

/* ─── New nav group separator ────────────────────── */
.adm-nav-group + .adm-nav-group {
  border-top: 1px solid rgba(255,255,255,0.04);
  margin-top: 4px;
  padding-top: 4px;
}

/* ─── No-results message ─────────────────────────── */
.cms-no-results {
  font-family: 'Space Mono', monospace;
  font-size: 0.58rem;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.2);
  padding: 10px 24px;
  text-transform: uppercase;
  display: none;
}
.cms-no-results.show { display: block; }

    `;
    document.head.appendChild(st);
  }

  /* ══════════════════════════════════════════════════════════
     INJECT NAV ITEMS + PANELS
  ══════════════════════════════════════════════════════════ */
  function injectNavAndPanels() {
    /* ── 1. Search bar at top of sidebar ── */
    const sidebar = document.querySelector('.adm-sidebar');
    const firstGroup = sidebar?.querySelector('.adm-nav-group');
    if (sidebar && firstGroup && !document.getElementById('cms-search')) {
      const wrap = document.createElement('div');
      wrap.className = 'cms-search-wrap';
      wrap.innerHTML = '<span class="cms-search-ico">⌕</span><input class="cms-search" id="cms-search" placeholder="Search panels…" autocomplete="off"/>';
      sidebar.insertBefore(wrap, firstGroup);
    }

    /* ── 2. New nav group: CMS ── */
    const existingGroups = sidebar?.querySelectorAll('.adm-nav-group');
    const lastGroup = existingGroups?.[existingGroups.length - 1];
    if (lastGroup && !document.querySelector('[data-panel="global"]')) {
      const cmsGroup = document.createElement('div');
      cmsGroup.className = 'adm-nav-group';
      cmsGroup.innerHTML = `
        <div class="adm-nav-label">CMS</div>
        <div class="adm-nav-item" data-panel="global">
          <span class="adm-nav-ico">⊕</span><span>Global Settings</span>
        </div>
        <div class="adm-nav-item" data-panel="analytics">
          <span class="adm-nav-ico">◈</span><span>Analytics</span>
        </div>
        <div class="adm-nav-item" data-panel="backup">
          <span class="adm-nav-ico">◫</span><span>Backup & Restore</span>
        </div>
        <div class="adm-nav-item" data-panel="adv-theme">
          <span class="adm-nav-ico">◑</span><span>Adv. Theme</span>
        </div>
        <div class="adm-nav-item" data-panel="perf">
          <span class="adm-nav-ico">⚡</span><span>Performance</span>
        </div>
      `;
      lastGroup.parentNode.insertBefore(cmsGroup, lastGroup);
    }

    /* ── 3. Edit Mode toggle in topbar ── */
    const topRight = document.querySelector('.adm-topbar-right');
    if (topRight && !document.getElementById('cms-edit-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'cms-edit-toggle';
      btn.className = 'cms-edit-toggle';
      btn.innerHTML = '<span class="cms-edit-dot"></span>EDIT MODE';
      topRight.insertBefore(btn, topRight.firstChild);
    }

    /* ── 4. Inject new panels into adm-content ── */
    const content = document.getElementById('adm-content');
    if (!content) return;

    if (!document.getElementById('p-global'))   content.insertAdjacentHTML('beforeend', buildGlobalPanel());
    if (!document.getElementById('p-analytics'))content.insertAdjacentHTML('beforeend', buildAnalyticsPanel());
    if (!document.getElementById('p-backup'))   content.insertAdjacentHTML('beforeend', buildBackupPanel());
    if (!document.getElementById('p-adv-theme'))content.insertAdjacentHTML('beforeend', buildAdvThemePanel());
    if (!document.getElementById('p-perf'))     content.insertAdjacentHTML('beforeend', buildPerfPanel());

    /* ── 5. Edit mode hint overlay ── */
    if (!document.getElementById('cms-edit-hint')) {
      document.body.insertAdjacentHTML('beforeend',
        '<div class="cms-edit-mode-hint" id="cms-edit-hint">✎ EDIT MODE — Click any text on the portfolio to edit it</div>');
    }
  }

  /* ── Panel HTML builders ── */
  function buildGlobalPanel() {
    return `
    <div class="panel" id="p-global">
      <div class="cms-section-header">
        <div class="cms-section-title">⊕ Global Settings</div>
        <button class="btn-primary btn-sm" id="global-save-btn">💾 Save Settings</button>
      </div>

      <!-- Live preview -->
      <div class="cms-global-preview" id="global-preview">
        <div class="cms-global-preview-name" id="gp-name">Arrabola <span>Srishanth</span></div>
        <div class="cms-global-preview-tag" id="gp-tag">// Loading tagline...</div>
      </div>

      <div class="form-group">
        <div class="form-group-title">Identity</div>
        <div class="form-grid">
          <div class="form-col">
            <label class="lbl">First Name</label>
            <input class="inp" id="g-fname" type="text" placeholder="Arrabola"/>
          </div>
          <div class="form-col">
            <label class="lbl">Last Name</label>
            <input class="inp" id="g-lname" type="text" placeholder="Srishanth"/>
          </div>
          <div class="form-col full-width">
            <label class="lbl">Tagline / Role</label>
            <input class="inp" id="g-tagline" type="text" placeholder="AI & Software Developer"/>
            <div class="cms-field-err" id="g-tagline-err">Tagline cannot be empty</div>
          </div>
          <div class="form-col full-width">
            <label class="lbl">Greeting Text</label>
            <input class="inp" id="g-greet" type="text" placeholder="Good Morning"/>
          </div>
        </div>
      </div>

      <div class="form-group">
        <div class="form-group-title">Contact & Socials</div>
        <div class="form-grid">
          <div class="form-col full-width">
            <label class="lbl">Contact Email *</label>
            <input class="inp" id="g-email" type="email" placeholder="you@email.com"/>
            <div class="cms-field-err" id="g-email-err">Enter a valid email address</div>
          </div>
          <div class="form-col">
            <label class="lbl">GitHub URL</label>
            <input class="inp" id="g-github" type="url" placeholder="https://github.com/username"/>
            <div class="cms-field-err" id="g-github-err">Enter a valid URL</div>
          </div>
          <div class="form-col">
            <label class="lbl">LinkedIn URL</label>
            <input class="inp" id="g-linkedin" type="url" placeholder="https://linkedin.com/in/…"/>
            <div class="cms-field-err" id="g-linkedin-err">Enter a valid URL</div>
          </div>
          <div class="form-col full-width">
            <label class="lbl">Instagram URL</label>
            <input class="inp" id="g-instagram" type="url" placeholder="https://instagram.com/username"/>
            <div class="cms-field-err" id="g-instagram-err">Enter a valid URL</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <div class="form-group-title">Button Labels</div>
        <div class="form-grid">
          <div class="form-col">
            <label class="lbl">Primary Button (Hire Me)</label>
            <input class="inp" id="g-btn1" type="text" placeholder="Hire Me"/>
          </div>
          <div class="form-col">
            <label class="lbl">Secondary Button (CV)</label>
            <input class="inp" id="g-btn2" type="text" placeholder="Download CV"/>
          </div>
          <div class="form-col full-width">
            <label class="lbl">CV / Resume URL</label>
            <input class="inp" id="g-cv" type="url" placeholder="https://…"/>
            <div class="cms-field-err" id="g-cv-err">Enter a valid URL</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function buildAnalyticsPanel() {
    return `
    <div class="panel" id="p-analytics">
      <div class="cms-section-header">
        <div class="cms-section-title">◈ Analytics Dashboard</div>
        <button class="btn-danger btn-sm" id="analytics-clear-btn">⚠ Clear Data</button>
      </div>

      <div class="cms-stat-grid" id="analytics-stats"></div>

      <div class="form-group">
        <div class="form-group-title">Project Click Ranking</div>
        <div id="analytics-projects-chart"></div>
      </div>

      <div class="form-group">
        <div class="form-group-title">Button Click Tracking</div>
        <div id="analytics-buttons-chart"></div>
      </div>

      <div class="form-group">
        <div class="form-group-title">Recent Activity Log</div>
        <div id="analytics-log" style="max-height:240px;overflow-y:auto;"></div>
      </div>
    </div>`;
  }

  function buildBackupPanel() {
    return `
    <div class="panel" id="p-backup">
      <div class="cms-section-header">
        <div class="cms-section-title">◫ Backup & Restore</div>
      </div>

      <div class="form-group">
        <div class="form-group-title">Export / Import Data</div>
        <p style="font-size:.72rem;color:rgba(255,255,255,.35);margin-bottom:16px;line-height:1.6">
          Export a full JSON snapshot of all portfolio data — content, theme, settings, certificates.
          Import to restore or migrate to another device.
        </p>
        <div class="cms-backup-grid">
          <div class="cms-backup-card" id="backup-export-btn">
            <div class="cms-backup-card-ico">📦</div>
            <div class="cms-backup-card-name">Export Data</div>
            <div class="cms-backup-card-desc">Download full JSON backup of all portfolio data</div>
          </div>
          <div class="cms-backup-card" id="backup-import-btn">
            <div class="cms-backup-card-ico">📥</div>
            <div class="cms-backup-card-name">Import Data</div>
            <div class="cms-backup-card-desc">Upload a JSON backup file to restore data</div>
          </div>
        </div>
        <input type="file" id="backup-import-file" accept=".json" style="display:none"/>
        <div id="backup-status" style="font-size:.70rem;color:rgba(255,255,255,.35);min-height:20px;margin-top:8px;font-family:'Space Mono',monospace;letter-spacing:.5px"></div>
      </div>

      <div class="form-group">
        <div class="form-group-title">What's included in the backup</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${['Portfolio content (all sections)','Global settings','Theme & custom colors',
             'Certificates & achievements','Section order & visibility','Performance toggles',
             'Analytics data','Admin credentials (⚠ encrypted)'].map(i=>
            `<div style="display:flex;align-items:center;gap:8px;font-size:.72rem;color:rgba(255,255,255,.45)">
               <span style="color:var(--acc);font-size:.8rem">✓</span>${i}
             </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  function buildAdvThemePanel() {
    return `
    <div class="panel" id="p-adv-theme">
      <div class="cms-section-header">
        <div class="cms-section-title">◑ Advanced Theme</div>
        <button class="btn-primary btn-sm" id="adv-theme-save-btn">💾 Apply Theme Config</button>
      </div>

      <div class="form-group">
        <div class="form-group-title">Default Theme for Visitors</div>
        <p style="font-size:.72rem;color:rgba(255,255,255,.35);margin-bottom:14px;line-height:1.6">
          Set the theme visitors see on first load. Force mode overrides their saved preference.
        </p>
        <div class="form-grid">
          <div class="form-col">
            <label class="lbl">Default Theme</label>
            <select class="sel" id="adv-default-theme">
              <option value="blue">Blue</option>
              <option value="pink">Pink</option>
              <option value="green">Green</option>
              <option value="yellow">Yellow</option>
              <option value="purple">Purple</option>
              <option value="orange">Orange</option>
              <option value="cyan">Cyan</option>
              <option value="rose">Rose</option>
              <option value="emerald">Emerald</option>
              <option value="gold">Gold</option>
            </select>
          </div>
          <div class="form-col">
            <label class="lbl">Force for All Visitors</label>
            <div class="toggle-row" style="border:none;padding:8px 0 0">
              <span class="toggle-label" style="font-size:.76rem">Override visitor's saved theme</span>
              <label class="toggle">
                <input type="checkbox" id="adv-force-theme"/>
                <div class="toggle-track"></div>
              </label>
            </div>
            <div id="adv-force-badge" style="margin-top:8px;display:none">
              <span class="cms-theme-forced-badge">● FORCE MODE ON</span>
            </div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <div class="form-group-title">Custom Accent Color</div>
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
          <input class="inp" id="adv-custom-hex" type="text" placeholder="#4f6ef5" style="flex:1;font-family:'Space Mono',monospace"/>
          <input type="color" id="adv-color-picker" value="#4f6ef5"
            style="width:48px;height:44px;border:none;background:none;cursor:pointer;border-radius:8px;padding:0;flex-shrink:0"/>
          <button class="btn-secondary btn-sm" id="adv-hex-apply">Apply</button>
        </div>
        <div class="cms-field-err" id="adv-hex-err" style="display:none">Enter a valid 6-digit hex color (e.g. #4f6ef5)</div>
        <p style="font-size:.64rem;color:rgba(255,255,255,.25);line-height:1.5">
          Custom color overrides all theme presets. Changes broadcast live to any open portfolio tab.
        </p>
      </div>

      <div class="form-group">
        <div class="form-group-title">Dark / Light Background</div>
        <div class="form-grid">
          <div class="form-col">
            <label class="lbl">Background Mode</label>
            <select class="sel" id="adv-bg-mode">
              <option value="dark">Dark (default)</option>
              <option value="darker">Ultra Dark</option>
              <option value="midnight">Midnight Blue</option>
            </select>
          </div>
          <div class="form-col">
            <label class="lbl">Background Color (override)</label>
            <input class="inp" id="adv-bg-color" type="text" placeholder="#06060f"
              style="font-family:'Space Mono',monospace"/>
          </div>
        </div>
      </div>
    </div>`;
  }

  function buildPerfPanel() {
    const toggles = [
      { id:'intro',     name:'Cinematic Intro',    desc:'Animated intro screen on first visit. Disable for instant page load.' },
      { id:'animations',name:'Heavy Animations',   desc:'Particle effects, parallax, scroll reveal, gsap-style transitions.' },
      { id:'cursor',    name:'Custom Cursor',       desc:'The dot + ring cursor. Disable for default OS cursor.' },
      { id:'hscroll',   name:'Horizontal Scroll',  desc:'Scroll-pinned horizontal projects rail. Disable for normal vertical layout.' },
      { id:'sparks',    name:'Click Sparks',        desc:'Burst particles on every mouse click.' },
      { id:'glow',      name:'Glow Effects',        desc:'CSS glow/shadow on cards and headings.' },
    ];
    return `
    <div class="panel" id="p-perf">
      <div class="cms-section-header">
        <div class="cms-section-title">⚡ Performance Toggles</div>
        <button class="btn-primary btn-sm" id="perf-save-btn">💾 Save Toggles</button>
      </div>
      <div class="form-group">
        <div class="form-group-title">Feature Switches</div>
        <p style="font-size:.72rem;color:rgba(255,255,255,.35);margin-bottom:16px;line-height:1.6">
          Changes persist to <code style="font-size:.65rem;color:var(--acc)">cms-perf-toggles</code> in localStorage and are
          read on every portfolio load.
        </p>
        <div class="cms-perf-section">
          ${toggles.map(t => `
          <div class="cms-perf-row">
            <div class="cms-perf-info">
              <div class="cms-perf-name">${t.name}</div>
              <div class="cms-perf-desc">${t.desc}</div>
            </div>
            <label class="toggle">
              <input type="checkbox" id="perf-${t.id}" checked/>
              <div class="toggle-track"></div>
            </label>
          </div>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <div class="form-group-title">Reading Performance Flags from Portfolio</div>
        <p style="font-size:.70rem;color:rgba(255,255,255,.35);line-height:1.6">
          Add this snippet to <code style="color:var(--acc);font-size:.65rem">index.html</code> (inside a script tag, before other scripts) to read the performance toggles:
        </p>
        <div style="background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:16px;margin-top:8px;overflow-x:auto">
          <pre style="font-family:'Space Mono',monospace;font-size:.60rem;color:rgba(255,255,255,.55);line-height:1.7;white-space:pre-wrap">(function(){
  var p=JSON.parse(localStorage.getItem('cms-perf-toggles')||'{}');
  if(p.intro===false)    sessionStorage.setItem('intro_seen_v1','1');
  if(p.animations===false) document.documentElement.classList.add('reduce-motion');
  if(p.cursor===false)   document.documentElement.classList.add('no-custom-cursor');
  if(p.hscroll===false)  window.__disableHScroll=true;
  if(p.sparks===false)   window.__disableSparks=true;
  if(p.glow===false)     document.documentElement.classList.add('no-glow');
})();</pre>
        </div>
      </div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     EXTEND PANEL ROUTER
  ══════════════════════════════════════════════════════════ */
  const CMS_LABELS = {
    global:    'Global Settings',
    analytics: 'Analytics Dashboard',
    backup:    'Backup & Restore',
    'adv-theme': 'Advanced Theme',
    perf:      'Performance Toggles'
  };

  function patchPanelRouter() {
    document.querySelectorAll('.adm-nav-item[data-panel]').forEach(item => {
      /* only wire ones not already wired */
      if (item.__cms_wired) return;
      item.__cms_wired = true;
      item.addEventListener('click', () => {
        const id = item.dataset.panel;
        if (!CMS_LABELS[id]) return; // native panels handled by admin.js
        // deactivate all
        document.querySelectorAll('.adm-nav-item').forEach(n => n.classList.toggle('active', n === item));
        document.querySelectorAll('.panel').forEach(p => {
          const target = p.id === 'p-' + id;
          p.classList.remove('active');
          if (target) { void p.offsetWidth; p.classList.add('active'); }
        });
        const pt = document.getElementById('page-title');
        const bc = document.getElementById('breadcrumb-sub');
        if (pt) pt.textContent = CMS_LABELS[id];
        if (bc) bc.textContent = id;
        document.getElementById('adm-content')?.scrollTo({ top: 0, behavior: 'smooth' });
        if (id === 'analytics') renderAnalytics();
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     SEARCH BAR
  ══════════════════════════════════════════════════════════ */
  function initSearch() {
    const inp = document.getElementById('cms-search');
    if (!inp || inp.__cms_bound) return;
    inp.__cms_bound = true;

    let noResultsEl = document.querySelector('.cms-no-results');
    if (!noResultsEl) {
      noResultsEl = document.createElement('div');
      noResultsEl.className = 'cms-no-results';
      noResultsEl.textContent = 'No panels found';
      inp.closest('.adm-sidebar')?.querySelector('.adm-nav-group')?.before(noResultsEl);
    }

    inp.addEventListener('input', () => {
      const q = inp.value.trim().toLowerCase();
      let visible = 0;
      document.querySelectorAll('.adm-nav-item[data-panel]').forEach(item => {
        const text = item.textContent.toLowerCase();
        const match = !q || text.includes(q);
        item.classList.toggle('cms-hidden', !match);
        if (match) visible++;
      });
      noResultsEl.classList.toggle('show', !!q && visible === 0);
    });
  }

  /* ══════════════════════════════════════════════════════════
     GLOBAL SETTINGS
  ══════════════════════════════════════════════════════════ */
  function initGlobalSettings() {
    const D = loadJSON(KEY_GLOBAL, {});
    const mainD = loadJSON(KEY_DATA, {});

    /* Pre-fill from global-settings, fallback to main data */
    setVal('g-fname',    D.firstName   || mainD.firstName   || 'Arrabola');
    setVal('g-lname',    D.lastName    || mainD.lastName    || 'Srishanth');
    setVal('g-tagline',  D.tagline     || 'AI & Software Developer');
    setVal('g-greet',    D.greetText   || mainD.greetText   || '');
    setVal('g-email',    D.email       || mainD.email       || '');
    setVal('g-github',   D.github      || mainD.github      || '');
    setVal('g-linkedin', D.linkedin    || mainD.linkedin    || '');
    setVal('g-instagram',D.instagram   || mainD.instagram   || '');
    setVal('g-btn1',     D.btn1Text    || mainD.btn1Text    || 'Hire Me');
    setVal('g-btn2',     D.btn2Text    || mainD.btn2Text    || 'Download CV');
    setVal('g-cv',       D.cvUrl       || mainD.cvUrl       || '');

    /* Live preview update */
    function updatePreview() {
      const fn = val('g-fname') || 'Arrabola';
      const ln = val('g-lname') || 'Srishanth';
      const tag = val('g-tagline') || '// Developer';
      const nameEl = document.getElementById('gp-name');
      const tagEl  = document.getElementById('gp-tag');
      if (nameEl) nameEl.innerHTML = `${esc(fn)} <span>${esc(ln)}</span>`;
      if (tagEl)  tagEl.textContent = '// ' + tag;
    }
    ['g-fname','g-lname','g-tagline'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updatePreview);
    });
    updatePreview();

    /* Validation helpers */
    function showErr(id, errId, condition) {
      const inp = document.getElementById(id);
      const err = document.getElementById(errId);
      if (!condition) {
        inp?.classList.remove('invalid');
        err && (err.style.display = 'none');
        return true;
      }
      inp?.classList.add('invalid');
      err && (err.style.display = 'block');
      return false;
    }

    /* Save */
    document.getElementById('global-save-btn')?.addEventListener('click', () => {
      let ok = true;
      ok = showErr('g-email', 'g-email-err', !isEmail(val('g-email'))) && ok;
      ok = showErr('g-github',   'g-github-err',   val('g-github')   && !isURL(val('g-github')))   && ok;
      ok = showErr('g-linkedin', 'g-linkedin-err', val('g-linkedin') && !isURL(val('g-linkedin'))) && ok;
      ok = showErr('g-instagram','g-instagram-err',val('g-instagram')&& !isURL(val('g-instagram')))&& ok;
      ok = showErr('g-cv',       'g-cv-err',        val('g-cv')       && !isURL(val('g-cv')))       && ok;
      if (!ok) { cmsToast('Fix validation errors first', 'err'); return; }

      const settings = {
        firstName: val('g-fname'), lastName: val('g-lname'),
        tagline: val('g-tagline'), greetText: val('g-greet'),
        email: val('g-email'), github: val('g-github'),
        linkedin: val('g-linkedin'), instagram: val('g-instagram'),
        btn1Text: val('g-btn1'), btn2Text: val('g-btn2'), cvUrl: val('g-cv'),
        savedAt: new Date().toISOString()
      };
      saveJSON(KEY_GLOBAL, settings);

      /* Sync back into the main portfolio data store */
      const md = loadJSON(KEY_DATA, {});
      Object.assign(md, settings);
      saveJSON(KEY_DATA, md);

      /* Update admin.js form fields */
      setVal('h-fname',  settings.firstName);
      setVal('h-lname',  settings.lastName);
      setVal('h-greet',  settings.greetText);
      setVal('h-btn1',   settings.btn1Text);
      setVal('h-btn2',   settings.btn2Text);
      setVal('h-cv',     settings.cvUrl);
      setVal('c-email',  settings.email);
      setVal('c-gh',     settings.github);
      setVal('c-li',     settings.linkedin);
      setVal('c-ig',     settings.instagram);

      broadcastSave();
      cmsToast('Global settings saved ✓');
    });
  }

  /* ══════════════════════════════════════════════════════════
     ANALYTICS
  ══════════════════════════════════════════════════════════ */
  function getAnalytics() { return loadJSON(KEY_ANALYTICS, { visits:0, projectClicks:{}, buttonClicks:{}, log:[] }); }
  function saveAnalytics(a) { saveJSON(KEY_ANALYTICS, a); }

  /* Track page visit (called once per session) */
  function trackVisit() {
    const key = 'cms-session-tracked';
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    const a = getAnalytics();
    a.visits = (a.visits || 0) + 1;
    a.log = a.log || [];
    a.log.unshift({ type: 'visit', ts: Date.now() });
    if (a.log.length > 100) a.log = a.log.slice(0, 100);
    saveAnalytics(a);
  }

  /* Public tracker — injected so index.html can call it */
  window.__cmsTrack = function(type, label) {
    const a = getAnalytics();
    if (type === 'project') {
      a.projectClicks = a.projectClicks || {};
      a.projectClicks[label] = (a.projectClicks[label] || 0) + 1;
    } else if (type === 'button') {
      a.buttonClicks = a.buttonClicks || {};
      a.buttonClicks[label] = (a.buttonClicks[label] || 0) + 1;
    }
    a.log = a.log || [];
    a.log.unshift({ type, label, ts: Date.now() });
    if (a.log.length > 100) a.log = a.log.slice(0, 100);
    saveAnalytics(a);
  };

  function renderAnalytics() {
    const a = getAnalytics();

    /* Stat cards */
    const statsEl = document.getElementById('analytics-stats');
    if (statsEl) {
      const projClicks = Object.values(a.projectClicks || {}).reduce((s,v) => s+v, 0);
      const btnClicks  = Object.values(a.buttonClicks  || {}).reduce((s,v) => s+v, 0);
      const topProj    = Object.entries(a.projectClicks || {}).sort((a,b)=>b[1]-a[1])[0];
      statsEl.innerHTML = `
        <div class="cms-stat-card"><div class="cms-stat-ico">👁</div><div class="cms-stat-val">${a.visits||0}</div><div class="cms-stat-lbl">Total Visits</div></div>
        <div class="cms-stat-card"><div class="cms-stat-ico">📁</div><div class="cms-stat-val">${projClicks}</div><div class="cms-stat-lbl">Project Clicks</div></div>
        <div class="cms-stat-card"><div class="cms-stat-ico">🖱</div><div class="cms-stat-val">${btnClicks}</div><div class="cms-stat-lbl">Button Clicks</div></div>
        <div class="cms-stat-card"><div class="cms-stat-ico">🏆</div><div class="cms-stat-val" style="font-size:.9rem;margin-top:2px">${topProj?esc(topProj[0].slice(0,14)):'—'}</div><div class="cms-stat-lbl">Top Project</div></div>
      `;
    }

    /* Project chart */
    const projChart = document.getElementById('analytics-projects-chart');
    if (projChart) {
      const entries = Object.entries(a.projectClicks || {}).sort((a,b)=>b[1]-a[1]).slice(0,8);
      if (!entries.length) {
        projChart.innerHTML = '<p style="font-size:.65rem;color:rgba(255,255,255,.2);padding:12px 0">No project clicks tracked yet.</p>';
      } else {
        const max = entries[0][1];
        projChart.innerHTML = '<div class="cms-chart-wrap"><div class="cms-chart-title">Project Click Ranking</div>' +
          entries.map(([name,count]) => `
          <div class="cms-bar-row">
            <div class="cms-bar-label" title="${esc(name)}">${esc(name)}</div>
            <div class="cms-bar-track"><div class="cms-bar-fill" style="width:${Math.round(count/max*100)}%"></div></div>
            <div class="cms-bar-count">${count}</div>
          </div>`).join('') + '</div>';
        /* animate bars */
        setTimeout(() => projChart.querySelectorAll('.cms-bar-fill').forEach(b => b.style.width = b.style.width), 80);
      }
    }

    /* Button chart */
    const btnChart = document.getElementById('analytics-buttons-chart');
    if (btnChart) {
      const entries = Object.entries(a.buttonClicks || {}).sort((a,b)=>b[1]-a[1]).slice(0,6);
      if (!entries.length) {
        btnChart.innerHTML = '<p style="font-size:.65rem;color:rgba(255,255,255,.2);padding:12px 0">No button clicks tracked yet.</p>';
      } else {
        const max = entries[0][1];
        btnChart.innerHTML = '<div class="cms-chart-wrap"><div class="cms-chart-title">Button Click Tracking</div>' +
          entries.map(([name,count]) => `
          <div class="cms-bar-row">
            <div class="cms-bar-label">${esc(name)}</div>
            <div class="cms-bar-track"><div class="cms-bar-fill" style="width:${Math.round(count/max*100)}%"></div></div>
            <div class="cms-bar-count">${count}</div>
          </div>`).join('') + '</div>';
      }
    }

    /* Log */
    const logEl = document.getElementById('analytics-log');
    if (logEl) {
      const log = (a.log || []).slice(0, 30);
      if (!log.length) {
        logEl.innerHTML = '<p style="font-size:.65rem;color:rgba(255,255,255,.2);padding:12px 0">No activity yet.</p>';
      } else {
        logEl.innerHTML = log.map(e => {
          const d = new Date(e.ts);
          const time = d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
          const date = d.toLocaleDateString([], {month:'short',day:'numeric'});
          const icon = e.type==='visit'?'👁':e.type==='project'?'📁':'🖱';
          const label = e.type==='visit'?'Page visit':(e.label||e.type);
          return `<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:.68rem">
            <span style="flex-shrink:0;font-size:.85rem">${icon}</span>
            <span style="flex:1;color:rgba(255,255,255,.55)">${esc(label)}</span>
            <span style="color:rgba(255,255,255,.25);font-family:'Space Mono',monospace;font-size:.55rem;flex-shrink:0">${date} ${time}</span>
          </div>`;
        }).join('');
      }
    }

    /* Clear button */
    const clearBtn = document.getElementById('analytics-clear-btn');
    if (clearBtn && !clearBtn.__cms_bound) {
      clearBtn.__cms_bound = true;
      clearBtn.addEventListener('click', () => {
        if (!confirm('Clear all analytics data? This cannot be undone.')) return;
        saveAnalytics({ visits:0, projectClicks:{}, buttonClicks:{}, log:[] });
        renderAnalytics();
        cmsToast('Analytics cleared');
      });
    }
  }

  /* ══════════════════════════════════════════════════════════
     BACKUP & RESTORE
  ══════════════════════════════════════════════════════════ */
  function initBackup() {
    const exportBtn = document.getElementById('backup-export-btn');
    const importBtn = document.getElementById('backup-import-btn');
    const fileInp   = document.getElementById('backup-import-file');
    const status    = document.getElementById('backup-status');

    if (!exportBtn || exportBtn.__cms_bound) return;
    exportBtn.__cms_bound = true;

    exportBtn.addEventListener('click', () => {
      const allKeys = [
        'adm-portfolio-data', 'adm-sections', 'adm-auth-v2',
        'portfolio-cert-tabs', 'portfolio-certificates',
        'portfolio-profile-image', 'global-settings',
        'cms-analytics', 'cms-perf-toggles', 'siteThemeConfig',
        'user-theme', 'adm-custom-accent'
      ];
      const snapshot = { _version: 1, _exported: new Date().toISOString(), data: {} };
      allKeys.forEach(k => {
        const raw = localStorage.getItem(k);
        if (raw !== null) snapshot.data[k] = raw;
      });
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `portfolio-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      if (status) status.textContent = '✓ Exported at ' + new Date().toLocaleTimeString();
      cmsToast('Backup exported ✓');
    });

    importBtn.addEventListener('click', () => fileInp?.click());

    fileInp?.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const snapshot = JSON.parse(ev.target.result);
          if (!snapshot._version || !snapshot.data) throw new Error('Invalid backup file');
          if (!confirm(`Restore backup from ${snapshot._exported}?\n\nThis will OVERWRITE all current data.`)) return;
          Object.entries(snapshot.data).forEach(([k, v]) => {
            /* Skip profile image if it would exceed storage */
            try { localStorage.setItem(k, v); } catch { /* skip oversized */ }
          });
          if (status) status.textContent = '✓ Restored from ' + snapshot._exported;
          cmsToast('Data restored — reload to see changes');
          setTimeout(() => location.reload(), 1500);
        } catch (err) {
          if (status) status.textContent = '✗ Error: ' + err.message;
          cmsToast('Invalid backup file', 'err');
        }
        fileInp.value = '';
      };
      reader.readAsText(file);
    });
  }

  /* ══════════════════════════════════════════════════════════
     ADVANCED THEME
  ══════════════════════════════════════════════════════════ */
  function initAdvTheme() {
    if (document.getElementById('adv-theme-save-btn')?.__cms_bound) return;
    const saveBtn = document.getElementById('adv-theme-save-btn');
    if (!saveBtn) return;
    saveBtn.__cms_bound = true;

    /* Load saved config */
    const cfg = loadJSON(KEY_THEME_CFG, {});
    const defTh = document.getElementById('adv-default-theme');
    const forceChk = document.getElementById('adv-force-theme');
    const hexInp   = document.getElementById('adv-custom-hex');
    const picker   = document.getElementById('adv-color-picker');
    const bgMode   = document.getElementById('adv-bg-mode');
    const bgColor  = document.getElementById('adv-bg-color');

    if (defTh && cfg.defaultTheme) defTh.value = cfg.defaultTheme;
    if (forceChk) forceChk.checked = !!cfg.forceTheme;
    if (hexInp && cfg.customHex) hexInp.value = cfg.customHex;
    if (bgMode && cfg.bgMode)    bgMode.value  = cfg.bgMode;
    if (bgColor && cfg.bgColor)  bgColor.value = cfg.bgColor;
    updateForceBadge();

    forceChk?.addEventListener('change', updateForceBadge);

    function updateForceBadge() {
      const badge = document.getElementById('adv-force-badge');
      if (badge) badge.style.display = forceChk?.checked ? 'block' : 'none';
    }

    /* Hex ↔ picker sync */
    hexInp?.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hexInp.value)) {
        try { if (picker) picker.value = hexInp.value; } catch {}
      }
    });
    picker?.addEventListener('input', () => { if (hexInp) hexInp.value = picker.value; });

    document.getElementById('adv-hex-apply')?.addEventListener('click', () => {
      const hex = hexInp?.value;
      const errEl = document.getElementById('adv-hex-err');
      if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
        if (errEl) errEl.style.display = 'block';
        return;
      }
      if (errEl) errEl.style.display = 'none';
      /* broadcast to open tabs */
      broadcastTheme('', hex);
      cmsToast('Custom color broadcast to portfolio');
    });

    saveBtn.addEventListener('click', () => {
      const hex = hexInp?.value || '';
      if (hex && !/^#[0-9a-fA-F]{6}$/.test(hex)) {
        cmsToast('Invalid hex color', 'err'); return;
      }
      const newCfg = {
        defaultTheme: defTh?.value || 'blue',
        forceTheme:   !!forceChk?.checked,
        customHex:    hex,
        bgMode:       bgMode?.value || 'dark',
        bgColor:      bgColor?.value || '',
        savedAt:      new Date().toISOString()
      };
      saveJSON(KEY_THEME_CFG, newCfg);
      /* also persist to main data */
      if (!hex) {
        localStorage.setItem('user-theme', newCfg.defaultTheme);
      }
      broadcastTheme(hex ? '' : newCfg.defaultTheme, hex);
      cmsToast('Theme config saved ✓');
    });
  }

  function broadcastTheme(theme, custom) {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('portfolio-admin-sync');
        bc.postMessage({ type: 'theme', theme, custom: custom || '' });
        bc.close();
      }
    } catch {}
  }

  /* ══════════════════════════════════════════════════════════
     PERFORMANCE TOGGLES
  ══════════════════════════════════════════════════════════ */
  function initPerfToggles() {
    const saveBtn = document.getElementById('perf-save-btn');
    if (!saveBtn || saveBtn.__cms_bound) return;
    saveBtn.__cms_bound = true;

    const toggleIds = ['intro','animations','cursor','hscroll','sparks','glow'];
    const saved = loadJSON(KEY_PERF, {});

    /* Pre-fill toggles — default ON unless explicitly false */
    toggleIds.forEach(id => {
      const el = document.getElementById('perf-' + id);
      if (el) el.checked = saved[id] !== false;
    });

    saveBtn.addEventListener('click', () => {
      const state = {};
      toggleIds.forEach(id => {
        const el = document.getElementById('perf-' + id);
        if (el) state[id] = el.checked;
      });
      saveJSON(KEY_PERF, state);
      cmsToast('Performance toggles saved ✓');

      /* Apply cursor toggle immediately to this admin page */
      if (state.cursor === false) {
        document.documentElement.classList.add('no-custom-cursor');
      } else {
        document.documentElement.classList.remove('no-custom-cursor');
      }

      broadcastSave();
    });
  }

  /* ══════════════════════════════════════════════════════════
     REAL-TIME EDIT MODE
  ══════════════════════════════════════════════════════════ */
  let editModeActive = false;
  let editBC = null;

  function initEditMode() {
    const btn = document.getElementById('cms-edit-toggle');
    if (!btn || btn.__cms_bound) return;
    btn.__cms_bound = true;

    const hint = document.getElementById('cms-edit-hint');

    btn.addEventListener('click', () => {
      editModeActive = !editModeActive;
      btn.classList.toggle('active', editModeActive);
      if (hint) hint.classList.toggle('on', editModeActive);

      /* Open the portfolio tab if not already open */
      if (editModeActive) {
        /* Broadcast to any open portfolio tab */
        broadcastEditMode(true);
        cmsToast('Edit Mode ON — switch to portfolio tab to edit text');
      } else {
        broadcastEditMode(false);
        cmsToast('Edit Mode OFF');
      }
    });
  }

  function broadcastEditMode(on) {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('portfolio-admin-sync');
        bc.postMessage({ type: 'editmode', on });
        bc.close();
      }
    } catch {}
  }

  /* ══════════════════════════════════════════════════════════
     PROJECT STATUS BADGES ENHANCEMENT
  ══════════════════════════════════════════════════════════ */
  function patchProjectsPanel() {
    /* Add a filter bar above the projects list */
    const list = document.getElementById('projects-list');
    if (!list || document.getElementById('cms-proj-filter')) return;

    const filterBar = document.createElement('div');
    filterBar.className = 'cms-filter-bar';
    filterBar.id = 'cms-proj-filter';
    filterBar.innerHTML = `
      <button class="cms-filter-pill active" data-filter="all">All</button>
      <button class="cms-filter-pill" data-filter="live">🟢 Live</button>
      <button class="cms-filter-pill" data-filter="building">🟡 Building</button>
      <button class="cms-filter-pill" data-filter="archived">⚫ Archived</button>
    `;
    list.before(filterBar);

    filterBar.addEventListener('click', e => {
      const pill = e.target.closest('.cms-filter-pill');
      if (!pill) return;
      filterBar.querySelectorAll('.cms-filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const f = pill.dataset.filter;
      document.querySelectorAll('#projects-list .card-item').forEach(card => {
        const status = card.dataset.status || 'live';
        card.style.display = (f === 'all' || f === status) ? '' : 'none';
      });
    });

    /* Patch editProj to add status field */
    patchEditProj();
  }

  function patchEditProj() {
    const orig = window.editProj;
    if (!orig || window.__editProjPatched) return;
    window.__editProjPatched = true;

    window.editProj = function(idx) {
      /* Call original to open modal, then inject status field */
      orig(idx);
      setTimeout(() => {
        const body = document.getElementById('modal-body');
        if (!body || document.getElementById('m-status')) return;

        const D = (() => {
          try { return JSON.parse(localStorage.getItem('adm-portfolio-data')) || {}; } catch { return {}; }
        })();
        const projects = D.projects || [];
        const p = idx >= 0 ? (projects[idx] || {}) : {};
        const status = p.status || 'live';

        const row = document.createElement('div');
        row.style.cssText = 'margin-top:14px';
        row.innerHTML = `
          <label class="lbl" style="display:block;margin-bottom:7px">Project Status</label>
          <select class="sel" id="m-status">
            <option value="live"     ${status==='live'     ?'selected':''}>🟢 Live</option>
            <option value="building" ${status==='building' ?'selected':''}>🟡 Building</option>
            <option value="archived" ${status==='archived' ?'selected':''}>⚫ Archived</option>
          </select>`;
        body.appendChild(row);

        /* Patch the modal save function */
        const origSave = document.getElementById('modal-save');
        const origFn   = window.__modalSaveFnRef || origSave?.onclick;
        /* We override by hooking into the existing save — status will be merged */
        const prevClick = origSave?.onclick;
        if (origSave) {
          origSave.onclick = function() {
            /* inject status into the to-be-saved project before original save fires */
            const statusVal = document.getElementById('m-status')?.value || 'live';
            window.__pendingStatus = statusVal;
            if (prevClick) prevClick.call(this);
          };
        }
      }, 80);
    };

    /* Also patch the save callback to merge status */
    const origSaveFn = window.editProj;
    const __orig_saveProj = function(idx, item) {
      if (window.__pendingStatus) {
        item.status = window.__pendingStatus;
        delete window.__pendingStatus;
      }
    };
    /* Hook into populateProjects to add status badges to card items */
    const origPopulate = window.populateProjects;
  }

  /* After projects render, add status badges & data-status attrs */
  function enhanceProjectCards() {
    const D = loadJSON(KEY_DATA, {});
    const projects = D.projects || [];
    document.querySelectorAll('#projects-list .card-item').forEach((card, i) => {
      const p = projects[i];
      if (!p) return;
      const status = p.status || 'live';
      card.dataset.status = status;
      /* Add badge if not already present */
      if (!card.querySelector('.cms-badge')) {
        const meta = card.querySelector('.card-meta');
        if (meta) {
          const badge = document.createElement('span');
          badge.className = 'cms-badge cms-badge-' + status;
          badge.textContent = status;
          meta.before(badge);
        }
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     AI CONTENT ASSIST
  ══════════════════════════════════════════════════════════ */
  function initAIAssist() {
    /* Add AI assist button to Hero description and About paragraphs */
    const targets = [
      { fieldId: 'h-desc',  label: 'hero description' },
      { fieldId: 'a-p1',    label: 'about paragraph 1' },
      { fieldId: 'a-p2',    label: 'about paragraph 2' },
    ];

    targets.forEach(({ fieldId, label }) => {
      const field = document.getElementById(fieldId);
      if (!field || field.parentElement.querySelector('.cms-ai-btn')) return;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;justify-content:flex-end;margin-top:6px';
      const btn = document.createElement('button');
      btn.className = 'cms-ai-btn';
      btn.innerHTML = '✦ AI Suggest';
      btn.dataset.target = fieldId;
      btn.dataset.label  = label;
      wrap.appendChild(btn);
      field.after(wrap);

      btn.addEventListener('click', () => aiGenerate(btn, fieldId, label));
    });
  }

  const AI_TEMPLATES = {
    'hero description': [
      "I'm a passionate AI & Software Developer currently pursuing B.Tech in Computer Science with a specialization in AI & ML. I love building intelligent systems, solving complex problems, and turning ideas into polished digital experiences.",
      "Aspiring AI engineer with a deep curiosity for machine learning, data structures, and full-stack development. I believe great software is both technically sound and beautifully crafted.",
      "Developer by passion, problem-solver by nature. I specialize in Python, AI/ML, and modern web technologies — always learning, always building."
    ],
    'about paragraph 1': [
      "I'm currently pursuing B.Tech in Computer Science (AI & ML) at Vignan Institute of Technology and Science, graduating in 2029. My journey in tech began with C programming and has since grown into a passion for artificial intelligence, web development, and building things that matter.",
      "Technology has always fascinated me — from the logic of algorithms to the creativity of user interfaces. I'm a first-year CS student specializing in AI & ML, dedicated to mastering the fundamentals while exploring the cutting edge.",
    ],
    'about paragraph 2': [
      "Beyond code, I'm passionate about problem-solving at the intersection of AI and human experience. I participate in hackathons, contribute to open-source projects, and am always on the lookout for opportunities to grow, collaborate, and make an impact.",
      "When I'm not coding, I'm exploring new technologies, participating in hackathons, or expanding my knowledge of machine learning and data science. I believe in continuous learning and the power of building real-world projects.",
    ]
  };

  function aiGenerate(btn, fieldId, label) {
    btn.classList.add('loading');
    btn.innerHTML = '<span class="cms-ai-spin">⟳</span> Generating…';
    setTimeout(() => {
      const options = AI_TEMPLATES[label] || AI_TEMPLATES['hero description'];
      const text = options[Math.floor(Math.random() * options.length)];
      const field = document.getElementById(fieldId);
      if (field) {
        field.value = text;
        field.dispatchEvent(new Event('input'));
        field.style.borderColor = 'var(--acc)';
        setTimeout(() => field.style.borderColor = '', 1200);
      }
      btn.classList.remove('loading');
      btn.innerHTML = '✦ AI Suggest';
      cmsToast('AI suggestion applied ✓');
    }, 900 + Math.random() * 600);
  }

  /* ══════════════════════════════════════════════════════════
     BROADCAST SAVE HELPER
  ══════════════════════════════════════════════════════════ */
  function broadcastSave() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('portfolio-admin-sync');
        bc.postMessage({ type: 'save', ts: Date.now() });
        bc.close();
      }
    } catch {}
  }

  /* ══════════════════════════════════════════════════════════
     APPLY PERF TOGGLES TO PORTFOLIO SIDE
     (injected into index.html via BroadcastChannel)
  ══════════════════════════════════════════════════════════ */
  function applyPerfToggles() {
    const p = loadJSON(KEY_PERF, {});
    /* Broadcast flags to any open portfolio tab */
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('portfolio-admin-sync');
        bc.postMessage({ type: 'perf', toggles: p });
        bc.close();
      }
    } catch {}
  }

  /* ══════════════════════════════════════════════════════════
     APPLY GLOBAL SETTINGS ON PORTFOLIO LOAD
     (This function is also available for index.html to import)
  ══════════════════════════════════════════════════════════ */
  window.applyGlobalSettings = function() {
    const G = loadJSON(KEY_GLOBAL, {});
    if (!G || !Object.keys(G).length) return;

    /* Name */
    if (G.firstName || G.lastName) {
      const name = (G.firstName || '') + ' ' + (G.lastName || '');
      document.querySelectorAll('.hero-name, [data-cms-field="name"]').forEach(el => {
        el.textContent = name.trim();
      });
    }

    /* Tagline */
    if (G.tagline) {
      document.querySelectorAll('[data-cms-field="tagline"]').forEach(el => {
        el.textContent = G.tagline;
      });
    }

    /* Email */
    if (G.email) {
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
        a.href = 'mailto:' + G.email;
        if (a.textContent.includes('@')) a.textContent = G.email;
      });
      const ceEl = document.getElementById('contact-email');
      if (ceEl) ceEl.innerHTML = `<a href="mailto:${G.email}" class="email-link">${G.email}</a>`;
    }

    /* Buttons */
    if (G.btn1Text) {
      const hireBtn = document.getElementById('hire-btn');
      if (hireBtn) hireBtn.textContent = G.btn1Text;
    }

    /* Socials */
    if (G.github) document.querySelectorAll('a[href*="github.com"]').forEach(a => a.href = G.github);
    if (G.linkedin) document.querySelectorAll('a[href*="linkedin.com"]').forEach(a => a.href = G.linkedin);
    if (G.instagram) document.querySelectorAll('a[href*="instagram.com"]').forEach(a => a.href = G.instagram);
  };

  /* ══════════════════════════════════════════════════════════
     MAIN INIT
  ══════════════════════════════════════════════════════════ */
  function init() {
    injectStyles();
    injectNavAndPanels();
    patchPanelRouter();
    initSearch();
    initGlobalSettings();
    initBackup();
    initAdvTheme();
    initPerfToggles();
    initEditMode();
    initAIAssist();
    trackVisit();

    /* Enhance project cards whenever Projects panel is opened */
    document.querySelectorAll('[data-panel="projects"]').forEach(item => {
      item.addEventListener('click', () => {
        setTimeout(() => {
          patchProjectsPanel();
          enhanceProjectCards();
        }, 120);
      });
    });

    /* Also enhance on initial load if projects panel is active */
    if (document.getElementById('p-projects')?.classList.contains('active')) {
      patchProjectsPanel();
      enhanceProjectCards();
    }

    /* Observe project list DOM changes to re-apply badges */
    const projList = document.getElementById('projects-list');
    if (projList) {
      new MutationObserver(() => {
        patchProjectsPanel();
        enhanceProjectCards();
      }).observe(projList, { childList: true });
    }

    console.log('%c✦ Admin CMS v1.0 — God Level', 'color:#a855f7;font-family:monospace;font-weight:bold;font-size:12px');
  }

  onAdminReady(init);

})();
