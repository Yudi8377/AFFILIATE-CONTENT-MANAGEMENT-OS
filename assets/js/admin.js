import { createAuthClient } from '@neondatabase/auth';

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL;
const DATA_API_URL = import.meta.env.VITE_NEON_DATA_API_URL;
const auth = AUTH_URL ? createAuthClient(AUTH_URL) : null;
const $ = (id) => document.getElementById(id);
const state = { user: null, token: null, workspaces: [], profiles: [], admins: [], licenses: [], providers: [], agents: [] };

function message(id, text, kind) {
  const node = $(id);
  if (!node) return;
  node.textContent = text || '';
  node.className = 'notice' + (kind ? ' notice-' + kind : '');
}
function busy(form, on) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = on;
  button.textContent = on ? 'Memproses…' : button.dataset.label;
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
function card(container, title, lines, badge) {
  const root = element('article', null, 'record-card');
  const head = element('div', null, 'record-heading');
  head.append(element('h3', title));
  if (badge) head.append(element('span', badge, 'record-badge'));
  root.append(head);
  (lines || []).filter((line) => line !== null && line !== undefined && line !== '').forEach((line) => root.append(element('p', line)));
  $(container).append(root);
  return root;
}
function empty(container, text) { $(container).append(element('p', text, 'empty-state')); }
async function getIdentity() {
  if (!auth) throw new Error('Konfigurasi Neon Auth belum tersedia.');
  const result = await auth.getSession();
  if (result.error) throw new Error(result.error.message || 'Sesi tidak dapat dibaca.');
  const data = result.data;
  const session = data && (data.session || data);
  const user = (data && data.user) || (session && session.user) || null;
  if (!user || !user.id) return { user: null, token: null };
  const tokenResult = await auth.token();
  if (tokenResult.error || !tokenResult.data || !tokenResult.data.token) throw new Error('JWT Neon Auth tidak tersedia.');
  return { user, token: tokenResult.data.token };
}
async function api(table, options) {
  options = options || {};
  if (!DATA_API_URL) throw new Error('Konfigurasi Neon Data API belum tersedia.');
  const token = options.token || state.token;
  if (!token) throw new Error('Sesi tidak aktif.');
  const method = options.method || 'GET';
  const headers = new Headers({ Authorization: 'Bearer ' + token, Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') headers.set('Prefer', 'return=representation');
  const response = await fetch(DATA_API_URL + '/' + table + (options.query ? '?' + options.query : ''), {
    method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: 'no-store'
  });
  const raw = await response.text();
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 250) }; } }
  if (!response.ok) throw new Error((data && (data.message || data.details || data.hint)) || ('Data API HTTP ' + response.status));
  return data;
}
function button(label, action, danger) {
  const b = element('button', label, 'button button-small' + (danger ? ' button-danger' : ''));
  b.type = 'button';
  b.addEventListener('click', action);
  return b;
}
function selectControl(options, value) {
  const s = document.createElement('select');
  s.className = 'admin-select';
  options.forEach((item) => {
    const o = element('option', item.label, null);
    o.value = item.value;
    o.selected = item.value === value;
    s.append(o);
  });
  return s;
}
function textInput(value, placeholder) {
  const i = document.createElement('input');
  i.value = value || '';
  i.placeholder = placeholder || '';
  return i;
}
function checkbox(value, label) {
  const wrap = element('label', null, 'admin-checkbox');
  const input = document.createElement('input');
  input.type = 'checkbox'; input.checked = Boolean(value);
  wrap.append(input, element('span', label));
  return { wrap, input };
}
function profileName(userId) {
  const p = state.profiles.find((item) => item.user_id === userId);
  return p ? (p.display_name || p.user_id) : userId;
}
async function checkAdmin() {
  const identity = await getIdentity();
  if (!identity.user) {
    $('admin-auth').hidden = false; $('admin-dashboard').hidden = true; $('admin-denied').hidden = true;
    message('admin-auth-message', 'Masuk dengan akun platform administrator.');
    return;
  }
  state.user = identity.user; state.token = identity.token;
  const rows = await api('platform_admins', { query: 'select=user_id,status&user_id=eq.' + encodeURIComponent(state.user.id) + '&limit=1' });
  if (!Array.isArray(rows) || !rows.length || rows[0].status !== 'active') {
    $('admin-auth').hidden = true; $('admin-dashboard').hidden = true; $('admin-denied').hidden = false;
    $('admin-denied-user').textContent = state.user.email || state.user.id;
    return;
  }
  $('admin-auth').hidden = true; $('admin-denied').hidden = true; $('admin-dashboard').hidden = false;
  $('admin-user-label').textContent = (state.user.name || state.user.email || 'Administrator') + ' · ' + (state.user.email || state.user.id);
  await refreshAll();
}
async function refreshAll() {
  try {
    const [workspaces, profiles, admins, licenses, providers, agents] = await Promise.all([
      api('workspaces', { query: 'select=id,name,slug,status,owner_user_id,created_at&order=created_at.desc&limit=200' }),
      api('user_profiles', { query: 'select=user_id,display_name,preferred_locale,created_at&order=created_at.desc&limit=200' }),
      api('platform_admins', { query: 'select=user_id,status,granted_by,reason,granted_at&order=granted_at.desc&limit=200' }),
      api('license_entitlements', { query: 'select=id,workspace_id,license_code,plan_code,status,starts_at,ends_at,created_at&order=created_at.desc&limit=200' }),
      api('provider_registry', { query: 'select=provider_key,provider_type,status,free_tier_verified,commercial_rights_verified,notes,last_checked_at&order=provider_key.asc' }),
      api('agent_registry', { query: 'select=agent_key,display_name,purpose,status,version,requires_external_model,updated_at&order=agent_key.asc' })
    ]);
    state.workspaces = workspaces || []; state.profiles = profiles || []; state.admins = admins || [];
    state.licenses = licenses || []; state.providers = providers || []; state.agents = agents || [];
    $('metric-workspaces').textContent = String(state.workspaces.length);
    $('metric-licenses').textContent = String(state.licenses.length);
    $('metric-admins').textContent = String(state.admins.length);
    await Promise.all([renderWorkspaces(), renderProfiles(), renderAdmins(), renderLicenses(), renderProviders(), renderAgents(), renderAudit()]);
    message('admin-message', 'Data administrasi berhasil dimuat dari Neon.', 'success');
  } catch (error) { message('admin-message', error.message || 'Gagal memuat data admin.', 'error'); }
}
async function renderWorkspaces() {
  $('workspaces-list').replaceChildren();
  const select = $('license-workspace');
  select.replaceChildren();
  select.append(element('option', 'Pilih workspace…'));
  select.firstChild.value = '';
  state.workspaces.forEach((w) => {
    const option = element('option', w.name + ' · ' + w.slug);
    option.value = w.id; select.append(option);
    card('workspaces-list', w.name, ['ID: ' + w.id, 'Slug: ' + w.slug, 'Owner: ' + profileName(w.owner_user_id), 'Status: ' + w.status], w.status);
  });
  if (!state.workspaces.length) empty('workspaces-list', 'Belum ada workspace.');
}
async function renderProfiles() {
  $('profiles-list').replaceChildren();
  const select = $('admin-user-select');
  select.replaceChildren();
  select.append(element('option', 'Pilih akun terdaftar…'));
  select.firstChild.value = '';
  state.profiles.forEach((p) => {
    const option = element('option', (p.display_name || 'Tanpa nama') + ' · ' + p.user_id.slice(0, 12));
    option.value = p.user_id; select.append(option);
    card('profiles-list', p.display_name || 'Profile tanpa nama', ['User ID: ' + p.user_id, 'Locale: ' + p.preferred_locale, 'Created: ' + p.created_at]);
  });
  if (!state.profiles.length) empty('profiles-list', 'Belum ada profil terdaftar.');
}
async function renderAdmins() {
  $('platform-admins-list').replaceChildren();
  state.admins.forEach((a) => {
    const root = card('platform-admins-list', profileName(a.user_id), ['User ID: ' + a.user_id, 'Granted by: ' + (a.granted_by || 'database bootstrap'), a.reason, 'Granted: ' + a.granted_at], a.status);
    const actions = element('div', null, 'admin-inline-actions');
    const remove = button(a.status === 'active' ? 'Suspend' : 'Reactivate', async () => {
      try {
        const status = a.status === 'active' ? 'suspended' : 'active';
        await api('platform_admins', { method: 'PATCH', query: 'user_id=eq.' + encodeURIComponent(a.user_id), body: { status } });
        await refreshAll();
      } catch (error) { message('admin-message', error.message, 'error'); }
    }, a.status === 'active');
    if (a.user_id === state.user.id) remove.disabled = true;
    actions.append(remove);
    if (a.user_id !== state.user.id) actions.append(button('Hapus akses', async () => {
      if (!window.confirm('Hapus akses platform administrator untuk akun ini?')) return;
      try { await api('platform_admins', { method: 'DELETE', query: 'user_id=eq.' + encodeURIComponent(a.user_id) }); await refreshAll(); }
      catch (error) { message('admin-message', error.message, 'error'); }
    }, true));
    root.append(actions);
  });
  if (!state.admins.length) empty('platform-admins-list', 'Belum ada platform admin. Bootstrap awal harus dilakukan oleh pemilik database.');
}
async function renderLicenses() {
  $('licenses-list').replaceChildren();
  const workspaceNames = new Map(state.workspaces.map((w) => [w.id, w.name]));
  state.licenses.forEach((l) => {
    const root = card('licenses-list', l.plan_code + ' · ' + l.license_code, [
      'Workspace: ' + (workspaceNames.get(l.workspace_id) || l.workspace_id),
      'Starts: ' + l.starts_at,
      'Ends: ' + (l.ends_at || 'No expiry'),
      'License ID: ' + l.id
    ], l.status);
    const actions = element('div', null, 'admin-inline-actions');
    const status = selectControl([{value:'active',label:'active'},{value:'suspended',label:'suspended'},{value:'expired',label:'expired'},{value:'revoked',label:'revoked'}], l.status);
    const save = button('Simpan status', async () => {
      try { await api('license_entitlements', { method: 'PATCH', query: 'id=eq.' + l.id, body: { status: status.value } }); await refreshAll(); }
      catch (error) { message('admin-message', error.message, 'error'); }
    });
    actions.append(status, save); root.append(actions);
  });
  if (!state.licenses.length) empty('licenses-list', 'Belum ada lisensi yang diterbitkan.');
}
async function renderProviders() {
  $('providers-list').replaceChildren();
  state.providers.forEach((p) => {
    const root = card('providers-list', p.provider_key, ['Type: ' + p.provider_type, 'Last checked: ' + (p.last_checked_at || 'not checked')], p.status);
    const status = selectControl([{value:'unverified',label:'unverified'},{value:'available',label:'available'},{value:'unavailable',label:'unavailable'},{value:'disabled',label:'disabled'}], p.status);
    const free = checkbox(p.free_tier_verified, 'Free quota verified');
    const rights = checkbox(p.commercial_rights_verified, 'Commercial rights verified');
    const notes = textInput(p.notes, 'Evidence / quota / restrictions');
    const actions = element('div', null, 'admin-inline-actions');
    actions.append(status, free.wrap, rights.wrap, notes, button('Simpan provider', async () => {
      try {
        if (status.value === 'available' && p.provider_type === 'external' && (!free.input.checked || !rights.input.checked)) {
          throw new Error('Provider eksternal tidak dapat diaktifkan sebelum kuota gratis dan hak komersial diverifikasi.');
        }
        await api('provider_registry', { method: 'PATCH', query: 'provider_key=eq.' + encodeURIComponent(p.provider_key), body: {
          status: status.value, free_tier_verified: free.input.checked,
          commercial_rights_verified: rights.input.checked, notes: notes.value,
          updated_at: new Date().toISOString(), last_checked_at: new Date().toISOString()
        }});
        await refreshAll();
      } catch (error) { message('admin-message', error.message, 'error'); }
    }));
    root.append(actions);
  });
  if (!state.providers.length) empty('providers-list', 'Belum ada provider yang terdaftar.');
}
async function renderAgents() {
  $('agents-list').replaceChildren();
  state.agents.forEach((a) => {
    const root = card('agents-list', a.display_name, [a.purpose, 'Key: ' + a.agent_key, 'Version: ' + a.version, 'External model required: ' + (a.requires_external_model ? 'yes' : 'no')], a.status);
    const status = selectControl([{value:'planned',label:'planned'},{value:'rule_based',label:'rule_based'},{value:'tested',label:'tested'},{value:'active',label:'active'},{value:'disabled',label:'disabled'}], a.status);
    const save = button('Simpan status', async () => {
      try {
        if (status.value === 'active' && a.status !== 'tested' && !window.confirm('Status active hanya boleh dipilih setelah ada bukti tes. Lanjutkan?')) return;
        await api('agent_registry', { method: 'PATCH', query: 'agent_key=eq.' + encodeURIComponent(a.agent_key), body: { status: status.value, updated_at: new Date().toISOString() } });
        await refreshAll();
      } catch (error) { message('admin-message', error.message, 'error'); }
    });
    const actions = element('div', null, 'admin-inline-actions'); actions.append(status, save); root.append(actions);
  });
  if (!state.agents.length) empty('agents-list', 'Belum ada agent terdaftar.');
}
async function renderAudit() {
  $('audit-list').replaceChildren(); $('agent-runs-list').replaceChildren();
  const [events, runs] = await Promise.all([
    api('audit_events', { query: 'select=id,workspace_id,actor_user_id,action,entity_type,entity_id,outcome,created_at&order=created_at.desc&limit=100' }),
    api('agent_runs', { query: 'select=id,workspace_id,requested_by,agent_key,status,provider_name,provider_status,estimated_cost,actual_cost,created_at,failure_reason&order=created_at.desc&limit=100' })
  ]);
  const audit = events || [], agentRuns = runs || [];
  $('metric-agents').textContent = String(agentRuns.length);
  audit.forEach((e) => card('audit-list', e.action + ' · ' + e.entity_type, ['Entity: ' + e.entity_id, 'Actor: ' + (e.actor_user_id || 'system'), 'Workspace: ' + (e.workspace_id || 'platform'), e.created_at], e.outcome));
  agentRuns.forEach((a) => card('agent-runs-list', a.agent_key, ['Status: ' + a.status, 'Provider: ' + (a.provider_name || 'not set') + ' · ' + a.provider_status, 'Estimated cost: ' + (a.estimated_cost ?? 'unknown'), 'Actual cost: ' + (a.actual_cost ?? 'unknown'), a.failure_reason, a.created_at], a.status));
  if (!audit.length) empty('audit-list', 'Belum ada audit event.');
  if (!agentRuns.length) empty('agent-runs-list', 'Belum ada agent run.');
}
$('admin-signin').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; busy(form, true);
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    const result = await auth.signIn.email({ email: String(values.email).trim(), password: String(values.password) });
    if (result.error) throw new Error(result.error.message || 'Login gagal.');
    await checkAdmin();
  } catch (error) { message('admin-auth-message', error.message || 'Login gagal.', 'error'); }
  finally { busy(form, false); }
});
$('admin-signout').addEventListener('click', async () => {
  try { await auth.signOut(); state.user = null; state.token = null; $('admin-dashboard').hidden = true; $('admin-auth').hidden = false; message('admin-auth-message', 'Anda sudah keluar.'); }
  catch (error) { message('admin-message', error.message || 'Keluar gagal.', 'error'); }
});
document.querySelectorAll('[data-admin-view]').forEach((buttonNode) => buttonNode.addEventListener('click', () => {
  document.querySelectorAll('[data-admin-view]').forEach((b) => b.classList.toggle('is-active', b === buttonNode));
  document.querySelectorAll('[id^="admin-view-"]').forEach((panel) => { panel.hidden = panel.id !== 'admin-view-' + buttonNode.dataset.adminView; });
}));
$('platform-admin-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; busy(form, true);
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    if (!values.user_id) throw new Error('Pilih pengguna terdaftar.');
    await api('platform_admins', { method: 'POST', body: { user_id: values.user_id, status: 'active', granted_by: state.user.id, reason: String(values.reason || '').trim() } });
    form.reset(); await refreshAll(); message('admin-message', 'Akses platform admin diberikan.', 'success');
  } catch (error) { message('admin-message', error.message || 'Gagal menambah admin.', 'error'); }
  finally { busy(form, false); }
});
$('license-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; busy(form, true);
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    if (!values.workspace_id) throw new Error('Pilih workspace.');
    const licenseCode = String(values.license_code || '').trim();
    if (!licenseCode) throw new Error('License code wajib diisi.');
    const endsAt = values.ends_at ? new Date(values.ends_at + 'T23:59:59Z').toISOString() : null;
    const startsAt = new Date().toISOString();
    if (endsAt && new Date(endsAt) < new Date(startsAt)) throw new Error('Tanggal akhir tidak boleh di masa lalu.');
    await api('license_entitlements', { method: 'POST', body: {
      workspace_id: values.workspace_id, license_code: licenseCode,
      plan_code: String(values.plan_code || 'free').trim(), status: 'active',
      starts_at: startsAt, ends_at: endsAt, limits: {}
    }});
    form.reset(); $('license-code').value = '';
    await refreshAll(); message('admin-message', 'License entitlement berhasil dibuat.', 'success');
  } catch (error) { message('admin-message', error.message || 'Gagal membuat lisensi.', 'error'); }
  finally { busy(form, false); }
});
['licenses','workspaces','agents','providers','audit'].forEach((name) => {
  const buttonNode = $('refresh-' + name);
  if (buttonNode) buttonNode.addEventListener('click', () => refreshAll());
});
function newLicenseCode() { const code = 'ACMOS-' + crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase(); const input = $('license-form').elements.namedItem('license_code'); if (input && !input.value) input.value = code; }
newLicenseCode();
if (!AUTH_URL || !DATA_API_URL) message('admin-auth-message', 'Build belum dikonfigurasi dengan URL Neon.', 'error');
else void checkAdmin().catch((error) => message('admin-auth-message', error.message || 'Gagal memeriksa akses admin.', 'error'));
