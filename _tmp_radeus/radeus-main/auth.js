// ============================================================
// RADEUS — auth.js
// Include on every operator page BEFORE the page's own script.
// Handles: session check, staff lookup, name injection,
//          single-system static display, role storage.
// ============================================================

const SUPA_URL = 'https://bvpesxpptgdwkhsewhke.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2cGVzeHBwdGdkd2toc2V3aGtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNzcwNTksImV4cCI6MjA5MTk1MzA1OX0._th9UdQKqIWvqgTrxxpd5IfTlexCUeyWC5aGwRJYZj8';

// ── Supabase REST helper ─────────────────────────────────────
async function authGet(table, params = '') {
  const session = getSession();
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': `Bearer ${session?.access_token || SUPA_KEY}`,
    'Content-Type': 'application/json'
  };
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${table}${params}`, { headers });
    if (!r.ok) return null;
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  } catch { return null; }
}

// ── Session storage (Supabase-compatible) ───────────────────
const SESSION_KEY = 'radeus_session';

function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // Check expiry
    if (s.expires_at && Date.now() / 1000 > s.expires_at) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch { return null; }
}

function setSession(session) {
  if (!session) { localStorage.removeItem(SESSION_KEY); return; }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('radeus_staff');
}

// ── Staff record ─────────────────────────────────────────────
function getStoredStaff() {
  try {
    const raw = localStorage.getItem('radeus_staff');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function storeStaff(staff) {
  localStorage.setItem('radeus_staff', JSON.stringify(staff));
}

// ── Sign in ─────────────────────────────────────────────────
async function signIn(email, password) {
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.msg || 'Login failed');
  return data; // { access_token, refresh_token, expires_at, user }
}

// ── Sign out ─────────────────────────────────────────────────
async function signOut() {
  const session = getSession();
  if (session?.access_token) {
    await fetch(`${SUPA_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${session.access_token}` }
    }).catch(() => {});
  }
  clearSession();
  window.location.href = 'login.html';
}

// ── Require auth — call at top of every operator page ────────
// Returns staff record or redirects to login.
async function requireAuth() {
  const session = getSession();
  if (!session) { window.location.href = 'login.html'; return null; }

  // Use cached staff if available
  let staff = getStoredStaff();
  if (!staff || staff._user_id !== session.user?.id) {
    const rows = await authGet('staff',
      `?auth_user_id=eq.${session.user.id}&select=staff_id,name,role,email,active,org_id&limit=1`);
    if (!rows?.length || !rows[0].active) {
      clearSession();
      window.location.href = 'login.html';
      return null;
    }
    staff = { ...rows[0], _user_id: session.user.id };
    storeStaff(staff);
  }

  // Inject name into topbar
  injectOperatorName(staff.name, staff.role);
  // Wire logout button if present
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', signOut);

  return staff;
}

// ── Inject operator name into topbar ────────────────────────
function injectOperatorName(name, role) {
  const el = document.getElementById('operatorName');
  if (el) el.textContent = name || 'OPERATOR';
  const roleEl = document.getElementById('operatorRole');
  if (roleEl) roleEl.textContent = role || '';
}

// ── Single-system static display ────────────────────────────
// Call after loading systems. If only 1 system, converts
// the sys-select dropdown into a static styled label.
function applySingleSystemDisplay(systems) {
  if (!systems || systems.length !== 1) return;
  const sel = document.getElementById('sysSelect');
  if (!sel) return;
  const name = systems[0].system_name.toUpperCase();
  const span = document.createElement('span');
  span.id = 'sysSelect';
  span.className = 'sys-select sys-static';
  span.textContent = `⬡ ${name}`;
  span.title = name;
  sel.parentNode.replaceChild(span, sel);
}
