/* ═══════════════════════════════════════════════════════════════════
   ADMIN.JS — Portfolio Admin Panel v1.0
   Vanilla JS + localStorage. Zero dependencies.
   Loaded at bottom of body — safe to access all DOM elements.
   ═══════════════════════════════════════════════════════════════════ */

(function PortfolioAdmin() {
  'use strict';

  /* ════════════════════════════════════════════════════════════════
     CLOUDINARY CONFIG — unsigned upload (no API secret needed)
     1. Create a free account at cloudinary.com
     2. Go to Settings → Upload → Upload Presets → Add Unsigned Preset
     3. Replace the two values below
  ════════════════════════════════════════════════════════════════ */
  /* ── CONFIG: reads from cl-admin-config (set via Cloudinary config panel) ── */
  const _clCfg        = (function(){ try { return JSON.parse(localStorage.getItem('cl-admin-config')||'{}'); } catch(e){ return {}; } })();
  const CLOUD_NAME    = _clCfg.cloudName    || 'YOUR_CLOUD_NAME';
  const UPLOAD_PRESET = _clCfg.uploadPreset || 'portfolio_upload';

  /* ── Upload a single File to Cloudinary, returns secure URL ── */
  async function uploadToCloudinary(file) {
    const fd = new FormData();
    fd.append('file',          file);
    fd.append('upload_preset', UPLOAD_PRESET);
    const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!data.secure_url) throw new Error(data.error?.message || 'Upload failed');
    return data.secure_url;
  }

  /* ── Common handler: validate → upload → callback(url) ── */
  async function handleImageUpload(file, errElId, callback) {
    if (!file) return;
    const errEl = document.getElementById(errElId);
    function showErr(m) { if (errEl) { errEl.textContent = m; setTimeout(() => { if (errEl) errEl.textContent = ''; }, 4000); } }

    if (!['image/jpeg', 'image/png'].includes(file.type)) { showErr('Only JPG and PNG images are allowed.'); return; }
    if (file.size > 2 * 1024 * 1024)                      { showErr('Image must be under 2 MB.');            return; }

    document.body.classList.add('adm-uploading');
    try {
      const url = await uploadToCloudinary(file);
      callback(url);
    } catch (err) {
      console.error('Cloudinary upload error:', err);
      showErr('Upload failed — check your Cloud Name and Upload Preset, then try again.');
    } finally {
      document.body.classList.remove('adm-uploading');
    }
  }

  /* ════════════════════════════════════════════════════════════════
     CONSTANTS & STATE
  ════════════════════════════════════════════════════════════════ */
  const STORE = {
    AUTH:    'adm-auth-v2',
    DATA:    'adm-portfolio-data',
    SECTION: 'adm-sections',
  };

  const DEFAULT_CREDS = { id: 'srishanth', pass: 'srishanth@portfolio' };

  let isLoggedIn    = false;
  let isAdminMode   = false;   /* true while admin overlay is open — gates all drag systems */
  let isPreview     = false;
  let activePanel   = 'hero';
  let editModalData = null; // holds temp data for open modal

  /* ── Load stored data ── */
  function loadCreds() {
    try { return JSON.parse(localStorage.getItem(STORE.AUTH)) || DEFAULT_CREDS; }
    catch { return DEFAULT_CREDS; }
  }
  function saveCreds(data) { localStorage.setItem(STORE.AUTH, JSON.stringify(data)); }

  function loadData() {
    try { return JSON.parse(localStorage.getItem(STORE.DATA)) || {}; }
    catch { return {}; }
  }
  function saveData(data) { localStorage.setItem(STORE.DATA, JSON.stringify(data)); }

  function loadSections() {
    try {
      return JSON.parse(localStorage.getItem(STORE.SECTION)) || [
        { id: 'about',    visible: true },
        { id: 'skills',   visible: true },
        { id: 'projects', visible: true },
        { id: 'journey',  visible: true },
        { id: 'certs',    visible: true },
        { id: 'contact',  visible: true },
      ];
    } catch { return []; }
  }
  function saveSections(arr) { localStorage.setItem(STORE.SECTION, JSON.stringify(arr)); }

  let D  = loadData();     // portfolio content
  let SC = loadSections(); // section visibility

  /* ════════════════════════════════════════════════════════════════
     TOAST
  ════════════════════════════════════════════════════════════════ */
  let toastTimer = null;
  function toast(msg, type = 'success') {
    const el = document.getElementById('adm-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 2400);
  }

  /* ════════════════════════════════════════════════════════════════
     INJECT HTML (login + overlay + toast)
  ════════════════════════════════════════════════════════════════ */
  function injectHTML() {
    // Inject admin CSS
    if (!document.getElementById('adm-css')) {
      const lnk = document.createElement('link');
      lnk.id   = 'adm-css';
      lnk.rel  = 'stylesheet';
      lnk.href = 'admin.css';
      document.head.appendChild(lnk);
    }

    // Toast
    if (!document.getElementById('adm-toast')) {
      const t = document.createElement('div');
      t.id = 'adm-toast';
      document.body.appendChild(t);
    }

    // Preview badge
    if (!document.getElementById('adm-preview-badge')) {
      const b = document.createElement('div');
      b.id = 'adm-preview-badge';
      b.innerHTML = '⬡ PREVIEW — Click to Edit';
      b.onclick = exitPreview;
      document.body.appendChild(b);
    }

    buildLogin();
    buildOverlay();
  }

  /* ════════════════════════════════════════════════════════════════
     LOGIN MODAL
  ════════════════════════════════════════════════════════════════ */
  function buildLogin() {
    if (document.getElementById('adm-login')) return;
    const el = document.createElement('div');
    el.id = 'adm-login';
    el.innerHTML = `
      <div class="adm-login-box">
        <div class="adm-login-logo">A<span>S</span> ADMIN</div>
        <div class="adm-login-title">// Portfolio CMS</div>
        <div class="adm-field">
          <label>Admin ID</label>
          <input type="text" id="adm-inp-id" placeholder="Enter admin ID" autocomplete="off"/>
        </div>
        <div class="adm-field">
          <label>Password</label>
          <input type="password" id="adm-inp-pass" placeholder="Enter password"/>
        </div>
        <div class="adm-err" id="adm-err">Incorrect credentials. Try again.</div>
        <button class="adm-btn-primary" id="adm-login-btn">Access Panel</button>
      </div>
    `;
    document.body.appendChild(el);

    document.getElementById('adm-login-btn').onclick = attemptLogin;
    document.getElementById('adm-inp-pass').addEventListener('keydown', e => {
      if (e.key === 'Enter') attemptLogin();
    });
  }

  function showLogin() {
    const el = document.getElementById('adm-login');
    if (!el) return;
    el.style.display = 'flex';
    requestAnimationFrame(() => el.classList.add('adm-visible'));
    setTimeout(() => document.getElementById('adm-inp-id')?.focus(), 200);
  }

  function hideLogin() {
    const el = document.getElementById('adm-login');
    if (!el) return;
    el.classList.remove('adm-visible');
    setTimeout(() => { el.style.display = 'none'; }, 350);
  }

  function attemptLogin() {
    const id   = document.getElementById('adm-inp-id')?.value.trim();
    const pass = document.getElementById('adm-inp-pass')?.value;
    const creds = loadCreds();
    const err   = document.getElementById('adm-err');

    if (id === creds.id && pass === creds.pass) {
      isLoggedIn = true;
      err.classList.remove('show');
      hideLogin();
      setTimeout(openPanel, 380);
    } else {
      err.classList.add('show');
      const passEl = document.getElementById('adm-inp-pass');
      if (passEl) { passEl.value = ''; passEl.focus(); }
    }
  }

  /* ════════════════════════════════════════════════════════════════
     ADMIN OVERLAY
  ════════════════════════════════════════════════════════════════ */
  function buildOverlay() {
    if (document.getElementById('adm-overlay')) return;

    const nav = [
      { id: 'hero',     ico: '◈', label: 'Hero'         },
      { id: 'about',    ico: '◉', label: 'About'        },
      { id: 'skills',   ico: '◎', label: 'Skills'       },
      { id: 'projects', ico: '◫', label: 'Projects'     },
      { id: 'journey',  ico: '◷', label: 'Journey'      },
      { id: 'certs',    ico: '◈', label: 'Certificates' },
      { id: 'contact',  ico: '◌', label: 'Contact'      },
      { id: 'theme',    ico: '◑', label: 'Theme'        },
      { id: 'builder',  ico: '⊞', label: 'Builder'      },
      { id: 'sections', ico: '▤',  label: 'Sections'    },
      { id: 'account',  ico: '◐', label: 'Account'      },
    ];

    const el = document.createElement('div');
    el.id = 'adm-overlay';
    el.innerHTML = `
      <div class="adm-sidebar">
        <div class="adm-sidebar-logo">A<span>S</span></div>
        <div class="adm-nav-label">Content</div>
        ${nav.slice(0,8).map(n => `
          <div class="adm-nav-item${n.id === activePanel ? ' adm-active' : ''}" data-panel="${n.id}">
            <span class="adm-ico">${n.ico}</span>
            <span>${n.label}</span>
          </div>`).join('')}
        <div class="adm-nav-label">System</div>
        ${nav.slice(8).map(n => `
          <div class="adm-nav-item" data-panel="${n.id}">
            <span class="adm-ico">${n.ico}</span>
            <span>${n.label}</span>
          </div>`).join('')}
        <div class="adm-sidebar-footer">
          <button class="adm-btn-sm adm-btn-save" id="adm-save-all">💾 <span>Save All</span></button>
          <button class="adm-btn-sm adm-btn-preview" id="adm-preview-btn">👁 <span>Preview</span></button>
          <button class="adm-btn-sm adm-btn-logout" id="adm-logout-btn">✕ <span>Exit</span></button>
        </div>
      </div>
      <div class="adm-main">
        <div class="adm-topbar">
          <div class="adm-topbar-title" id="adm-topbar-title">Hero Editor</div>
          <div class="adm-status">LIVE EDITING ACTIVE</div>
        </div>
        <div class="adm-content" id="adm-content">
          ${buildPanelHero()}
          ${buildPanelAbout()}
          ${buildPanelSkills()}
          ${buildPanelProjects()}
          ${buildPanelJourney()}
          ${buildPanelCerts()}
          ${buildPanelContact()}
          ${buildPanelTheme()}
          ${buildPanelBuilder()}
          ${buildPanelSections()}
          ${buildPanelAccount()}
        </div>
      </div>
    `;
    document.body.appendChild(el);

    // Bind sidebar nav
    el.querySelectorAll('.adm-nav-item').forEach(item => {
      item.addEventListener('click', () => switchPanel(item.dataset.panel));
    });

    // Bind save / preview / logout
    document.getElementById('adm-save-all').onclick   = saveAll;
    document.getElementById('adm-preview-btn').onclick = enterPreview;
    document.getElementById('adm-logout-btn').onclick  = closePanel;

    // Bind all live-edit inputs
    bindLiveEdits();
  }

  function openPanel() {
    const el = document.getElementById('adm-overlay');
    if (!el) return;
    isAdminMode = true;
    el.style.display = 'flex';
    requestAnimationFrame(() => el.classList.add('adm-visible'));
    switchPanel('hero');
    populateAllPanels();
  }

  function closePanel() {
    const el = document.getElementById('adm-overlay');
    if (!el) return;
    isAdminMode = false;
    el.classList.remove('adm-visible');
    setTimeout(() => { el.style.display = 'none'; isLoggedIn = false; }, 380);
    /* Disable subsection drag on live cards when admin closes */
    disableSubsectionDrag();
    // Clear login inputs
    const inp = document.getElementById('adm-inp-id');
    const pass = document.getElementById('adm-inp-pass');
    if (inp) inp.value = '';
    if (pass) pass.value = '';
  }

  function switchPanel(id) {
    activePanel = id;
    document.querySelectorAll('.adm-nav-item').forEach(n => {
      n.classList.toggle('adm-active', n.dataset.panel === id);
    });
    document.querySelectorAll('.adm-panel').forEach(p => {
      p.classList.toggle('adm-active', p.id === 'admp-' + id);
    });
    const labels = {
      hero:'Hero Editor', about:'About Editor', skills:'Skills Editor',
      projects:'Projects Editor', journey:'Journey Editor', certs:'Certificates Editor',
      contact:'Contact Editor', theme:'Theme Settings', builder:'Layout Builder',
      sections:'Section Control', account:'Account Settings'
    };
    const tb = document.getElementById('adm-topbar-title');
    if (tb) tb.textContent = labels[id] || id;
  }

  /* ════════════════════════════════════════════════════════════════
     PANEL HTML BUILDERS
  ════════════════════════════════════════════════════════════════ */

  function buildPanelHero() {
    return `<div class="adm-panel" id="admp-hero">
      <div class="adm-section-title">Hero Editor</div>

      <div class="adm-group">
        <div class="adm-group-title">Profile Image</div>

        <div id="adm-profile-drop-zone" class="adm-profile-drop-zone">
          <img id="adm-img-preview" class="adm-profile-preview" src="" alt="Profile preview"/>
          <div id="adm-profile-placeholder" class="adm-profile-placeholder">
            <span class="adm-drop-ico">👤</span>
            <span>Drop image here or click to upload</span>
            <span style="font-size:0.55rem;opacity:0.5;margin-top:2px">JPG · PNG · max 2 MB</span>
          </div>
          <input type="file" id="adm-profile-file" accept="image/jpeg,image/png" style="display:none"/>
        </div>
        <div id="adm-profile-err" style="font-size:0.65rem;color:#f87171;min-height:18px;margin-top:6px"></div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button type="button" class="adm-btn-sm adm-btn-preview" id="adm-profile-browse-btn" style="flex:1">📁 Browse file</button>
          <button type="button" class="adm-btn-sm adm-btn-logout" id="adm-profile-clear-btn" style="flex:1">✕ Remove</button>
        </div>

        <div style="margin-top:16px">
          <label class="adm-lbl">Or paste image URL</label>
          <input class="adm-input" id="adm-hero-img" type="url" placeholder="https://..."/>
        </div>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">Identity</div>
        <div class="adm-row">
          <div>
            <label class="adm-lbl">First Name</label>
            <input class="adm-input" id="adm-hero-fname" type="text"/>
          </div>
          <div>
            <label class="adm-lbl">Last Name</label>
            <input class="adm-input" id="adm-hero-lname" type="text"/>
          </div>
        </div>
        <div class="adm-row full">
          <div>
            <label class="adm-lbl">Greeting Tag</label>
            <input class="adm-input" id="adm-hero-greet" type="text" placeholder="Good Morning"/>
          </div>
        </div>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">Typed Roles (one per line)</div>
        <textarea class="adm-textarea" id="adm-hero-roles" placeholder="AI & ML Engineer&#10;Python Developer&#10;Problem Solver"></textarea>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">Hero Description</div>
        <textarea class="adm-textarea" id="adm-hero-desc"></textarea>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">Status Badge</div>
        <label class="adm-lbl">Currently Working On</label>
        <input class="adm-input" id="adm-hero-badge" type="text"/>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">Buttons</div>
        <div class="adm-row">
          <div>
            <label class="adm-lbl">Primary Button Text</label>
            <input class="adm-input" id="adm-hero-btn1" type="text" placeholder="Hire Me"/>
          </div>
          <div>
            <label class="adm-lbl">Secondary Button Text</label>
            <input class="adm-input" id="adm-hero-btn2" type="text" placeholder="Download CV"/>
          </div>
        </div>
        <div class="adm-row full">
          <div>
            <label class="adm-lbl">CV / Resume URL</label>
            <input class="adm-input" id="adm-hero-cv" type="url" placeholder="https://..."/>
          </div>
        </div>
      </div>
    </div>`;
  }

  function buildPanelAbout() {
    return `<div class="adm-panel" id="admp-about">
      <div class="adm-section-title">About Editor</div>
      <div class="adm-group">
        <label class="adm-lbl">Sub Heading</label>
        <input class="adm-input" id="adm-about-sub" type="text"/>
      </div>
      <div class="adm-group">
        <label class="adm-lbl">Paragraph 1</label>
        <textarea class="adm-textarea" id="adm-about-p1"></textarea>
      </div>
      <div class="adm-group">
        <label class="adm-lbl">Paragraph 2</label>
        <textarea class="adm-textarea" id="adm-about-p2"></textarea>
      </div>
      <div class="adm-group">
        <div class="adm-group-title">Info Cards</div>
        ${[1,2,3].map(i=>`
          <div style="margin-bottom:14px;">
            <div class="adm-row">
              <div>
                <label class="adm-lbl">Card ${i} Icon</label>
                <input class="adm-input" id="adm-about-ic${i}" type="text" placeholder="🎓"/>
              </div>
              <div>
                <label class="adm-lbl">Card ${i} Title</label>
                <input class="adm-input" id="adm-about-t${i}" type="text"/>
              </div>
            </div>
            <label class="adm-lbl">Card ${i} Value</label>
            <input class="adm-input" id="adm-about-v${i}" type="text"/>
          </div>`).join('')}
      </div>
    </div>`;
  }

  function buildPanelSkills() {
    return `<div class="adm-panel" id="admp-skills">
      <div class="adm-section-title">Skills Editor</div>
      <div class="adm-card-list" id="adm-skills-list"></div>
      <button class="adm-add-btn" id="adm-skill-add">＋ Add Skill</button>
    </div>`;
  }

  function buildPanelProjects() {
    return `<div class="adm-panel" id="admp-projects">
      <div class="adm-section-title">Projects Editor</div>
      <div class="adm-card-list" id="adm-projects-list"></div>
      <button class="adm-add-btn" id="adm-project-add">＋ Add Project</button>
    </div>`;
  }

  function buildPanelJourney() {
    return `<div class="adm-panel" id="admp-journey">
      <div class="adm-section-title">Journey Editor</div>
      <div class="adm-card-list" id="adm-journey-list"></div>
      <button class="adm-add-btn" id="adm-journey-add">＋ Add Milestone</button>
    </div>`;
  }

  function buildPanelCerts() {
    return `<div class="adm-panel" id="admp-certs">
      <div class="adm-section-title">Certificates & Achievements</div>

      <div class="adm-group">
        <div class="adm-group-title">Achievement Cards</div>
        <div class="adm-card-list" id="adm-ach-list"></div>
        <button class="adm-add-btn" id="adm-ach-add">＋ Add Achievement</button>
      </div>

      <div class="adm-group">
        <div class="adm-group-title">My Certificates</div>
        <p style="font-size:0.68rem;color:rgba(255,255,255,0.28);margin-bottom:16px;line-height:1.6">
          Upload certificate images. Drag to reorder. Edit title inline. Unlimited entries.
        </p>
        <div id="adm-certs-drop-zone" class="adm-certs-drop-zone">
          <span class="adm-drop-ico">🖼</span>
          <span style="font-size:0.65rem;letter-spacing:1px;color:rgba(255,255,255,0.3);text-transform:uppercase">Drop images here or click to upload</span>
          <span style="font-size:0.55rem;opacity:0.4;margin-top:2px">JPG · PNG · multiple files allowed</span>
          <input type="file" id="adm-certs-file-input" accept="image/jpeg,image/png" multiple style="display:none"/>
        </div>
        <div id="adm-certs-err" style="font-size:0.65rem;color:#f87171;min-height:16px;margin-top:6px"></div>
        <div id="adm-cert-grid" class="adm-cert-grid"></div>
      </div>
    </div>`;
  }

  function buildPanelContact() {
    return `<div class="adm-panel" id="admp-contact">
      <div class="adm-section-title">Contact Editor</div>
      <div class="adm-group">
        <label class="adm-lbl">Email Address</label>
        <input class="adm-input" id="adm-ct-email" type="email"/>
      </div>
      <div class="adm-group">
        <label class="adm-lbl">Location</label>
        <input class="adm-input" id="adm-ct-loc" type="text"/>
      </div>
      <div class="adm-group">
        <div class="adm-group-title">Social Links</div>
        <div class="adm-row full"><div>
          <label class="adm-lbl">GitHub URL</label>
          <input class="adm-input" id="adm-soc-gh" type="url"/>
        </div></div>
        <div class="adm-row full"><div>
          <label class="adm-lbl">LinkedIn URL</label>
          <input class="adm-input" id="adm-soc-li" type="url"/>
        </div></div>
        <div class="adm-row full"><div>
          <label class="adm-lbl">Instagram URL</label>
          <input class="adm-input" id="adm-soc-ig" type="url"/>
        </div></div>
      </div>
    </div>`;
  }

  function buildPanelTheme() {
    const themes = [
      {key:'blue',    color:'#4f6ef5'},
      {key:'pink',    color:'#e91e8c'},
      {key:'green',   color:'#00ff88'},
      {key:'yellow',  color:'#e5c62a'},
      {key:'purple',  color:'#a855f7'},
      {key:'orange',  color:'#f97316'},
      {key:'cyan',    color:'#22d3ee'},
      {key:'rose',    color:'#f43f5e'},
      {key:'emerald', color:'#10b981'},
      {key:'gold',    color:'linear-gradient(135deg,#b8860b,#d4af37)'},
      {key:'sunset',  color:'linear-gradient(135deg,#f97316,#fb7185)'},
      {key:'ocean',   color:'linear-gradient(135deg,#2563eb,#38bdf8)'},
      {key:'rainbow', color:'conic-gradient(#f87171,#fb923c,#fbbf24,#34d399,#38bdf8,#818cf8,#f87171)'},
    ];
    return `<div class="adm-panel" id="admp-theme">
      <div class="adm-section-title">Theme Settings</div>
      <div class="adm-group">
        <div class="adm-group-title">Accent Color</div>
        <div class="adm-theme-grid" id="adm-theme-grid">
          ${themes.map(t=>`
            <div class="adm-swatch" data-theme="${t.key}" style="background:${t.color}" title="${t.key}"></div>
          `).join('')}
        </div>
        <div style="margin-top:20px">
          <label class="adm-lbl">Custom Hex Color</label>
          <div style="display:flex;gap:10px;align-items:center">
            <input class="adm-input" id="adm-custom-hex" type="text" placeholder="#4f6ef5" style="flex:1"/>
            <input type="color" id="adm-color-picker" style="width:40px;height:40px;border:none;background:none;cursor:pointer;border-radius:6px;overflow:hidden"/>
          </div>
        </div>
      </div>
    </div>`;
  }

  function buildPanelSections() {
    const labels = { about:'About', skills:'Skills', projects:'Projects', journey:'Journey', certs:'Certificates', contact:'Contact' };
    return `<div class="adm-panel" id="admp-sections">
      <div class="adm-section-title">Section Control</div>

      <div class="adm-group">
        <div class="adm-group-title">Drag to Reorder Sections</div>
        <p style="font-size:0.68rem;color:rgba(255,255,255,0.28);margin-bottom:14px;line-height:1.6">
          Drag the ⠿ handle to reorder. Changes reflect instantly and save automatically.
        </p>
        <div id="adm-section-order-list" class="adm-card-list">
          ${Object.entries(labels).map(([id,lbl])=>`
            <div class="adm-card-item adm-section-drag-item" draggable="true" data-sec-id="${id}" style="align-items:center">
              <div class="adm-drag-handle" title="Drag to reorder">⠿</div>
              <div class="adm-card-body"><div class="adm-card-name">${lbl}</div></div>
              <label class="adm-toggle" style="flex-shrink:0" title="Show/hide">
                <input type="checkbox" class="adm-sec-toggle" data-sec="${id}" checked/>
                <div class="adm-toggle-track"></div>
              </label>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  }

  function buildPanelBuilder() {
    return `<div class="adm-panel" id="admp-builder">
      <div class="adm-section-title">Layout Builder</div>

      <!-- ── UNDO / REDO ── -->
      <div class="adm-group">
        <div class="adm-group-title">History</div>
        <div class="bldr-row" style="gap:8px">
          <button class="adm-btn-sm" id="bldr-undo-btn" title="Undo (Ctrl+Z)" disabled>↩ Undo</button>
          <button class="adm-btn-sm" id="bldr-redo-btn" title="Redo (Ctrl+Y)" disabled>↪ Redo</button>
          <span id="bldr-history-info" class="bldr-info">No history yet</span>
        </div>
      </div>

      <!-- ── MULTI-COLUMN BUILDER ── -->
      <div class="adm-group">
        <div class="adm-group-title">Column Layout</div>
        <p style="font-size:0.68rem;color:rgba(255,255,255,0.28);margin-bottom:14px;line-height:1.6">
          Choose a column layout for each section. Drag items between columns on the live page when admin is open.
        </p>
        <div id="bldr-section-list" class="bldr-section-list"></div>
      </div>

      <!-- ── LAYOUT TEMPLATES ── -->
      <div class="adm-group">
        <div class="adm-group-title">Layout Templates</div>
        <div class="bldr-row" style="gap:8px;margin-bottom:12px">
          <input class="adm-input" id="bldr-tpl-name" type="text" placeholder="Template name…" style="flex:1"/>
          <button class="adm-btn-sm adm-btn-save" id="bldr-save-tpl-btn">💾 Save</button>
        </div>
        <div class="bldr-row" style="gap:8px">
          <select class="adm-input" id="bldr-tpl-select" style="flex:1">
            <option value="">— Select template —</option>
          </select>
          <button class="adm-btn-sm" id="bldr-load-tpl-btn">↗ Load</button>
          <button class="adm-btn-sm adm-btn-logout" id="bldr-del-tpl-btn">✕</button>
        </div>
        <div id="bldr-tpl-list" style="margin-top:12px"></div>
      </div>
    </div>`;
  }

  function buildPanelAccount() {
    return `<div class="adm-panel" id="admp-account">
      <div class="adm-section-title">Account Settings</div>
      <div class="adm-cred-box">
        <div class="adm-cred-warning">⚠ Changing credentials will require the new values on next login. Store them safely.</div>
        <label class="adm-lbl">New Admin ID</label>
        <input class="adm-input" id="adm-new-id" type="text" placeholder="Enter new admin ID" style="margin-bottom:12px"/>
        <label class="adm-lbl">New Password</label>
        <input class="adm-input" id="adm-new-pass" type="password" placeholder="Enter new password" style="margin-bottom:12px"/>
        <label class="adm-lbl">Confirm Password</label>
        <input class="adm-input" id="adm-new-pass2" type="password" placeholder="Confirm new password" style="margin-bottom:16px"/>
        <button class="adm-btn-primary" id="adm-save-creds">Update Credentials</button>
      </div>
    </div>`;
  }

  /* ════════════════════════════════════════════════════════════════
     POPULATE PANELS with stored data
  ════════════════════════════════════════════════════════════════ */
  function populateAllPanels() {
    populateHero();
    populateAbout();
    populateSkillsList();
    populateProjectsList();
    populateJourneyList();
    populateAchList();
    populateCertList();
    populateContact();
    populateTheme();
    populateSections();
    bindDynamicButtons();
    bindAccountSave();
    bindTheme();
    bindBuilderPanel();
    /* Drag systems — init after all panels are built */
    requestAnimationFrame(() => {
      initSectionDrag();
      initSubsectionDrag();
    });
  }

  function val(id, fallback='') {
    const el = document.getElementById(id);
    if (!el) return fallback;
    return el.value;
  }
  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v || '';
  }

  function populateHero() {
    /* Profile image — prefer dedicated key, fall back to URL in D.heroImg */
    const savedProfile = loadProfileImage();
    if (savedProfile) {
      updateImgPreview(savedProfile);
      showProfilePreview(savedProfile);
    } else {
      updateImgPreview(D.heroImg || '');
      if (D.heroImg) showProfilePreview(D.heroImg);
    }
    setVal('adm-hero-img',   D.heroImg   || '');
    setVal('adm-hero-fname', D.firstName || 'Arrabola');
    setVal('adm-hero-lname', D.lastName  || 'Srishanth');
    setVal('adm-hero-greet', D.greetText || '');
    setVal('adm-hero-roles', (D.roles || ['AI & ML Engineer','Python Developer','Problem Solver']).join('\n'));
    setVal('adm-hero-desc',  D.heroDesc  || '');
    setVal('adm-hero-badge', D.badgeText || '');
    setVal('adm-hero-btn1',  D.btn1Text  || 'Hire Me');
    setVal('adm-hero-btn2',  D.btn2Text  || 'Download CV');
    setVal('adm-hero-cv',    D.cvUrl     || '');
    initProfileDrop();
  }
  }

  function populateAbout() {
    setVal('adm-about-sub', D.aboutSub || '');
    setVal('adm-about-p1',  D.aboutP1  || '');
    setVal('adm-about-p2',  D.aboutP2  || '');
    const cards = D.aboutCards || [
      { ico:'🎓', title:'Education',   val:'B.Tech CSE (AI & ML) – VITS (2025–2029)' },
      { ico:'</>',title:'Focus Areas', val:'Python, Data Structures & Algorithms' },
      { ico:'🤖', title:'Interests',   val:'Artificial Intelligence & Machine Learning' },
    ];
    cards.forEach((c,i) => {
      setVal(`adm-about-ic${i+1}`, c.ico);
      setVal(`adm-about-t${i+1}`,  c.title);
      setVal(`adm-about-v${i+1}`,  c.val);
    });
  }

  function populateSkillsList() {
    const list = document.getElementById('adm-skills-list');
    if (!list) return;
    const skills = D.skills || [
      { ico:'⚙️', name:'C Programming', level:90, locked:false },
      { ico:'🐍', name:'Python',         level:50, locked:false },
      { ico:'🗄️', name:'Data Structures',level:25, locked:false },
      { ico:'🤖', name:'Machine Learning',level:10, locked:false },
      { ico:'⚛️', name:'React',           level:0,  locked:true  },
      { ico:'🔶', name:'Git',             level:0,  locked:true  },
    ];
    list.innerHTML = skills.map((s,i) => `
      <div class="adm-card-item" data-idx="${i}">
        <div class="adm-card-body">
          <div class="adm-card-name">${s.ico} ${s.name}</div>
          <div class="adm-card-meta">${s.locked ? '🔒 Locked' : s.level + '%'}</div>
        </div>
        <div class="adm-card-actions">
          <button class="adm-icon-btn" data-action="edit-skill" data-idx="${i}" title="Edit">✎</button>
          <button class="adm-icon-btn del" data-action="del-skill" data-idx="${i}" title="Delete">✕</button>
        </div>
      </div>`).join('');
  }

  function populateProjectsList() {
    const list = document.getElementById('adm-projects-list');
    if (!list) return;
    const projects = D.projects || [
      { ico:'📁', title:'Python Calculator',         desc:'A feature-rich calculator.', tags:['Python','CLI'],  github:'#', live:'#' },
      { ico:'📁', title:'Student Management System', desc:'A CRUD application.',        tags:['Python','File I/O'], github:'#', live:'#' },
      { ico:'📁', title:'Portfolio Website',         desc:'This futuristic portfolio.', tags:['HTML','CSS','JS'],  github:'#', live:'#' },
      { ico:'📁', title:'DSA Practice Tracker',      desc:'Track DSA progress.',        tags:['Python','DSA'],     github:'#', live:'#' },
    ];
    list.innerHTML = projects.map((p,i) => `
      <div class="adm-card-item" data-idx="${i}">
        <div class="adm-card-body">
          <div class="adm-card-name">${p.ico || '📁'} ${p.title}</div>
          <div class="adm-card-meta">${(p.tags||[]).join(', ')}</div>
        </div>
        <div class="adm-card-actions">
          <button class="adm-icon-btn" data-action="edit-proj" data-idx="${i}" title="Edit">✎</button>
          <button class="adm-icon-btn del" data-action="del-proj" data-idx="${i}" title="Delete">✕</button>
        </div>
      </div>`).join('');
  }

  function populateJourneyList() {
    const list = document.getElementById('adm-journey-list');
    if (!list) return;
    const items = D.journey || [
      { date:'2025', badge:'🎓', title:'Started B.Tech CSE (AI & ML)', desc:'Joined VITS.' },
      { date:'2025', badge:'✅', title:'Started C Programming',         desc:'Learned C.' },
      { date:'2025', badge:'✅', title:'Completed C Programming',       desc:'Mastered C.' },
      { date:'27 Feb 2026', badge:'🏆', title:'Hackathon Debut — VHack', desc:'First hackathon.' },
      { date:'2025', badge:'🧠', title:'Exploring AI & ML',            desc:'Studying AI.' },
      { date:'2025', badge:'💜', title:'Built This Portfolio',          desc:'This site.' },
      { date:'Future', badge:'🚀', title:"What's Next?",               desc:'Full-stack mastery.' },
    ];
    list.innerHTML = items.map((j,i) => `
      <div class="adm-card-item" data-idx="${i}">
        <div class="adm-card-body">
          <div class="adm-card-name">${j.badge} ${j.title}</div>
          <div class="adm-card-meta">${j.date}</div>
        </div>
        <div class="adm-card-actions">
          <button class="adm-icon-btn" data-action="edit-journey" data-idx="${i}" title="Edit">✎</button>
          <button class="adm-icon-btn del" data-action="del-journey" data-idx="${i}" title="Delete">✕</button>
        </div>
      </div>`).join('');
  }

  function populateAchList() {
    const list = document.getElementById('adm-ach-list');
    if (!list) return;
    const items = D.achievements || [
      { ico:'🎓', title:'B.Tech in Computer Science', desc:'Currently pursuing my degree.' },
      { ico:'🏆', title:'Hackathon Finalist',          desc:'National-level hackathon.' },
      { ico:'</>',title:'500+ GitHub Contributions',  desc:'Consistent open-source commits.' },
      { ico:'🥇', title:'Web Dev Certification',      desc:'Advanced full-stack cert.' },
    ];
    list.innerHTML = items.map((a,i) => `
      <div class="adm-card-item" data-idx="${i}">
        <div class="adm-card-body">
          <div class="adm-card-name">${a.ico} ${a.title}</div>
          <div class="adm-card-meta">${a.desc.slice(0,60)}...</div>
        </div>
        <div class="adm-card-actions">
          <button class="adm-icon-btn" data-action="edit-ach" data-idx="${i}" title="Edit">✎</button>
          <button class="adm-icon-btn del" data-action="del-ach" data-idx="${i}" title="Delete">✕</button>
        </div>
      </div>`).join('');
  }

  function populateContact() {
    setVal('adm-ct-email', D.email    || '');
    setVal('adm-ct-loc',   D.location || 'Hyderabad, India');
    setVal('adm-soc-gh',   D.github   || '');
    setVal('adm-soc-li',   D.linkedin || '');
    setVal('adm-soc-ig',   D.instagram|| '');
  }

  function populateTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'blue';
    document.querySelectorAll('.adm-swatch').forEach(s => {
      s.classList.toggle('adm-swatch-active', s.dataset.theme === cur);
    });
  }

  function populateSections() {
    /* Sync toggle checkboxes */
    document.querySelectorAll('.adm-sec-toggle').forEach(chk => {
      const sec = SC.find(s => s.id === chk.dataset.sec);
      if (sec) chk.checked = sec.visible !== false;
    });
    /* Reorder the drag list to match SC order */
    const list = document.getElementById('adm-section-order-list');
    if (!list) return;
    SC.forEach(sec => {
      const item = list.querySelector(`[data-sec-id="${sec.id}"]`);
      if (item) list.appendChild(item); // moves to end in SC order
    });
  }

  /* ════════════════════════════════════════════════════════════════
     LIVE EDIT BINDINGS — type in admin → portfolio updates instantly
  ════════════════════════════════════════════════════════════════ */
  function bindLiveEdits() {
    /* Helper: bind input/textarea with a handler */
    function on(id, fn) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', fn);
    }

    /* ── Hero ── */
    on('adm-hero-img', e => {
      const url = e.target.value;
      updateImgPreview(url);
      showProfilePreview(url);
      const img = document.getElementById('himg');
      if (img) img.src = url;
      D.heroImg = url;
      /* URL input clears the uploaded image — URL takes precedence */
      if (url) saveProfileImage('');
    });

    on('adm-hero-fname', e => {
      D.firstName = e.target.value;
      const el = document.querySelector('.h-name .acc');
      if (el) el.textContent = e.target.value;
    });

    on('adm-hero-lname', e => {
      D.lastName = e.target.value;
      const el = document.querySelector('.h-name .c-white');
      if (el) el.textContent = e.target.value;
    });

    on('adm-hero-greet', e => {
      D.greetText = e.target.value;
      const el = document.getElementById('greet-txt');
      if (el) el.textContent = e.target.value;
    });

    on('adm-hero-desc', e => {
      D.heroDesc = e.target.value;
      const el = document.querySelector('.h-desc');
      if (el) el.textContent = e.target.value;
    });

    on('adm-hero-badge', e => {
      D.badgeText = e.target.value;
      const el = document.querySelector('.h-badge strong');
      if (el) el.textContent = e.target.value;
    });

    on('adm-hero-btn1', e => {
      D.btn1Text = e.target.value;
      const el = document.querySelector('.h-btns .btn-p');
      if (el) el.textContent = e.target.value;
    });

    on('adm-hero-btn2', e => {
      D.btn2Text = e.target.value;
      const el = document.querySelector('.h-btns .btn-o');
      if (el) el.textContent = e.target.value;
    });

    on('adm-hero-cv', e => {
      D.cvUrl = e.target.value;
      const el = document.querySelector('.h-btns .btn-o');
      if (el && e.target.value) el.href = e.target.value;
    });

    on('adm-hero-roles', e => {
      D.roles = e.target.value.split('\n').filter(r => r.trim());
    });

    /* ── About ── */
    on('adm-about-sub', e => {
      D.aboutSub = e.target.value;
      const el = document.querySelector('.about-sub-h');
      if (el) el.textContent = e.target.value;
    });

    on('adm-about-p1', e => {
      D.aboutP1 = e.target.value;
      const ps = document.querySelectorAll('.about-left p');
      if (ps[0]) ps[0].textContent = e.target.value;
    });

    on('adm-about-p2', e => {
      D.aboutP2 = e.target.value;
      const ps = document.querySelectorAll('.about-left p');
      if (ps[1]) ps[1].textContent = e.target.value;
    });

    [1,2,3].forEach(i => {
      on(`adm-about-ic${i}`, e => {
        if (!D.aboutCards) D.aboutCards = getDefaultAboutCards();
        D.aboutCards[i-1].ico = e.target.value;
        const icons = document.querySelectorAll('.about-card-icon');
        if (icons[i-1]) icons[i-1].textContent = e.target.value;
      });
      on(`adm-about-t${i}`, e => {
        if (!D.aboutCards) D.aboutCards = getDefaultAboutCards();
        D.aboutCards[i-1].title = e.target.value;
        const strongs = document.querySelectorAll('.about-card-text strong');
        if (strongs[i-1]) strongs[i-1].textContent = e.target.value;
      });
      on(`adm-about-v${i}`, e => {
        if (!D.aboutCards) D.aboutCards = getDefaultAboutCards();
        D.aboutCards[i-1].val = e.target.value;
        const spans = document.querySelectorAll('.about-card-text span');
        if (spans[i-1]) spans[i-1].textContent = e.target.value;
      });
    });

    /* ── Contact ── */
    on('adm-ct-email', e => {
      D.email = e.target.value;
      const email = e.target.value;
      /* FIX: Update #contact-email element used by index.html */
      const ceEl = document.getElementById('contact-email');
      if (ceEl) ceEl.innerHTML = email ? '<a href="mailto:' + email + '" class="email-link">' + email + '</a>' : '';
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
        a.href = 'mailto:' + email;
        if (a.textContent.includes('@')) a.textContent = email;
      });
      document.querySelectorAll('.ct-val').forEach(el => {
        if (el.textContent.trim().includes('@')) el.textContent = email;
      });
      localStorage.setItem('adminEmail', email);
    });

    on('adm-ct-loc', e => {
      D.location = e.target.value;
      document.querySelectorAll('.ct-val').forEach(el => {
        if (el.textContent.toLowerCase().includes('india') ||
            el.textContent.toLowerCase().includes('hyderabad')) {
          el.textContent = e.target.value;
        }
      });
    });

    on('adm-soc-gh', e => {
      D.github = e.target.value;
      document.querySelectorAll('a[href*="github.com"]').forEach(a => a.href = e.target.value || '#');
    });
    on('adm-soc-li', e => {
      D.linkedin = e.target.value;
      document.querySelectorAll('a[href*="linkedin.com"]').forEach(a => a.href = e.target.value || '#');
    });
    on('adm-soc-ig', e => {
      D.instagram = e.target.value;
      document.querySelectorAll('a[href*="instagram.com"]').forEach(a => a.href = e.target.value || '#');
    });

    /* ── Section toggles ── */
    document.addEventListener('change', e => {
      if (!e.target.classList.contains('adm-sec-toggle')) return;
      const secId = e.target.dataset.sec;
      const sec   = SC.find(s => s.id === secId);
      if (sec) sec.visible = e.target.checked;
      const sectionEl = document.getElementById(secId);
      if (sectionEl) sectionEl.style.display = e.target.checked ? '' : 'none';
      const navLink = document.querySelector(`.nav-links a[href="#${secId}"]`);
      if (navLink) navLink.parentElement.style.display = e.target.checked ? '' : 'none';
      saveSections(SC);
    });
  }

  /* ════════════════════════════════════════════════════════════════
     DYNAMIC BUTTONS — add / edit / delete items
  ════════════════════════════════════════════════════════════════ */
  function bindDynamicButtons() {
    // Use event delegation on the overlay
    const overlay = document.getElementById('adm-overlay');
    if (!overlay || overlay.__dynBound) return;
    overlay.__dynBound = true;

    overlay.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const idx    = parseInt(btn.dataset.idx ?? '-1');

      switch(action) {
        case 'edit-skill':   openSkillModal(idx);   break;
        case 'del-skill': {
          const item = (D.skills || [])[idx];
          confirmDelete('skill', item?.name || 'this skill', () =>
            deleteItem('skills', idx, populateSkillsList, renderSkills));
          break;
        }
        case 'edit-proj':    openProjModal(idx);    break;
        case 'del-proj': {
          const item = (D.projects || [])[idx];
          confirmDelete('project', item?.title || 'this project', () =>
            deleteItem('projects', idx, populateProjectsList, renderProjects));
          break;
        }
        case 'edit-journey': openJourneyModal(idx); break;
        case 'del-journey': {
          const item = (D.journey || [])[idx];
          confirmDelete('milestone', item?.title || 'this milestone', () =>
            deleteItem('journey', idx, populateJourneyList, renderJourney));
          break;
        }
        case 'edit-ach':     openAchModal(idx);     break;
        case 'del-ach': {
          const item = (D.achievements || [])[idx];
          confirmDelete('achievement', item?.title || 'this achievement', () =>
            deleteItem('achievements', idx, populateAchList, renderAchievements));
          break;
        }
        case 'del-cert': {
          const cert = getCerts()[idx];
          confirmDelete('certificate', cert?.title || 'this certificate', () =>
            deleteCert(idx));
          break;
        }
      }
    });

    document.getElementById('adm-skill-add')?.addEventListener('click',   () => openSkillModal(-1));
    document.getElementById('adm-project-add')?.addEventListener('click',  () => openProjModal(-1));
    document.getElementById('adm-journey-add')?.addEventListener('click',  () => openJourneyModal(-1));
    document.getElementById('adm-ach-add')?.addEventListener('click',      () => openAchModal(-1));
    document.getElementById('adm-cert-add')?.addEventListener('click',     () => openCertModal(-1));
    initCertUploadZone();
  }

  function deleteItem(key, idx, repopulateFn, renderFn) {
    if (!D[key]) return;
    D[key].splice(idx, 1);
    repopulateFn();
    renderFn();
    toast(key.slice(0,1).toUpperCase() + key.slice(1,-1) + ' deleted');
  }

  /* ════════════════════════════════════════════════════════════════
     CONFIRM DELETE — smooth animated popup, no browser dialogs
     Usage: confirmDelete(type, itemName, onConfirm)
       type     — 'certificate' | 'skill' | 'project' | etc.
       itemName — shown in the dialog as the item being deleted
       onConfirm — called only if admin clicks the Delete button
  ════════════════════════════════════════════════════════════════ */
  function confirmDelete(type, itemName, onConfirm) {
    let ov = document.getElementById('adm-confirm-ov');

    /* Build the overlay once, reuse on every call */
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'adm-confirm-ov';
      ov.className = 'adm-confirm-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-labelledby', 'adm-confirm-title');
      ov.innerHTML =
        '<div class="adm-confirm-box" id="adm-confirm-box">' +
          '<div class="adm-confirm-icon">🗑</div>' +
          '<div class="adm-confirm-title" id="adm-confirm-title">Delete?</div>' +
          '<div class="adm-confirm-item-name" id="adm-confirm-item"></div>' +
          '<p class="adm-confirm-msg" id="adm-confirm-msg"></p>' +
          '<div class="adm-confirm-footer">' +
            '<button class="adm-confirm-cancel-btn" id="adm-confirm-cancel">Cancel</button>' +
            '<button class="adm-confirm-delete-btn" id="adm-confirm-ok">Delete</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(ov);

      /* Close on backdrop click */
      ov.addEventListener('click', e => {
        if (e.target === ov) closeConfirm();
      });

      /* Close on Escape */
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && ov.classList.contains('adm-confirm-open')) {
          closeConfirm();
        }
        /* Enter / Space on focused delete button — handled natively */
      });

      document.getElementById('adm-confirm-cancel').addEventListener('click', closeConfirm);
    }

    /* Populate content */
    const titleEl  = document.getElementById('adm-confirm-title');
    const itemEl   = document.getElementById('adm-confirm-item');
    const msgEl    = document.getElementById('adm-confirm-msg');
    const deleteBtn = document.getElementById('adm-confirm-ok');

    if (titleEl)   titleEl.textContent = 'Delete ' + type + '?';
    if (itemEl)    itemEl.textContent  = itemName || '';
    if (msgEl)     msgEl.textContent   = 'This action cannot be undone.';

    /* Wire the confirm action — replace previous listener by cloning */
    const freshBtn = deleteBtn.cloneNode(true);
    deleteBtn.parentNode.replaceChild(freshBtn, deleteBtn);
    freshBtn.addEventListener('click', () => {
      closeConfirm();
      /* Small delay so the close animation plays before the re-render */
      setTimeout(onConfirm, 200);
    });

    /* Animate open — double rAF ensures CSS initial state is painted first */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ov.classList.add('adm-confirm-open');
        /* Focus the cancel button for keyboard accessibility */
        document.getElementById('adm-confirm-cancel')?.focus();
      });
    });
  }

  function closeConfirm() {
    const ov = document.getElementById('adm-confirm-ov');
    if (!ov || !ov.classList.contains('adm-confirm-open')) return;

    /* Animate out */
    ov.classList.add('adm-confirm-closing');

    setTimeout(() => {
      ov.classList.remove('adm-confirm-open', 'adm-confirm-closing');
    }, 300); /* matches transition duration */
  }


  /* ════════════════════════════════════════════════════════════════
     MODALS — skill / project / journey / achievement
  ════════════════════════════════════════════════════════════════ */
  function openModal(title, bodyHTML, onSave) {
    let ov = document.getElementById('adm-modal-ov');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'adm-modal-ov';
      ov.className = 'adm-modal-overlay';
      ov.innerHTML = `<div class="adm-modal">
        <div class="adm-modal-title" id="adm-modal-title"></div>
        <div id="adm-modal-body"></div>
        <div class="adm-modal-footer">
          <button class="adm-btn-cancel" id="adm-modal-cancel">Cancel</button>
          <button class="adm-btn-primary" id="adm-modal-save" style="width:auto;padding:9px 24px">Save</button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      document.getElementById('adm-modal-cancel').onclick = closeModal;
      ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
    }
    document.getElementById('adm-modal-title').textContent = title;
    document.getElementById('adm-modal-body').innerHTML    = bodyHTML;
    document.getElementById('adm-modal-save').onclick      = () => { onSave(); closeModal(); };
    requestAnimationFrame(() => ov.classList.add('adm-visible'));
  }

  function closeModal() {
    const ov = document.getElementById('adm-modal-ov');
    if (!ov) return;
    ov.classList.remove('adm-visible');
  }

  /* ── Skill modal ── */
  function openSkillModal(idx) {
    const skills = D.skills || getDefaultSkills();
    const s = idx >= 0 ? skills[idx] : { ico:'', name:'', level:50, locked:false };
    openModal(idx >= 0 ? 'Edit Skill' : 'Add Skill', `
      <div class="adm-row">
        <div><label class="adm-lbl">Icon (emoji)</label><input class="adm-input" id="m-ico" value="${s.ico||''}"/></div>
        <div><label class="adm-lbl">Skill Name</label><input class="adm-input" id="m-name" value="${esc(s.name||'')}"/></div>
      </div>
      <label class="adm-lbl">Proficiency %</label>
      <input class="adm-input" id="m-level" type="number" min="0" max="100" value="${s.level||0}" style="margin-bottom:12px"/>
      <div class="adm-toggle-row">
        <span class="adm-toggle-label">Locked (Coming Soon)</span>
        <label class="adm-toggle">
          <input type="checkbox" id="m-locked" ${s.locked?'checked':''}/>
          <div class="adm-toggle-track"></div>
        </label>
      </div>
    `, () => {
      if (!D.skills) D.skills = getDefaultSkills();
      const item = {
        ico:    document.getElementById('m-ico').value,
        name:   document.getElementById('m-name').value,
        level:  parseInt(document.getElementById('m-level').value)||0,
        locked: document.getElementById('m-locked').checked,
      };
      if (idx >= 0) D.skills[idx] = item; else D.skills.push(item);
      populateSkillsList();
      renderSkills();
      toast(idx >= 0 ? 'Skill updated' : 'Skill added');
    });
  }

  /* ── Project modal ── */
  function openProjModal(idx) {
    const projects = D.projects || getDefaultProjects();
    const p = idx >= 0 ? projects[idx] : { ico:'📁', title:'', desc:'', tags:'', github:'#', live:'#' };
    openModal(idx >= 0 ? 'Edit Project' : 'Add Project', `
      <div class="adm-row">
        <div><label class="adm-lbl">Icon</label><input class="adm-input" id="m-ico" value="${p.ico||'📁'}"/></div>
        <div><label class="adm-lbl">Title</label><input class="adm-input" id="m-title" value="${esc(p.title||'')}"/></div>
      </div>
      <label class="adm-lbl">Description</label>
      <textarea class="adm-textarea" id="m-desc">${esc(p.desc||'')}</textarea>
      <label class="adm-lbl">Tags (comma separated)</label>
      <input class="adm-input" id="m-tags" value="${esc((p.tags||[]).join(', '))}" style="margin-bottom:12px"/>
      <div class="adm-row">
        <div><label class="adm-lbl">GitHub URL</label><input class="adm-input" id="m-gh" value="${esc(p.github||'#')}"/></div>
        <div><label class="adm-lbl">Live URL</label><input class="adm-input" id="m-live" value="${esc(p.live||'#')}"/></div>
      </div>
    `, () => {
      if (!D.projects) D.projects = getDefaultProjects();
      const item = {
        ico:    document.getElementById('m-ico').value,
        title:  document.getElementById('m-title').value,
        desc:   document.getElementById('m-desc').value,
        tags:   document.getElementById('m-tags').value.split(',').map(t=>t.trim()).filter(Boolean),
        github: document.getElementById('m-gh').value,
        live:   document.getElementById('m-live').value,
      };
      if (idx >= 0) D.projects[idx] = item; else D.projects.push(item);
      populateProjectsList();
      renderProjects();
      toast(idx >= 0 ? 'Project updated' : 'Project added');
    });
  }

  /* ── Journey modal ── */
  function openJourneyModal(idx) {
    const items = D.journey || getDefaultJourney();
    const j = idx >= 0 ? items[idx] : { date:'', badge:'📌', title:'', desc:'' };
    openModal(idx >= 0 ? 'Edit Milestone' : 'Add Milestone', `
      <div class="adm-row">
        <div><label class="adm-lbl">Date / Year</label><input class="adm-input" id="m-date" value="${esc(j.date||'')}"/></div>
        <div><label class="adm-lbl">Badge Emoji</label><input class="adm-input" id="m-badge" value="${j.badge||'📌'}"/></div>
      </div>
      <label class="adm-lbl">Title</label>
      <input class="adm-input" id="m-title" value="${esc(j.title||'')}" style="margin-bottom:12px"/>
      <label class="adm-lbl">Description</label>
      <textarea class="adm-textarea" id="m-desc">${esc(j.desc||'')}</textarea>
    `, () => {
      if (!D.journey) D.journey = getDefaultJourney();
      const item = {
        date:  document.getElementById('m-date').value,
        badge: document.getElementById('m-badge').value,
        title: document.getElementById('m-title').value,
        desc:  document.getElementById('m-desc').value,
      };
      if (idx >= 0) D.journey[idx] = item; else D.journey.push(item);
      populateJourneyList();
      renderJourney();
      toast(idx >= 0 ? 'Milestone updated' : 'Milestone added');
    });
  }

  /* ── Achievement modal ── */
  function openAchModal(idx) {
    const items = D.achievements || getDefaultAchievements();
    const a = idx >= 0 ? items[idx] : { ico:'🏅', title:'', desc:'' };
    openModal(idx >= 0 ? 'Edit Achievement' : 'Add Achievement', `
      <div class="adm-row">
        <div><label class="adm-lbl">Icon</label><input class="adm-input" id="m-ico" value="${a.ico||'🏅'}"/></div>
        <div><label class="adm-lbl">Title</label><input class="adm-input" id="m-title" value="${esc(a.title||'')}"/></div>
      </div>
      <label class="adm-lbl">Description</label>
      <textarea class="adm-textarea" id="m-desc">${esc(a.desc||'')}</textarea>
    `, () => {
      if (!D.achievements) D.achievements = getDefaultAchievements();
      const item = {
        ico:   document.getElementById('m-ico').value,
        title: document.getElementById('m-title').value,
        desc:  document.getElementById('m-desc').value,
      };
      if (idx >= 0) D.achievements[idx] = item; else D.achievements.push(item);
      populateAchList();
      renderAchievements();
      toast(idx >= 0 ? 'Achievement updated' : 'Achievement added');
    });
  }

  /* ════════════════════════════════════════════════════════════════
     DOM RENDERERS — push stored data → live portfolio
  ════════════════════════════════════════════════════════════════ */
  function renderAll() {
    renderHero();
    renderAbout();
    renderSkills();
    renderProjects();
    renderJourney();
    renderAchievements();
    renderCertRings();
    renderContact();
    renderSections();
  }

  function renderHero() {
    /* Profile image: dedicated upload key takes priority over URL */
    const profileImg = loadProfileImage();
    const src = profileImg || D.heroImg || '';
    if (src) {
      const img = document.getElementById('himg');
      if (img) img.src = src;
    }
    if (D.firstName) {
      const el = document.querySelector('.h-name .acc');
      if (el) el.textContent = D.firstName;
    }
    if (D.lastName) {
      const el = document.querySelector('.h-name .c-white');
      if (el) el.textContent = D.lastName;
    }
    if (D.greetText) {
      const el = document.getElementById('greet-txt');
      if (el) el.textContent = D.greetText;
    }
    if (D.heroDesc) {
      const el = document.querySelector('.h-desc');
      if (el) el.textContent = D.heroDesc;
    }
    if (D.badgeText) {
      const el = document.querySelector('.h-badge strong');
      if (el) el.textContent = D.badgeText;
    }
    if (D.btn1Text) {
      const el = document.querySelector('.h-btns .btn-p');
      if (el) el.textContent = D.btn1Text;
    }
    if (D.btn2Text) {
      const el = document.querySelector('.h-btns .btn-o');
      if (el) el.textContent = D.btn2Text;
    }
    if (D.cvUrl) {
      const el = document.querySelector('.h-btns .btn-o');
      if (el) el.href = D.cvUrl;
    }
    // Roles injected by enhancements.js on load - skip typed text DOM update
  }

  function renderAbout() {
    if (D.aboutSub) {
      const el = document.querySelector('.about-sub-h');
      if (el) el.textContent = D.aboutSub;
    }
    if (D.aboutP1) {
      const ps = document.querySelectorAll('.about-left p');
      if (ps[0]) ps[0].textContent = D.aboutP1;
    }
    if (D.aboutP2) {
      const ps = document.querySelectorAll('.about-left p');
      if (ps[1]) ps[1].textContent = D.aboutP2;
    }
    if (D.aboutCards) {
      const icons   = document.querySelectorAll('.about-card-icon');
      const titles  = document.querySelectorAll('.about-card-text strong');
      const vals    = document.querySelectorAll('.about-card-text span');
      D.aboutCards.forEach((c,i) => {
        if (icons[i])  icons[i].textContent  = c.ico;
        if (titles[i]) titles[i].textContent = c.title;
        if (vals[i])   vals[i].textContent   = c.val;
      });
    }
  }

  function renderSkills() {
    const skills = D.skills;
    if (!skills) return;
    const grid = document.querySelector('.sk-grid');
    if (!grid) return;
    grid.innerHTML = skills.map((s,i) => `
      <div class="sk-card reveal in" style="transition-delay:${i*0.05}s">
        <div class="sk-top">
          <div class="sk-left"><span class="sk-ic">${s.ico||'⚙️'}</span><span class="sk-nm">${esc(s.name)}</span></div>
          ${s.locked ? '<span class="sk-lock">🔒 Learning Soon</span>' : `<span class="sk-pc">${s.level}%</span>`}
        </div>
        <div class="bar-bg"><div class="bar-fill" data-p="${s.locked?0:s.level}" style="width:${s.locked?0:s.level}%"></div></div>
      </div>`).join('');
  }

  function renderProjects() {
    const projects = D.projects;
    if (!projects) return;
    const grid = document.querySelector('.projects-grid');
    if (!grid) return;
    grid.innerHTML = projects.map((p,i) => `
      <div class="pj reveal in" style="transition-delay:${i*0.06}s">
        <div class="pj-top">
          <span class="pj-ic">${p.ico||'📁'}</span>
        </div>
        <div class="pj-title">${esc(p.title)}</div>
        <div class="pj-desc">${esc(p.desc)}</div>
        <div class="pj-tags">${(p.tags||[]).map(t=>`<span class="ptag">${esc(t)}</span>`).join('')}</div>
        <div class="pj-actions">
          <a href="${esc(p.github||'#')}" target="_blank" class="pj-btn-gh">⎇ GitHub</a>
          <a href="${esc(p.live||'#')}" target="_blank" class="pj-btn-live">↗ Live</a>
        </div>
      </div>`).join('');
  }

  function renderJourney() {
    const items = D.journey;
    if (!items) return;
    const vtl = document.querySelector('.vtl');
    if (!vtl) return;
    // Preserve the vtl-line and scroll dot
    const line = vtl.querySelector('.vtl-line');
    const ghost = vtl.querySelector('.vtl-line-ghost');
    const dot   = vtl.querySelector('.vtl-scroll-dot');
    vtl.innerHTML = '';
    if (ghost) vtl.appendChild(ghost);
    if (line)  vtl.appendChild(line);
    items.forEach((j,i) => {
      const div = document.createElement('div');
      div.className = `vtl-item reveal in sd-${Math.min(i+1,7)}`;
      div.innerHTML = `
        <div class="vtl-dot"></div>
        <div class="vtl-card">
          <div class="vtl-meta"><span class="vtl-date">${esc(j.date)}</span><span class="vtl-badge">${j.badge}</span></div>
          <div class="vtl-title">${esc(j.title)}</div>
          <div class="vtl-desc">${esc(j.desc)}</div>
        </div>`;
      vtl.appendChild(div);
    });
    if (dot) vtl.appendChild(dot);
  }

  function renderAchievements() {
    const items = D.achievements;
    if (!items) return;
    const grid = document.querySelector('.ach-grid');
    if (!grid) return;
    grid.innerHTML = items.map((a,i) => `
      <div class="ach-card reveal in">
        <span class="ach-ic">${a.ico||'🏅'}</span>
        <div class="ach-t">${esc(a.title)}</div>
        <div class="ach-d">${esc(a.desc)}</div>
      </div>`).join('');
  }

  /* ════════════════════════════════════════════════════════════════
     CERTIFICATES — ring card system
     Storage key: 'portfolio-certificates' (separate from D)
  ════════════════════════════════════════════════════════════════ */
  /* ════════════════════════════════════════════════════════════════
     CERTIFICATES — flat image grid, unlimited, drag-to-reorder
     key: "portfolio-certificates"
     Schema: [{ id, title, image }]
  ════════════════════════════════════════════════════════════════ */
  const KEY_CERTS = 'portfolio-certificates';

  function loadCerts() {
    try { return JSON.parse(localStorage.getItem(KEY_CERTS)) || null; }
    catch { return null; }
  }
  function saveCertsStore(arr) {
    try { localStorage.setItem(KEY_CERTS, JSON.stringify(arr)); }
    catch(e) { toast('Storage full — try smaller images or fewer certs', 'error'); }
  }
  function getCerts() { return loadCerts() || []; }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

  /* ── Render grid in admin overlay ── */
  function populateCertList() {
    const grid = document.getElementById('adm-cert-grid');
    if (!grid) return;
    const certs = getCerts();
    if (!certs.length) {
      grid.innerHTML = '<p style="font-size:0.68rem;color:rgba(255,255,255,0.22);text-align:center;padding:20px 0">No certificates yet. Upload images above.</p>';
      return;
    }
    grid.innerHTML = certs.map((c, i) => `
      <div class="adm-cert-card" draggable="true" data-idx="${i}" data-id="${esc(c.id)}">
        <div class="adm-cert-card-drag" title="Drag to reorder">⠿</div>
        <div class="adm-cert-card-img-wrap">
          ${c.image
            ? `<img src="${c.image}" alt="${esc(c.title)}" class="adm-cert-card-img" loading="lazy"/>`
            : `<div class="adm-cert-card-placeholder">🖼</div>`
          }
        </div>
        <input class="adm-cert-card-title" type="text" value="${esc(c.title)}"
          placeholder="Certificate title" data-idx="${i}"
          style="width:100%;margin-top:8px"/>
        <button class="adm-cert-card-del" data-action="del-cert" data-idx="${i}" title="Delete">✕</button>
      </div>`).join('');

    /* Inline title edit → live save */
    grid.querySelectorAll('.adm-cert-card-title').forEach(inp => {
      inp.addEventListener('input', e => {
        const idx = parseInt(e.target.dataset.idx);
        const certs = getCerts();
        if (certs[idx]) { certs[idx].title = e.target.value; saveCertsStore(certs); renderCertGrid(); }
      });
    });

    initCertGridDrag(grid);
  }

  /* ── Multi-file processing — Cloudinary ── */
  function processMultipleFiles(files) {
    const errElId = 'adm-certs-err';
    const errEl   = document.getElementById(errElId);
    function showErr(m) { if (errEl) { errEl.textContent = m; setTimeout(() => { if(errEl) errEl.textContent=''; }, 3000); } }

    const valid = [...files].filter(f => {
      if (!['image/jpeg','image/png'].includes(f.type)) { showErr('Only JPG/PNG allowed — skipping invalid files.'); return false; }
      if (f.size > 2*1024*1024)                         { showErr('Some files exceed 2 MB and were skipped.');        return false; }
      return true;
    });
    if (!valid.length) return;

    const certs = getCerts();
    let done = 0;

    valid.forEach(file => {
      handleImageUpload(file, errElId, url => {
        certs.push({ id: uid(), title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), image: url });
        done++;
        if (done === valid.length) {
          saveCertsStore(certs);
          populateCertList();
          renderCertGrid();
          toast(valid.length === 1 ? 'Certificate added' : `${valid.length} certificates added`);
        }
      });
    });
  }

  /* ── Bind drop zone (called once after panel is built) ── */
  function initCertUploadZone() {
    const zone    = document.getElementById('adm-certs-drop-zone');
    const fileInp = document.getElementById('adm-certs-file-input');
    if (!zone || zone.__certZoneBound) return;
    zone.__certZoneBound = true;

    zone.addEventListener('click', () => fileInp.click());
    fileInp.addEventListener('change', e => processMultipleFiles(e.target.files));

    zone.addEventListener('dragenter', e => { e.preventDefault(); zone.classList.add('adm-certs-drop-active'); });
    zone.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('adm-certs-drop-active'); });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('adm-certs-drop-active'); });
    zone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove('adm-certs-drop-active');
      processMultipleFiles(e.dataTransfer.files);
    });
  }

  /* ── Grid drag-to-reorder ── */
  function initCertGridDrag(grid) {
    if (!grid || grid.__certDragBound) return;
    grid.__certDragBound = true;
    let dragIdx = null, overEl = null;

    function clearOver() { if (overEl) { overEl.classList.remove('adm-cert-card-over'); overEl = null; } }

    grid.addEventListener('dragstart', e => {
      const card = e.target.closest('.adm-cert-card');
      if (!card) return;
      dragIdx = parseInt(card.dataset.idx);
      card.classList.add('adm-cert-card-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragIdx));
      e.stopPropagation();
    });
    grid.addEventListener('dragend', e => {
      e.target.closest('.adm-cert-card')?.classList.remove('adm-cert-card-dragging');
      clearOver(); dragIdx = null;
    });
    grid.addEventListener('dragover', e => {
      e.preventDefault(); e.stopPropagation();
      const card = e.target.closest('.adm-cert-card');
      if (!card || card === overEl) return;
      clearOver(); overEl = card; overEl.classList.add('adm-cert-card-over');
    });
    grid.addEventListener('dragleave', e => { if (!grid.contains(e.relatedTarget)) clearOver(); });
    grid.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      const dropCard = e.target.closest('.adm-cert-card');
      clearOver();
      if (!dropCard || dragIdx === null) return;
      const dropIdx = parseInt(dropCard.dataset.idx);
      if (dragIdx === dropIdx) return;
      const certs = getCerts();
      const [moved] = certs.splice(dragIdx, 1);
      certs.splice(dropIdx, 0, moved);
      saveCertsStore(certs);
      populateCertList();
      renderCertGrid();
      toast('Order saved');
      /* Flash the dropped card after re-render */
      requestAnimationFrame(() => {
        const cards = document.querySelectorAll('#adm-cert-grid .adm-cert-card');
        if (cards[dropIdx]) DragFX.flashDrop(cards[dropIdx]);
      });
    });
  }

  /* ── Delete cert (event delegation via bindDynamicButtons) ── */
  function deleteCert(idx) {
    const certs = getCerts();
    certs.splice(idx, 1);
    saveCertsStore(certs);
    populateCertList();
    renderCertGrid();
    toast('Certificate deleted');
  }

  /* ── Render to live portfolio (flat image grid) ── */
  function renderCertGrid() {
    const row = document.querySelector('.cert-row');
    if (!row) return;
    const certs = getCerts();
    if (!certs.length) { row.innerHTML = ''; return; }
    row.innerHTML = certs.map(c => {
      const img = c.image
        ? `<img src="${c.image}" alt="${esc(c.title)}" class="cert-grid-img" loading="lazy"/>`
        : `<div class="cert-grid-placeholder">🖼</div>`;
      return `<div class="cert-grid-item">${img}<div class="cert-grid-title">${esc(c.title)}</div></div>`;
    }).join('');
  }

  /* Keep renderCertRings as alias so subsection drag wrapper still works */
  function renderCertRings() { renderCertGrid(); }


  function renderContact() {
    if (D.email) {
      /* FIX: Also update #contact-email element used by index.html setEmail() */
      const contactEmailEl = document.getElementById('contact-email');
      if (contactEmailEl) {
        contactEmailEl.innerHTML =
          `<a href="mailto:${D.email}" class="email-link">${D.email}</a>`;
      }
      /* Update all mailto: links */
      document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
        a.href = 'mailto:' + D.email;
        if (a.textContent.includes('@')) a.textContent = D.email;
      });
      /* Update .ct-val elements containing @ (email slots) */
      document.querySelectorAll('.ct-val').forEach(el => {
        if (el.textContent.trim().includes('@')) el.textContent = D.email;
      });
      /* FIX: Persist to adminEmail so page reloads pick it up */
      localStorage.setItem('adminEmail', D.email);
    }
    if (D.location) {
      document.querySelectorAll('.ct-val').forEach(el => {
        const t = el.textContent.toLowerCase();
        if (t.includes('india') || t.includes('hyderabad') || t.includes('location')) {
          el.textContent = D.location;
        }
      });
    }
    if (D.github)    document.querySelectorAll('a[href*="github.com"]').forEach(a  => a.href = D.github);
    if (D.linkedin)  document.querySelectorAll('a[href*="linkedin.com"]').forEach(a => a.href = D.linkedin);
    if (D.instagram) document.querySelectorAll('a[href*="instagram.com"]').forEach(a=> a.href = D.instagram);
  }

  function renderSections() {
    SC.forEach(sec => {
      const el  = document.getElementById(sec.id);
      const nav = document.querySelector(`.nav-links a[href="#${sec.id}"]`);
      if (el)  el.style.display  = sec.visible === false ? 'none' : '';
      if (nav) nav.parentElement.style.display = sec.visible === false ? 'none' : '';
    });
    /* Apply saved order to live page */
    applySectionOrder(SC.map(s => s.id));
  }


  /* ════════════════════════════════════════════════════════════════
     SECTION ORDER — apply saved order to the live portfolio DOM
     key: "portfolio-section-order"
  ════════════════════════════════════════════════════════════════ */
  const KEY_SEC_ORDER = 'portfolio-section-order';
  const KEY_SUB_ORDER = 'portfolio-subsection-order';

  function loadSectionOrder() {
    try { return JSON.parse(localStorage.getItem(KEY_SEC_ORDER)) || null; }
    catch { return null; }
  }
  function saveSectionOrder(arr) {
    localStorage.setItem(KEY_SEC_ORDER, JSON.stringify(arr));
  }
  function loadSubOrder() {
    try { return JSON.parse(localStorage.getItem(KEY_SUB_ORDER)) || {}; }
    catch { return {}; }
  }
  function saveSubOrder(obj) {
    localStorage.setItem(KEY_SUB_ORDER, JSON.stringify(obj));
  }

  /* Move live <section> elements into saved order */
  function applySectionOrder(orderArr) {
    if (!orderArr || !orderArr.length) return;
    const body = document.body;
    orderArr.forEach(id => {
      const el = document.getElementById(id);
      if (el) body.appendChild(el); /* moves to end → net result is the saved order */
    });
  }

  /* Move subsection items (skills, projects, certs, journey) into saved order */
  function applySubsectionOrder() {
    const sub = loadSubOrder();

    /* Skills */
    if (sub.skills && D.skills) {
      D.skills = reorderByIds(D.skills, sub.skills, s => s.name);
      renderSkills();
    }
    /* Projects */
    if (sub.projects && D.projects) {
      D.projects = reorderByIds(D.projects, sub.projects, p => p.title);
      renderProjects();
    }
    /* Certs */
    if (sub.certs) {
      const certs = getCerts();
      const reordered = reorderByIds(certs, sub.certs, c => c.title);
      saveCertsStore(reordered);
      renderCertRings();
    }
    /* Journey */
    if (sub.journey && D.journey) {
      D.journey = reorderByIds(D.journey, sub.journey, j => j.title);
      renderJourney();
    }
  }

  /* Reorder arr to match the order defined by ids (matched via keyFn) */
  function reorderByIds(arr, ids, keyFn) {
    const map = new Map(arr.map(item => [keyFn(item), item]));
    const ordered = [];
    ids.forEach(id => { if (map.has(id)) { ordered.push(map.get(id)); map.delete(id); } });
    map.forEach(v => ordered.push(v)); /* append any not in saved order */
    return ordered;
  }


  /* ════════════════════════════════════════════════════════════════
     LEVEL 1 — SECTION DRAG (admin overlay only)
     Dragging entire <section> elements in the admin sections panel.
     Conflict prevention: uses stopPropagation so subsection drags
     inside cards do not bubble up to this handler.
  ════════════════════════════════════════════════════════════════ */
  function initSectionDrag() {
    if (!isAdminMode) return;   /* only enable when admin is open */
    const list = document.getElementById('adm-section-order-list');
    if (!list || list.__secDragBound) return;
    list.__secDragBound = true;

    let dragId  = null;
    let overEl  = null;

    function clearOver() {
      if (overEl) { overEl.classList.remove('adm-drag-over'); overEl = null; }
    }

    list.addEventListener('dragstart', e => {
      const item = e.target.closest('.adm-section-drag-item');
      if (!item) return;
      dragId = item.dataset.secId;
      item.classList.add('adm-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragId);
      e.stopPropagation(); /* don't bubble to any outer drag handler */
    });

    list.addEventListener('dragend', e => {
      const item = e.target.closest('.adm-section-drag-item');
      if (item) item.classList.remove('adm-dragging');
      clearOver();
      dragId = null;
    });

    list.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      const item = e.target.closest('.adm-section-drag-item');
      if (!item || item === overEl) return;
      clearOver();
      overEl = item;
      overEl.classList.add('adm-drag-over');
    });

    list.addEventListener('dragleave', e => {
      if (!list.contains(e.relatedTarget)) clearOver();
    });

    list.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      const dropItem = e.target.closest('.adm-section-drag-item');
      clearOver();
      if (!dropItem || !dragId || dragId === dropItem.dataset.secId) return;

      /* Reorder SC array */
      const fromIdx = SC.findIndex(s => s.id === dragId);
      const toIdx   = SC.findIndex(s => s.id === dropItem.dataset.secId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = SC.splice(fromIdx, 1);
      SC.splice(toIdx, 0, moved);

      /* Persist */
      saveSections(SC);
      saveSectionOrder(SC.map(s => s.id));

      /* Re-render drag list and live page order */
      populateSections();
      applySectionOrder(SC.map(s => s.id));

      toast('Section order saved');
      /* Flash the dropped row */
      requestAnimationFrame(() => {
        const dropped = document.querySelector(`[data-sec-id="${dropItem.dataset.secId}"]`);
        if (dropped) DragFX.flashDrop(dropped);
      });
    });
  }


  /* ════════════════════════════════════════════════════════════════
     LEVEL 2 — SUBSECTION DRAG (skills · projects · certs · journey)
     One reusable engine; called once, uses event delegation on body.
     stopPropagation prevents bubbling into section-level drag.
  ════════════════════════════════════════════════════════════════ */

  /* Config map: containerSelector → { itemSel, dataKey, keyFn, afterDrop } */
  const SUB_CONFIGS = [
    {
      containerSel: '.sk-grid',
      itemSel:      '.sk-card',
      dataKey:      'skills',
      keyFn:        s => s.name,
      afterDrop(arr) { D.skills = arr; saveData(D); renderSkills(); },
    },
    {
      containerSel: '.projects-grid',
      itemSel:      '.pj',
      dataKey:      'projects',
      keyFn:        p => p.title,
      afterDrop(arr) { D.projects = arr; saveData(D); renderProjects(); },
    },
    {
      containerSel: '.cert-row',
      itemSel:      '.cert-c',
      dataKey:      'certs',
      keyFn:        c => c.title,
      afterDrop(arr) { saveCertsStore(arr); renderCertRings(); },
    },
    {
      containerSel: '.vtl',
      itemSel:      '.vtl-item',
      dataKey:      'journey',
      keyFn:        j => j.title,
      afterDrop(arr) { D.journey = arr; saveData(D); renderJourney(); },
    },
  ];

  let _subAdminActive = false; /* true only while admin panel is open */

  function initSubsectionDrag() {
    if (!isAdminMode) return;   /* only enable when admin is open */
    if (_subAdminActive) return;
    _subAdminActive = true;
    SUB_CONFIGS.forEach(cfg => bindSubDrag(cfg));
  }

  /* Called by closePanel — removes grip handles and draggable attrs from live cards */
  function disableSubsectionDrag() {
    _subAdminActive = false;
    SUB_CONFIGS.forEach(cfg => {
      const container = document.querySelector(cfg.containerSel);
      if (!container) return;
      /* Remove grip handles */
      container.querySelectorAll('.sub-grip').forEach(g => g.remove());
      /* Disable draggable */
      container.querySelectorAll(cfg.itemSel).forEach(el => {
        el.setAttribute('draggable', 'false');
        el.style.cursor = '';
        el.classList.remove('adm-sub-dragging', 'adm-sub-drag-over');
      });
      /* Reset bound flags so drag re-binds cleanly next open */
      container.__subDragBound = false;
      container.__enableSubDrag = null;
    });
  }

  function bindSubDrag(cfg) {
    const container = document.querySelector(cfg.containerSel);
    if (!container || container.__subDragBound) return;
    container.__subDragBound = true;

    let dragIdx = null;
    let overEl  = null;

    function getItems() { return [...container.querySelectorAll(cfg.itemSel)]; }

    function clearOver() {
      if (overEl) { overEl.classList.remove('adm-sub-drag-over'); overEl = null; }
    }

    function getDataArr() {
      if (cfg.dataKey === 'certs')   return getCerts();
      if (cfg.dataKey === 'skills')  return D.skills   || [];
      if (cfg.dataKey === 'projects')return D.projects  || [];
      if (cfg.dataKey === 'journey') return D.journey   || [];
      return [];
    }

    /* Make items draggable only when admin is open */
    function enableDraggable(on) {
      getItems().forEach((el, i) => {
        el.setAttribute('draggable', on ? 'true' : 'false');
        el.dataset.subIdx = i;
        if (on) {
          el.style.cursor = 'grab';
          /* Add grip indicator if not already there */
          if (!el.querySelector('.sub-grip')) {
            const g = document.createElement('span');
            g.className = 'sub-grip';
            g.textContent = '⠿';
            g.title = 'Drag to reorder';
            el.insertBefore(g, el.firstChild);
          }
        } else {
          el.style.cursor = '';
          el.querySelector('.sub-grip')?.remove();
        }
      });
    }

    /* Called by openPanel / closePanel */
    container.__enableSubDrag = enableDraggable;

    container.addEventListener('dragstart', e => {
      if (e.target.closest('.adm-cert-draggable, .adm-section-drag-item')) return;
      const item = e.target.closest(cfg.itemSel);
      if (!item) return;
      dragIdx = parseInt(item.dataset.subIdx ?? '-1');
      item.classList.add('adm-sub-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragIdx));
      e.stopPropagation();
    });

    container.addEventListener('dragend', e => {
      const item = e.target.closest(cfg.itemSel);
      if (item) item.classList.remove('adm-sub-dragging');
      clearOver();
      dragIdx = null;
    });

    container.addEventListener('dragover', e => {
      e.preventDefault();
      e.stopPropagation();
      const item = e.target.closest(cfg.itemSel);
      if (!item || item === overEl) return;
      clearOver();
      overEl = item;
      overEl.classList.add('adm-sub-drag-over');
    });

    container.addEventListener('dragleave', e => {
      if (!container.contains(e.relatedTarget)) clearOver();
    });

    container.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      const dropItem = e.target.closest(cfg.itemSel);
      clearOver();
      if (!dropItem || dragIdx === null) return;
      const dropIdx = parseInt(dropItem.dataset.subIdx ?? '-1');
      if (dragIdx === dropIdx || dropIdx < 0) return;

      /* Reorder data array */
      const arr = getDataArr();
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(dropIdx, 0, moved);

      /* Persist sub-order */
      const sub = loadSubOrder();
      sub[cfg.dataKey] = arr.map(cfg.keyFn);
      saveSubOrder(sub);

      /* Update live DOM */
      cfg.afterDrop(arr);

      /* Re-bind draggable since DOM was rebuilt */
      requestAnimationFrame(() => {
        const newContainer = document.querySelector(cfg.containerSel);
        if (newContainer && newContainer !== container) {
          newContainer.__subDragBound = false;
          newContainer.__enableSubDrag = null;
          bindSubDrag(cfg);
          newContainer.__enableSubDrag?.(true);
        } else {
          enableDraggable(true);
        }
      });

      toast('Order saved');
      /* Flash the dropped item after DOM rebuilds */
      requestAnimationFrame(() => {
        const items = document.querySelectorAll(cfg.itemSel);
        if (items[dropIdx]) DragFX.flashDrop(items[dropIdx]);
      });
    enableDraggable(true);
  }

  /* ── Re-init subsection drag after any full re-render ── */
  const _origRenderSkills   = renderSkills;
  const _origRenderProjects = renderProjects;
  const _origRenderJourney  = renderJourney;
  const _origRenderCertRings = renderCertRings;

  function renderSkills()    { _origRenderSkills();    if(_subAdminActive) requestAnimationFrame(() => bindSubDrag(SUB_CONFIGS[0])); }
  function renderProjects()  { _origRenderProjects();  if(_subAdminActive) requestAnimationFrame(() => bindSubDrag(SUB_CONFIGS[1])); }
  function renderCertRings() { _origRenderCertRings(); if(_subAdminActive) requestAnimationFrame(() => bindSubDrag(SUB_CONFIGS[2])); }
  function renderJourney()   { _origRenderJourney();   if(_subAdminActive) requestAnimationFrame(() => bindSubDrag(SUB_CONFIGS[3])); }

  /* ════════════════════════════════════════════════════════════════
     THEME BINDING
  ════════════════════════════════════════════════════════════════ */
  function bindTheme() {
    document.getElementById('adm-theme-grid')?.addEventListener('click', e => {
      const swatch = e.target.closest('.adm-swatch');
      if (!swatch) return;
      const key = swatch.dataset.theme;
      document.documentElement.setAttribute('data-theme', key);
      localStorage.setItem('user-theme', key);
      document.querySelectorAll('.adm-swatch').forEach(s => s.classList.toggle('adm-swatch-active', s.dataset.theme === key));
      document.querySelectorAll('.tsw').forEach(s => s.classList.toggle('on', s.dataset.t === key));
    });

    const hexInp = document.getElementById('adm-custom-hex');
    const colorPicker = document.getElementById('adm-color-picker');

    function applyHex(hex) {
      if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
      let el = document.getElementById('admin-theme-override');
      if (!el) { el = document.createElement('style'); el.id = 'admin-theme-override'; document.head.appendChild(el); }
      el.textContent = `:root{--acc:${hex};--acc2:${hex}26;--glow:${hex}80;}`;
      document.documentElement.removeAttribute('data-theme');
      document.querySelectorAll('.adm-swatch').forEach(s => s.classList.remove('adm-swatch-active'));
      if (colorPicker) colorPicker.value = hex;
      if (hexInp) hexInp.value = hex;
      D.customAccent = hex;
    }

    hexInp?.addEventListener('input', e => applyHex(e.target.value));
    colorPicker?.addEventListener('input', e => applyHex(e.target.value));
  }

  /* ════════════════════════════════════════════════════════════════
     ACCOUNT / CREDENTIALS
  ════════════════════════════════════════════════════════════════ */
  function bindAccountSave() {
    document.getElementById('adm-save-creds')?.addEventListener('click', () => {
      const id    = document.getElementById('adm-new-id')?.value.trim();
      const pass  = document.getElementById('adm-new-pass')?.value;
      const pass2 = document.getElementById('adm-new-pass2')?.value;
      if (!id || !pass) return toast('ID and password are required', 'error');
      if (pass !== pass2) return toast('Passwords do not match', 'error');
      saveCreds({ id, pass });
      document.getElementById('adm-new-id').value    = '';
      document.getElementById('adm-new-pass').value  = '';
      document.getElementById('adm-new-pass2').value = '';
      toast('Credentials updated ✓');
    });
  }

  /* ════════════════════════════════════════════════════════════════
     SAVE ALL
  ════════════════════════════════════════════════════════════════ */
  function saveAll() {
    // Pull latest values from inputs before saving
    D.heroImg   = val('adm-hero-img') || (loadProfileImage() ? '' : '');
    D.firstName = val('adm-hero-fname');
    D.lastName  = val('adm-hero-lname');
    D.greetText = val('adm-hero-greet');
    D.roles     = val('adm-hero-roles').split('\n').filter(r=>r.trim());
    D.heroDesc  = val('adm-hero-desc');
    D.badgeText = val('adm-hero-badge');
    D.btn1Text  = val('adm-hero-btn1');
    D.btn2Text  = val('adm-hero-btn2');
    D.cvUrl     = val('adm-hero-cv');
    D.aboutSub  = val('adm-about-sub');
    D.aboutP1   = val('adm-about-p1');
    D.aboutP2   = val('adm-about-p2');
    D.aboutCards = [1,2,3].map(i => ({
      ico:   val(`adm-about-ic${i}`),
      title: val(`adm-about-t${i}`),
      val:   val(`adm-about-v${i}`),
    }));
    D.email     = val('adm-ct-email');
    D.location  = val('adm-ct-loc');
    D.github    = val('adm-soc-gh');
    D.linkedin  = val('adm-soc-li');
    D.instagram = val('adm-soc-ig');

    // Save theme
    const curTheme = document.documentElement.getAttribute('data-theme');
    if (curTheme) { D.theme = curTheme; localStorage.setItem('user-theme', curTheme); }

    saveData(D);
    saveSections(SC);

    /* Broadcast save to portfolio-sync.js on the live page (same origin) */
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('portfolio-admin-sync');
        bc.postMessage({ type: 'save', ts: Date.now() });
        bc.close();
      }
    } catch(e) {}

    toast('All changes saved ✓');
  }

  /* ════════════════════════════════════════════════════════════════
     PREVIEW MODE
  ════════════════════════════════════════════════════════════════ */
  function enterPreview() {
    isPreview = true;
    const ov = document.getElementById('adm-overlay');
    if (ov) { ov.classList.remove('adm-visible'); setTimeout(() => { ov.style.display='none'; }, 380); }
    const badge = document.getElementById('adm-preview-badge');
    if (badge) badge.style.display = 'block';
  }

  function exitPreview() {
    isPreview = false;
    const badge = document.getElementById('adm-preview-badge');
    if (badge) badge.style.display = 'none';
    const ov = document.getElementById('adm-overlay');
    if (ov) { ov.style.display='flex'; requestAnimationFrame(() => ov.classList.add('adm-visible')); }
  }

  /* ════════════════════════════════════════════════════════════════
     UTILITIES
  ════════════════════════════════════════════════════════════════ */
  function esc(str) {
    return String(str||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ════════════════════════════════════════════════════════════════
     PROFILE IMAGE — Cloudinary URL stored in localStorage
     key: "portfolio-profile-image"
  ════════════════════════════════════════════════════════════════ */
  const KEY_PROFILE = 'portfolio-profile-image';

  function loadProfileImage() {
    try { return localStorage.getItem(KEY_PROFILE) || ''; } catch { return ''; }
  }
  function saveProfileImage(url) {
    try { localStorage.setItem(KEY_PROFILE, url); } catch { toast('Could not save — try again', 'error'); }
  }

  /* Show the circular preview and hide the placeholder */
  function showProfilePreview(src) {
    const preview     = document.getElementById('adm-img-preview');
    const placeholder = document.getElementById('adm-profile-placeholder');
    if (!preview) return;
    if (src) {
      preview.src = src;
      preview.style.display = 'block';
      if (placeholder) placeholder.style.display = 'none';
    } else {
      preview.src = '';
      preview.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
    }
  }

  /* Apply image to live portfolio hero */
  function applyProfileToHero(src) {
    const img = document.getElementById('himg');
    if (img) img.src = src;
  }

  function processProfileFile(file) {
    handleImageUpload(file, 'adm-profile-err', url => {
      saveProfileImage(url);
      showProfilePreview(url);
      applyProfileToHero(url);
      const urlInp = document.getElementById('adm-hero-img');
      if (urlInp) urlInp.value = '';
      D.heroImg = '';
      toast('Profile image saved ✓');
    });
  }

  function initProfileDrop() {
    const zone     = document.getElementById('adm-profile-drop-zone');
    const fileInp  = document.getElementById('adm-profile-file');
    const browseBtn= document.getElementById('adm-profile-browse-btn');
    const clearBtn = document.getElementById('adm-profile-clear-btn');
    if (!zone || zone.__profileDragBound) return;
    zone.__profileDragBound = true;

    /* Click zone or browse button → open file picker */
    zone.addEventListener('click', e => {
      if (e.target.closest('#adm-profile-browse-btn, #adm-profile-clear-btn')) return;
      fileInp.click();
    });
    browseBtn?.addEventListener('click', e => { e.stopPropagation(); fileInp.click(); });

    /* File input change */
    fileInp.addEventListener('change', e => processProfileFile(e.target.files[0]));

    /* Drag highlight */
    zone.addEventListener('dragenter', e => { e.preventDefault(); zone.classList.add('adm-profile-drop-active'); });
    zone.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); zone.classList.add('adm-profile-drop-active'); });
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('adm-profile-drop-active');
    });
    zone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation();
      zone.classList.remove('adm-profile-drop-active');
      processProfileFile(e.dataTransfer.files[0]);
    });

    /* Clear button */
    clearBtn?.addEventListener('click', e => {
      e.stopPropagation();
      saveProfileImage('');
      showProfilePreview('');
      applyProfileToHero('');
      const urlInp = document.getElementById('adm-hero-img');
      if (urlInp) urlInp.value = '';
      D.heroImg = '';
      const errEl = document.getElementById('adm-profile-err');
      if (errEl) errEl.textContent = '';
      toast('Profile image removed');
    });
  }

  function updateImgPreview(src) {
    showProfilePreview(src);
  }

  function getDefaultSkills() {
    return [
      { ico:'⚙️', name:'C Programming', level:90, locked:false },
      { ico:'🐍', name:'Python',         level:50, locked:false },
      { ico:'🗄️', name:'Data Structures',level:25, locked:false },
      { ico:'🤖', name:'Machine Learning',level:10, locked:false },
      { ico:'⚛️', name:'React',           level:0,  locked:true  },
      { ico:'🔶', name:'Git',             level:0,  locked:true  },
    ];
  }
  function getDefaultProjects() {
    return [
      { ico:'📁', title:'Python Calculator',         desc:'A feature-rich calculator.', tags:['Python','CLI'],    github:'#', live:'#' },
      { ico:'📁', title:'Student Management System', desc:'CRUD application.',          tags:['Python','File I/O'],github:'#', live:'#' },
      { ico:'📁', title:'Portfolio Website',         desc:'This portfolio.',            tags:['HTML','CSS','JS'],  github:'#', live:'#' },
      { ico:'📁', title:'DSA Practice Tracker',      desc:'Track DSA progress.',        tags:['Python','DSA'],     github:'#', live:'#' },
    ];
  }
  function getDefaultJourney() {
    return [
      { date:'2025', badge:'🎓', title:'Started B.Tech CSE (AI & ML)',  desc:'Joined VITS.' },
      { date:'2025', badge:'✅', title:'Started C Programming',          desc:'Learned C fundamentals.' },
      { date:'2025', badge:'✅', title:'Completed C Programming',        desc:'Mastered C.' },
      { date:'27 Feb 2026', badge:'🏆', title:'Hackathon Debut — VHack', desc:'First hackathon.' },
      { date:'2025', badge:'🧠', title:'Exploring AI & ML',             desc:'Studying AI.' },
      { date:'2025', badge:'💜', title:'Built This Portfolio',           desc:'This site.' },
      { date:'Future', badge:'🚀', title:"What's Next?",                desc:'Full-stack mastery.' },
    ];
  }
  function getDefaultAchievements() {
    return [
      { ico:'🎓', title:'B.Tech in Computer Science', desc:'Currently pursuing my degree.' },
      { ico:'🏆', title:'Hackathon Finalist',          desc:'National-level hackathon.' },
      { ico:'</>',title:'500+ GitHub Contributions',  desc:'Consistent open-source commits.' },
      { ico:'🥇', title:'Web Dev Certification',      desc:'Advanced full-stack cert.' },
    ];
  }
  function getDefaultAboutCards() {
    return [
      { ico:'🎓', title:'Education',   val:'B.Tech CSE (AI & ML) – VITS (2025–2029)' },
      { ico:'</>',title:'Focus Areas', val:'Python, Data Structures & Algorithms' },
      { ico:'🤖', title:'Interests',   val:'Artificial Intelligence & Machine Learning' },
    ];
  }

  /* ════════════════════════════════════════════════════════════════
     KEYBOARD SHORTCUT — Ctrl+S → admin
  ════════════════════════════════════════════════════════════════ */
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && (e.key === 's' || e.keyCode === 83)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isLoggedIn) {
        if (isPreview) exitPreview();
        else { /* already open */ }
      } else {
        showLogin();
      }
    }
    if (e.key === 'Escape') {
      closeModal();
      if (isLoggedIn && !isPreview) closePanel();
    }
  }, true); // capturing — fires before any other listener

  /* ════════════════════════════════════════════════════════════════
     DRAG FX — premium visual feedback utility
     flashDrop(el): brief accent pulse on the dropped element.
     No rAF loops. CSS animation does all work.
  ════════════════════════════════════════════════════════════════ */
  /* ════════════════════════════════════════════════════════════════
     LAYOUT BUILDER — Part 1: Multi-column, Part 2: Templates,
                      Part 3: Undo/Redo history
     Storage keys:
       "portfolio-col-layout"   — per-section column counts
       "portfolio-templates"    — named layout snapshots
     Undo/Redo is in-memory only (resets on page reload).
  ════════════════════════════════════════════════════════════════ */

  const KEY_COL_LAYOUT = 'portfolio-col-layout';
  const KEY_TEMPLATES  = 'portfolio-templates';
  const BUILDER_SECTIONS = ['about','skills','projects','journey','certs','contact'];
  const COL_OPTIONS = [1, 2, 3];

  /* ── Column layout storage ── */
  function loadColLayout() {
    try { return JSON.parse(localStorage.getItem(KEY_COL_LAYOUT)) || {}; }
    catch { return {}; }
  }
  function saveColLayout(obj) {
    localStorage.setItem(KEY_COL_LAYOUT, JSON.stringify(obj));
  }

  /* ── Templates storage ── */
  function loadTemplates() {
    try { return JSON.parse(localStorage.getItem(KEY_TEMPLATES)) || {}; }
    catch { return {}; }
  }
  function saveTemplates(obj) {
    localStorage.setItem(KEY_TEMPLATES, JSON.stringify(obj));
  }

  /* ── Get full layout snapshot ── */
  function getCurrentLayout() {
    return {
      sectionOrder: SC.map(s => s.id),
      sectionVisibility: SC.map(s => ({ id: s.id, visible: s.visible })),
      colLayout: loadColLayout(),
      subOrder: (() => { try { return JSON.parse(localStorage.getItem(KEY_SUB_ORDER)) || {}; } catch { return {}; } })(),
    };
  }

  /* ── Apply a full layout snapshot ── */
  function applyLayout(layout) {
    if (!layout) return;

    /* Section order + visibility */
    if (layout.sectionOrder) {
      const newSC = layout.sectionOrder.map(id => {
        const vis = layout.sectionVisibility?.find(s => s.id === id);
        return { id, visible: vis ? vis.visible : true };
      });
      /* Merge in any IDs missing from snapshot */
      SC.forEach(s => { if (!newSC.find(n => n.id === s.id)) newSC.push(s); });
      SC.length = 0; newSC.forEach(s => SC.push(s));
      saveSections(SC);
      saveSectionOrder(SC.map(s => s.id));
      populateSections();
      renderSections();
    }

    /* Column layout */
    if (layout.colLayout) {
      saveColLayout(layout.colLayout);
      applyColLayoutToPage(layout.colLayout);
    }

    /* Subsection order */
    if (layout.subOrder) {
      localStorage.setItem(KEY_SUB_ORDER, JSON.stringify(layout.subOrder));
      applySubsectionOrder();
    }

    populateBuilderPanel();
  }


  /* ════════════════════════════════════
     UNDO / REDO — in-memory history
  ════════════════════════════════════ */
  let _undoStack = [];   /* Array of JSON strings */
  let _redoStack = [];
  const UNDO_LIMIT = 50;

  function builderSaveState() {
    const snap = JSON.stringify(getCurrentLayout());
    /* Don't push duplicate consecutive state */
    if (_undoStack.length && _undoStack[_undoStack.length - 1] === snap) return;
    _undoStack.push(snap);
    if (_undoStack.length > UNDO_LIMIT) _undoStack.shift();
    _redoStack = [];
    updateUndoRedoUI();
  }

  function builderUndo() {
    if (_undoStack.length < 2) return;
    const current = _undoStack.pop();
    _redoStack.push(current);
    applyLayout(JSON.parse(_undoStack[_undoStack.length - 1]));
    updateUndoRedoUI();
    toast('Undo ✓');
  }

  function builderRedo() {
    if (!_redoStack.length) return;
    const next = _redoStack.pop();
    _undoStack.push(next);
    applyLayout(JSON.parse(next));
    updateUndoRedoUI();
    toast('Redo ✓');
  }

  function updateUndoRedoUI() {
    const undoBtn  = document.getElementById('bldr-undo-btn');
    const redoBtn  = document.getElementById('bldr-redo-btn');
    const infoSpan = document.getElementById('bldr-history-info');
    if (undoBtn) undoBtn.disabled = _undoStack.length < 2;
    if (redoBtn) redoBtn.disabled = _redoStack.length === 0;
    if (infoSpan) {
      const steps = _undoStack.length - 1;
      infoSpan.textContent = steps > 0
        ? `${steps} action${steps !== 1 ? 's' : ''} in history`
        : 'No history yet';
    }
  }


  /* ════════════════════════════════════
     MULTI-COLUMN LAYOUT
  ════════════════════════════════════ */

  /* Apply stored column counts to live portfolio sections */
  function applyColLayoutToPage(colMap) {
    Object.entries(colMap).forEach(([secId, cols]) => {
      const sec = document.getElementById(secId);
      if (!sec) return;
      /* Find or create a .bldr-col-wrap inside the section */
      let wrap = sec.querySelector('.bldr-col-wrap');
      if (!wrap) {
        /* Wrap existing direct content children */
        wrap = document.createElement('div');
        wrap.className = 'bldr-col-wrap';
        /* Move section children (except nav anchors) into wrap */
        [...sec.children].forEach(child => {
          if (!child.classList.contains('bldr-col-wrap')) wrap.appendChild(child);
        });
        sec.appendChild(wrap);
      }
      setColumnCount(wrap, cols);
    });
  }

  function setColumnCount(wrap, count) {
    wrap.style.columnCount = count;
    wrap.setAttribute('data-cols', count);
    /* Update CSS custom property for gap */
    wrap.style.setProperty('--bldr-cols', count);
  }

  /* Populate builder panel section list */
  function populateBuilderPanel() {
    const list = document.getElementById('bldr-section-list');
    if (!list) return;
    const colMap = loadColLayout();
    const labels = { about:'About', skills:'Skills', projects:'Projects', journey:'Journey', certs:'Certificates', contact:'Contact' };

    list.innerHTML = BUILDER_SECTIONS.map(id => {
      const cols = colMap[id] || 1;
      return `
        <div class="bldr-sec-row" data-sec="${id}">
          <span class="bldr-sec-label">${labels[id] || id}</span>
          <div class="bldr-col-btns">
            ${COL_OPTIONS.map(n => `
              <button class="bldr-col-btn${cols === n ? ' active' : ''}"
                data-sec="${id}" data-cols="${n}">${n} col${n > 1 ? 's' : ''}</button>
            `).join('')}
          </div>
        </div>`;
    }).join('');

    /* Bind column buttons */
    list.querySelectorAll('.bldr-col-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        builderSaveState();
        const secId = btn.dataset.sec;
        const cols  = parseInt(btn.dataset.cols);
        const colMap = loadColLayout();
        colMap[secId] = cols;
        saveColLayout(colMap);
        applyColLayoutToPage(colMap);
        populateBuilderPanel();
        toast(`${labels[secId]} → ${cols} column${cols > 1 ? 's' : ''}`);
      });
    });

    updateUndoRedoUI();
    populateTemplateSelect();
  }


  /* ════════════════════════════════════
     LAYOUT TEMPLATES
  ════════════════════════════════════ */

  function populateTemplateSelect() {
    const sel = document.getElementById('bldr-tpl-select');
    if (!sel) return;
    const templates = loadTemplates();
    const names = Object.keys(templates);
    sel.innerHTML = '<option value="">— Select template —</option>' +
      names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  }

  function saveTemplate(name) {
    if (!name.trim()) { toast('Enter a template name first', 'error'); return; }
    builderSaveState();
    const templates = loadTemplates();
    templates[name.trim()] = getCurrentLayout();
    saveTemplates(templates);
    populateTemplateSelect();
    toast(`Template "${name.trim()}" saved ✓`);
  }

  function loadTemplate(name) {
    if (!name) return;
    const templates = loadTemplates();
    if (!templates[name]) { toast('Template not found', 'error'); return; }
    builderSaveState();
    applyLayout(templates[name]);
    toast(`Template "${name}" loaded ✓`);
  }

  function deleteTemplate(name) {
    if (!name) return;
    const templates = loadTemplates();
    if (!templates[name]) return;
    delete templates[name];
    saveTemplates(templates);
    populateTemplateSelect();
    toast(`Template "${name}" deleted`);
  }


  /* ════════════════════════════════════
     BIND BUILDER PANEL EVENTS
  ════════════════════════════════════ */

  function bindBuilderPanel() {
    /* Undo / Redo buttons */
    document.getElementById('bldr-undo-btn')?.addEventListener('click', builderUndo);
    document.getElementById('bldr-redo-btn')?.addEventListener('click', builderRedo);

    /* Template save */
    document.getElementById('bldr-save-tpl-btn')?.addEventListener('click', () => {
      const name = document.getElementById('bldr-tpl-name')?.value || '';
      saveTemplate(name);
      if (document.getElementById('bldr-tpl-name')) document.getElementById('bldr-tpl-name').value = '';
    });

    /* Template load */
    document.getElementById('bldr-load-tpl-btn')?.addEventListener('click', () => {
      const sel = document.getElementById('bldr-tpl-select');
      if (sel) loadTemplate(sel.value);
    });

    /* Template delete */
    document.getElementById('bldr-del-tpl-btn')?.addEventListener('click', () => {
      const sel = document.getElementById('bldr-tpl-select');
      if (sel && sel.value) deleteTemplate(sel.value);
    });

    populateBuilderPanel();
  }

  /* Hook: call builderSaveState after every drag save so undo captures it */
  const _origSaveSectionOrder = saveSectionOrder;
  function saveSectionOrder(arr) {
    _origSaveSectionOrder(arr);
    /* Debounce to avoid duplicate states on rapid drags */
    clearTimeout(saveSectionOrder._t);
    saveSectionOrder._t = setTimeout(builderSaveState, 120);
  }

  const _origSaveSubOrder = saveSubOrder;
  function saveSubOrder(obj) {
    _origSaveSubOrder(obj);
    clearTimeout(saveSubOrder._t);
    saveSubOrder._t = setTimeout(builderSaveState, 120);
  }

  /* Keyboard shortcuts: Ctrl+Z / Ctrl+Y — only when builder panel is active */
  document.addEventListener('keydown', e => {
    if (!isAdminMode) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
      e.preventDefault(); builderUndo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
      e.preventDefault(); builderRedo();
    }
  });

  /* Apply saved column layout on boot */
  function applyBuilderOnBoot() {
    const colMap = loadColLayout();
    if (Object.keys(colMap).length) applyColLayoutToPage(colMap);
    /* Seed initial undo state */
    requestAnimationFrame(builderSaveState);
  }

  const DragFX = {
    flashDrop(el) {
      if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      el.classList.remove('adm-drop-flash');
      /* Force reflow so re-adding the class restarts the animation */
      void el.offsetWidth;
      el.classList.add('adm-drop-flash');
      el.addEventListener('animationend', () => el.classList.remove('adm-drop-flash'), { once: true });
    }
  };

  /* ════════════════════════════════════════════════════════════════
     BOOT — inject HTML then apply saved data on page load
  ════════════════════════════════════════════════════════════════ */
  function boot() {
    injectHTML();
    renderAll();          // Apply saved content to live portfolio
    renderSections();     // Apply visibility + section order
    applySubsectionOrder(); // Apply subsection item order
    applyBuilderOnBoot(); // Apply column layout + seed undo state
    if (D.customAccent) {
      let el = document.getElementById('admin-theme-override');
      if (!el) { el = document.createElement('style'); el.id='admin-theme-override'; document.head.appendChild(el); }
      el.textContent = `:root{--acc:${D.customAccent};--acc2:${D.customAccent}26;--glow:${D.customAccent}80;}`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  console.log('%c✦ Portfolio Admin v1.0 — Ctrl+S to open', 'color:#4f6ef5;font-family:monospace;font-weight:bold');

})();
