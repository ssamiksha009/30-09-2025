// =======================================================
// Apollo Tyres • Engineer Dashboard
// Robust, null-safe, 404-tolerant dashboard script
// =======================================================

document.addEventListener('DOMContentLoaded', init);

/* ----------------- tiny helpers ----------------- */
const $  = (id) => document.getElementById(id);
const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

function authHeaders() {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: 'Bearer ' + token } : {};
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (s) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[s]);
}

async function safeFetchJson(url, opts = {}) {
  try {
    const res = await fetch(url, {
      ...opts,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers||{}), ...authHeaders() }
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* --------- favorites (pinned) helpers --------- */
function getPinned() {
  try {
    const v = localStorage.getItem('pinnedProjects');
    const a = v ? JSON.parse(v) : [];
    return Array.isArray(a) ? a : [];
  } catch { return []; }
}
function savePinned(arr) {
  try { localStorage.setItem('pinnedProjects', JSON.stringify(arr)); } catch {}
}
function normalizeProjectKey(p) {
  // Prefer numeric id; fallback to a string key based on name to avoid collisions
  return (p && p.id != null) ? String(p.id) : `name:${p?.project_name ?? ''}`;
}
function isPinned(p) {
  const key = normalizeProjectKey(p);
  return getPinned().includes(key);
}
function togglePinned(p) {
  const key = normalizeProjectKey(p);
  const pins = getPinned();
  const i = pins.indexOf(key);
  if (i >= 0) pins.splice(i,1); else pins.push(key);
  savePinned(pins);
  // Re-render list so pinned rows float within the section
  loadProjects();
}

/* --------- "recent activity" helpers (local touches) --------- */
function getTouchMap() {
  try {
    const raw = localStorage.getItem('projectTouches');
    const map = raw ? JSON.parse(raw) : {};
    return (map && typeof map === 'object') ? map : {};
  } catch { return {}; }
}
function setTouch(id, whenMs = Date.now()) {
  try {
    if (id == null) return;
    const map = getTouchMap();
    map[String(id)] = whenMs;
    localStorage.setItem('projectTouches', JSON.stringify(map));
  } catch {}
}
function getTouchMs(id) {
  const map = getTouchMap();
  const v = map[String(id)];
  return typeof v === 'number' ? v : 0;
}
function touchProject(id) { setTouch(id, Date.now()); }

/* --------- Postgres timestamp parsing/formatting ---------
   Parse "YYYY-MM-DD HH:MM:SS(.ms)" as LOCAL time to avoid date shift. */
function parsePgTimestamp(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return isNaN(ts) ? null : ts;
  if (typeof ts === 'number') { const d = new Date(ts); return isNaN(d) ? null : d; }

  if (typeof ts === 'string') {
    // Already ISO with TZ?
    if (/[T]/.test(ts) && /Z|[+-]\d{2}:?\d{2}$/.test(ts)) {
      const d = new Date(ts);
      return isNaN(d) ? null : d;
    }
    // "YYYY-MM-DD HH:MM:SS(.ms)"
    const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/);
    if (m) {
      const [ , Y, Mo, D, H, Mi, S='0', Frac='0' ] = m;
      const ms = Math.round(Number('0.' + Frac) * 1000);
      return new Date(Number(Y), Number(Mo)-1, Number(D), Number(H), Number(Mi), Number(S), ms);
    }
    const d = new Date(ts);
    return isNaN(d) ? null : d;
  }
  return null;
}
function tsMs(x){ const d = parsePgTimestamp(x); return d ? d.getTime() : 0; }
function fmtDate(ts) {
  const d = parsePgTimestamp(ts);
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateTime(ts) {
  const d = parsePgTimestamp(ts);
  if (!d) return '—';
  return d.toLocaleString();
}
function timeAgo(dateStr) {
  const now = new Date();
  const past = new Date(dateStr);
  const diff = Math.floor((now - past) / 1000); // seconds

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function lastActivityMs(p){
  return Math.max(
    getTouchMs(p.id),
    tsMs(p.updated_at),
    tsMs(p.completed_at),
    tsMs(p.created_at)
  );
}

/* ----------------- bootstrap ----------------- */
async function init() {
  if (!localStorage.getItem('authToken')) { window.location.href = '/login.html'; return; }

  // Logout (sidebar and dropdown)
  on('logoutBtn',     'click', doLogout);
  on('logoutBtnMenu', 'click', doLogout);

  // Optional buttons (bind only if present)
  on('newProjectBtn', 'click', () => window.location.href = '/index.html');
  on('helpBtn',       'click', () => window.open('/components/help.pdf', '_blank', 'noopener'));

  // Refresh button near search
  on('refreshBtn', 'click', refreshDashboard);

  wireProfileMenu();

  // User → header + kebab menu
  await loadAndRenderUser();

  // Data sections
  await Promise.all([loadProjects(), loadRecentCompleted(), loadActivity()]);
}

/* ----------------- auth/user ----------------- */
function doLogout() {
  localStorage.removeItem('authToken');
  window.location.href = '/login.html';
}

async function refreshDashboard() {
  const btn = document.getElementById('refreshBtn');
  if (btn) { btn.disabled = true; btn.classList.add('is-refreshing'); }
  try {
    await Promise.all([loadProjects(), loadRecentCompleted(), loadActivity()]);
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('is-refreshing'); }
  }
}

// Secondary lookup to get a name by email if /api/me didn't provide it
async function resolveNameByEmail(email) {
  if (!email) return null;
  const routes = [
    `/api/users/by-email?email=${encodeURIComponent(email)}`,
    `/api/users?email=${encodeURIComponent(email)}`
  ];
  for (const r of routes) {
    const j = await safeFetchJson(r);
    if (!j) continue;
    const u = j.user || j;
    const nm = u.name || u.full_name;
    if (nm) return nm;
  }
  return null;
}

async function fetchCurrentUser() {
  // Primary: your API should return id, email, role, name, created_at, last_login
  const urls = ['/api/me', '/api/auth/me', '/api/users/me', '/users/me'];
  let user = null;
  for (const u of urls) {
    const data = await safeFetchJson(u);
    const candidate = data && (data.user || data);
    if (candidate && (candidate.email || candidate.name || candidate.role)) { user = candidate; break; }
  }

  // Fallback: decode JWT payload
  if (!user) {
    const token = localStorage.getItem('authToken');
    if (token) {
      try {
        const b64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
        const json = atob(b64);
        const jwt  = JSON.parse(decodeURIComponent(escape(json)));
        user = {
          email: jwt.email || jwt.sub || '',
          name:  jwt.name  || '',
          role:  jwt.role  || 'Engineer',
          created_at: jwt.created_at || (jwt.iat ? new Date(jwt.iat * 1000).toISOString() : null),
          last_login: jwt.last_login || (jwt.auth_time ? new Date(jwt.auth_time * 1000).toISOString() : null),
          avatar_url: jwt.avatar_url
        };
      } catch { /* ignore */ }
    }
  }

  // Last resort: loose localStorage fields
  if (!user) {
    user = {
      email: localStorage.getItem('userEmail') || '',
      name:  localStorage.getItem('userName')  || '',
      role:  localStorage.getItem('userRole')  || 'Engineer',
      created_at: localStorage.getItem('userCreatedAt'),
      last_login:  localStorage.getItem('userLastLogin'),
      avatar_url:  localStorage.getItem('userAvatar')
    };
  }

  if (!user.name && user.email) {
    const resolved = await resolveNameByEmail(user.email);
    if (resolved) user.name = resolved;
  }

  return user;
}

async function loadAndRenderUser() {
  const u = await fetchCurrentUser();

  const email = u.email || '—';
  const role  = (u.role || 'Engineer').toString();
  const name  = u.name || u.full_name || (email !== '—' ? email.split('@')[0] : 'Engineer');

  const memberSince = fmtDate(u.created_at || u.createdAt);
  const lastLogin   = fmtDateTime(u.last_login || u.last_login_at || u.lastLoginAt);

  // Header bits
  if ($('userName'))  $('userName').textContent  = name;
  if ($('userEmail')) $('userEmail').textContent = email;
  if (u.avatar_url && $('userAvatar')) $('userAvatar').src = u.avatar_url;

  // Optional sidebar mini-profile
  if ($('profileName')) $('profileName').textContent = name;
  if ($('profileRole')) $('profileRole').textContent = role;
  if ($('statCreated')) $('statCreated').textContent = fmtDateTime(u.created_at || u.createdAt);
  if ($('statLastLogin')) $('statLastLogin').textContent = fmtDateTime(u.last_login || u.last_login_at || u.lastLoginAt);

  // Kebab menu header + details
  if ($('menuName'))  $('menuName').textContent = name;
  if ($('menuEmail')) $('menuEmail').textContent = email;
  if ($('menuAvatar') && u.avatar_url) $('menuAvatar').src = u.avatar_url;

  if ($('detailEmail'))       $('detailEmail').textContent = email;
  if ($('detailRole'))        $('detailRole').textContent  = role;
  if ($('detailMemberSince')) $('detailMemberSince').textContent = memberSince;
  if ($('detailLastLogin'))   $('detailLastLogin').textContent   = lastLogin;

  // === Welcome banner text + waving hand ===
  const firstName = (name || '').trim().split(/\s+/)[0] || (email.split('@')[0] || 'Engineer');

  // Find a heading to place text into:
  // Prefer an explicit id if you have it; else use the first heading inside .welcome
  const h2 = document.getElementById('welcomeTitle')
        || document.querySelector('.welcome h2')
        || document.querySelector('.welcome-title');

  if (h2) {
    // Clear current content
    while (h2.firstChild) h2.removeChild(h2.firstChild);

    // "Welcome "
    h2.appendChild(document.createTextNode('Welcome '));

    // Name (highlighted)
    const nameSpan = document.createElement('span');
    nameSpan.className = 'hl';
    nameSpan.textContent = firstName;
    h2.appendChild(nameSpan);
  }

  return u;
}



/* ----------------- data: projects/activity ----------------- */
async function loadProjects() {
  const tbody = document.querySelector('#projectsTable tbody');
  const noProjects = $('noProjects');
  if (tbody) tbody.innerHTML = '';
  if (noProjects) noProjects.style.display = 'none';

  // Prefer dedicated endpoint; fall back to /api/project-history (engineer view)
  let projects = [];
  let resp = await safeFetchJson('/api/my-projects');
  if (resp && Array.isArray(resp.projects)) projects = resp.projects;
  if (!projects.length) {
    const hist = await safeFetchJson('/api/project-history');
    if (Array.isArray(hist)) projects = hist;
    else if (hist && Array.isArray(hist.projects)) projects = hist.projects;
  }

  // KPIs (based on the full set)
  const inProgress = projects.filter(p => (p.status || '').toLowerCase() === 'in progress').length;
  const completed  = projects.filter(p => (p.status || '').toLowerCase() === 'completed').length;

  $('metric-projects')        && ( $('metric-projects').textContent = projects.length );
  $('metric-active')          && ( $('metric-active').textContent   = inProgress );
  $('metric-completed-short') && ( $('metric-completed-short').textContent = completed );
  $('statCompleted')          && ( $('statCompleted').textContent = completed );

  if (!projects.length) { if (noProjects) noProjects.style.display = 'block'; return; }

  // Only show 7 most recent by "last activity";
  // within those five, put pinned rows first
  const pins = new Set(getPinned());
  const top7 = projects
    .map(p => ({ p, last: lastActivityMs(p), pinned: pins.has(normalizeProjectKey(p)) }))
    .sort((a,b) => (b.pinned - a.pinned) || (b.last - a.last))
    .slice(0, 7)
    .map(x => x.p);

  for (const p of top7) {
    const pinned = pins.has(normalizeProjectKey(p));

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="project-title">
        <button class="pin-btn ${pinned ? 'is-pinned' : ''}" type="button" title="${pinned ? 'Unpin' : 'Pin'}" data-pin>
          <!-- Red push-pin (ball + needle) -->
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g transform="rotate(-25 12 12)">
              <circle class="pin-ball" cx="9" cy="8" r="4.8"/>
              <circle class="pin-highlight" cx="7.6" cy="6.9" r="1.2"/>
              <rect class="pin-neck" x="11.2" y="8" width="2.6" height="3.2" rx="1.2"/>
              <line class="pin-needle" x1="12.5" y1="11.2" x2="20.5" y2="22"/>
            </g>
          </svg>
        </button>

        <span class="title-text">${escapeHtml(p.project_name || p.id || 'Untitled')}</span>

        <button class="title-edit" type="button" title="Rename">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
          </svg>
        </button>
      </td>
      <td>${escapeHtml(p.protocol || '')}</td>
      <td>${fmtDateTime(p.created_at)}</td>
      <td>
        <span class="badge ${badgeClass(p.status)}">
          ${escapeHtml(p.status || 'not started')}
        </span>
      </td>
      <td class="tright">
        <button class="btn" data-open>Open Project</button>
      </td>
    `;

    // --- Pin handler: instant visual, persist, then re-render ---
    const pinBtn = tr.querySelector('[data-pin]');
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pinBtn.classList.toggle('is-pinned');   // immediate visual
      togglePinned(p);                        // persist + re-render
    });

    // --- Rename handlers ---
    const titleCell = tr.querySelector('.project-title');
    const titleSpan = tr.querySelector('.title-text');
    tr.querySelector('.title-edit').addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(titleCell, titleSpan, p);
    });

    // --- Open project (prefill for "In Progress") ---
    tr.querySelector('[data-open]').addEventListener('click', () => openProject(p));

    tbody.appendChild(tr);
  }
}

function badgeClass(s) {
  const t = (s || '').toLowerCase();
  if (t.includes('progress')) return 'in-progress';
  if (t.includes('complete')) return 'completed';
  if (t.includes('fail'))     return 'failed';
  return '';
}

// Map DB protocol → page
function protocolPage(proto) {
  const key = (proto || '').toUpperCase().trim();
  switch (key) {
    case 'MF62':   return 'mf.html';
    case 'MF52':   return 'mf52.html';
    case 'FTIRE':  return 'ftire.html';
    case 'CDTIRE': return 'cdtire.html';
    case 'CUSTOM': return 'custom.html';
    default:       return 'index.html';
  }
}

// Decide where to go when “Open Project” is clicked
function openProject(p) {
  const page = protocolPage(p.protocol);
  const pid  = encodeURIComponent(p.id ?? p.project_name ?? '');
  const status = (p.status || '').toLowerCase();

  // mark as "touched" so it can float into Top-7 recents
  try { touchProject(p.id); } catch {}

  if (status === 'in progress' && pid) {
    // give protocol page quick access to inputs; it can still hit /api/projects/:id
    try {
      sessionStorage.setItem('prefillProjectId', String(p.id ?? ''));
      if (p.inputs) sessionStorage.setItem('prefillInputs', JSON.stringify(p.inputs));
    } catch {}
    window.location.href = `/${page}?projectId=${pid}&prefill=1`;
  } else {
    window.location.href = `/${page}`;
  }
}

/* ----------------- rename: API + inline UX ----------------- */

// Try PATCH first; fall back to PUT if the server only supports that
async function renameProject(projectId, newName) {
  const url = `/api/projects/${encodeURIComponent(projectId)}/name`;
  const opts = (method) => ({
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ project_name: newName })
  });

  try {
    let res = await fetch(url, opts('PATCH'));
    if (!res.ok) {
      // fallback once with PUT
      res = await fetch(url, opts('PUT'));
    }
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data && data.success !== false);
  } catch {
    return false;
  }
}

// Inline edit with a guard so blur + Enter doesn't double-run
function startRename(cell, span, project) {
  const old = span.textContent.trim();
  const input = document.createElement('input');
  input.type = 'text';
  input.value = old;
  input.className = 'title-input';

  span.style.display = 'none';
  cell.insertBefore(input, span);
  input.focus();
  input.select();

  let finished = false;

  const done = async (commit) => {
    if (finished) return;
    finished = true;

    const newVal = input.value.trim();

    // Restore UI safely (avoid NotFoundError if this runs twice)
    if (input.parentNode) input.parentNode.removeChild(input);
    span.style.display = '';

    if (!commit || !newVal || newVal === old) return;

    const ok = await renameProject(project.id, newVal);
    if (ok) {
      span.textContent = newVal;
      project.project_name = newVal;           // keep local row in sync
      try { touchProject(project.id); } catch {}
      window.dispatchEvent(new CustomEvent('project:renamed', { detail: { id: project.id, name: newVal }}));
      // Refresh so it can move into Top-7 if needed
      loadProjects();
    } else {
      alert('Could not rename project. Please try again.');
      span.textContent = old;
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') done(true);
    else if (e.key === 'Escape') done(false);
  });
  input.addEventListener('blur', () => done(true));
}

/* ----------------- recent completed & activity ----------------- */
async function loadRecentCompleted() {
  const container = $('recentContainer');
  const noRecent  = $('noRecent');
  if (!container) return;
  container.querySelectorAll('.recent-item').forEach(n => n.remove());
  if (noRecent) noRecent.style.display = 'none';

  const resp = await safeFetchJson('/api/my-projects') || { projects: [] };
  const projects = (resp.projects || []).filter(p => (p.status || '').toLowerCase() === 'completed');
  if (!projects.length) { if (noRecent) noRecent.style.display = 'block'; return; }

  for (const p of projects.slice(0,5)) {
    const div = document.createElement('div');
    div.className = 'recent-item';
    div.innerHTML = `
  <div class="recent-item-card">
    <div class="recent-left">
      <div class="recent-icon">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4CAF50" d="M12 0L15.09 7.36L23 8.63L17 14.14L18.18 22L12 18.77L5.82 22L7 14.14L1 8.63L8.91 7.36L12 0Z"/></svg>
      </div>
      <div class="recent-info">
        <div class="recent-title">${escapeHtml(p.project_name || p.id)}</div>
        <div class="recent-meta">
          <span class="project-badge">${escapeHtml(p.protocol || '')}</span> · ${fmtDateTime(p.created_at)} · <span class="relative-time">${timeAgo(p.created_at)}</span>
        </div>
      </div>
    </div>
    <div class="recent-action">
      <button class="btn" data-open>Open</button>
    </div>
  </div>
`;
    div.querySelector('[data-open]').addEventListener('click', () => {
      const pid = encodeURIComponent(p.id || p.project_name);
      window.location.href = `/select.html?projectId=${pid}`;
    });
    container.insertBefore(div, noRecent || null);
  }
}

async function loadActivity() {
  const list = $('activityList');
  const noAct = $('noActivity');
  if (list) list.innerHTML = '';
  if (noAct) noAct.style.display = 'none';

  const resp = await safeFetchJson('/api/my-activity') || { activities: [] };
  const items = resp.activities || [];
  if (!items.length) { if (noAct) noAct.style.display = 'block'; return; }

  for (const a of items.slice(0, 10)) {
    const li = document.createElement('li');
    li.textContent = `${a.message || a.type || 'Activity'} — ${fmtDateTime(a.time || a.created_at)}`;
    if (list) list.appendChild(li);
  }
}

/* ----------------- kebab menu wiring ----------------- */
function wireProfileMenu() {
  const btn  = $('profileMenuBtn');
  const menu = $('profileMenu');
  if (!btn || !menu) return;

  const close = () => { menu.setAttribute('aria-hidden','true');  btn.setAttribute('aria-expanded','false'); };
  const open  = () => { menu.setAttribute('aria-hidden','false'); btn.setAttribute('aria-expanded','true');  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    (menu.getAttribute('aria-hidden') === 'false') ? close() : open();
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && e.target !== btn) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

// AFTER
const href = getProjectDestination(row);
actionLink.href = href;
actionLink.textContent = normalizeStatus(row.status) === 'in progress' ? 'Continue' :
                         normalizeStatus(row.status) === 'completed'   ? 'View' : 'Open';
