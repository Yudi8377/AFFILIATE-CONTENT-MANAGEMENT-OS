import { createAuthClient } from '@neondatabase/auth';
import { generateSeoPlan } from './agents/seo-planner.js';

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL;
const DATA_API_URL = import.meta.env.VITE_NEON_DATA_API_URL;
const auth = AUTH_URL ? createAuthClient(AUTH_URL) : null;
const $ = (id) => document.getElementById(id);
const state = { user: null, workspace: null, role: 'member', seoPlan: null };

function message(id, text, kind) {
  const node = $(id);
  if (!node) return;
  node.textContent = text || '';
  node.className = 'notice' + (kind ? ' notice-' + kind : '');
}
function busy(form, on) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = on;
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.textContent = on ? 'Memproses…' : button.dataset.label;
}
function slugify(value) {
  return String(value || '').normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80) || 'draft-' + Date.now();
}
async function identity() {
  if (!auth) throw new Error('Konfigurasi Neon Auth belum tersedia.');
  const result = await auth.getSession();
  if (result.error) throw new Error(result.error.message || 'Sesi tidak dapat dibaca.');
  const data = result.data;
  const session = data && (data.session || data);
  const user = (data && data.user) || (session && session.user) || null;
  if (!user || !user.id) return { user: null, token: null };
  const tokenResult = await auth.token();
  if (tokenResult.error || !tokenResult.data || !tokenResult.data.token) {
    throw new Error((tokenResult.error && tokenResult.error.message) || 'Neon Auth tidak menghasilkan JWT.');
  }
  return { user, token: tokenResult.data.token };
}
async function api(table, options) {
  options = options || {};
  if (!DATA_API_URL) throw new Error('Konfigurasi Neon Data API belum tersedia.');
  const identityResult = options.token ? null : await identity();
  const token = options.token || (identityResult && identityResult.token);
  if (!token) throw new Error('Sesi tidak aktif. Silakan masuk kembali.');
  const method = options.method || 'GET';
  const headers = new Headers({ Authorization: 'Bearer ' + token, Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') headers.set('Prefer', 'return=representation');
  const url = DATA_API_URL + '/' + table + (options.query ? '?' + options.query : '');
  const response = await fetch(url, {
    method, headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'omit', cache: 'no-store'
  });
  const raw = await response.text();
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 240) }; } }
  if (!response.ok) {
    const detail = data && (data.message || data.hint || data.details);
    throw new Error((detail || ('HTTP ' + response.status)) + ' (Data API ' + response.status + ')');
  }
  return data;
}
async function ensureProfileAndWorkspace(user) {
  const profiles = await api('user_profiles', { query: 'select=user_id,display_name&user_id=eq.' + encodeURIComponent(user.id) + '&limit=1' });
  if (!Array.isArray(profiles) || profiles.length === 0) {
    await api('user_profiles', { method: 'POST', body: {
      user_id: user.id, display_name: user.name || user.email || '', preferred_locale: 'id-ID'
    }});
  }
  const workspaces = await api('workspaces', { query: 'select=id,name,slug,status,owner_user_id,created_at&order=created_at.asc&limit=20' });
  if (Array.isArray(workspaces) && workspaces.length) {
    state.workspace = workspaces[0];
    const memberships = await api('workspace_memberships', { query: 'select=role,status&workspace_id=eq.' + state.workspace.id + '&user_id=eq.' + encodeURIComponent(user.id) + '&limit=1' });
    state.role = (memberships && memberships[0] && memberships[0].role) || (state.workspace.owner_user_id === user.id ? 'owner' : 'member');
    return;
  }
  const slug = 'workspace-' + slugify(user.id).replace(/-/g, '').slice(0, 10) + '-' + Math.random().toString(36).slice(2, 6);
  const result = await api('workspaces', { method: 'POST', body: {
    name: (user.name || 'My') + ' Affiliate Workspace', slug, owner_user_id: user.id
  }});
  const workspace = Array.isArray(result) ? result[0] : result;
  if (!workspace || !workspace.id) throw new Error('Workspace belum berhasil dibuat.');
  await api('workspace_memberships', { method: 'POST', body: {
    workspace_id: workspace.id, user_id: user.id, role: 'owner', status: 'active'
  }});
  state.workspace = workspace;
  state.role = 'owner';
}
function empty(container, text) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  $(container).append(p);
}
function record(container, title, lines, badge) {
  const item = document.createElement('article');
  item.className = 'record-card';
  const head = document.createElement('div');
  head.className = 'record-heading';
  const h = document.createElement('h3');
  h.textContent = String(title || '');
  head.append(h);
  if (badge) {
    const tag = document.createElement('span');
    tag.className = 'record-badge';
    tag.textContent = badge;
    head.append(tag);
  }
  item.append(head);
  (lines || []).filter(Boolean).forEach((line) => {
    const p = document.createElement('p');
    p.textContent = String(line);
    item.append(p);
  });
  $(container).append(item);
  return item;
}
function addDeleteAction(root, table, id, label) {
  const actions = document.createElement('div');
  actions.className = 'record-actions';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-small button-danger';
  button.textContent = label || 'Hapus';
  button.addEventListener('click', async () => {
    if (!window.confirm('Hapus data ini? Tindakan tidak dapat dibatalkan.')) return;
    try {
      await api(table, { method: 'DELETE', query: 'id=eq.' + encodeURIComponent(id) });
      await refreshAll();
      message('workspace-message', 'Data berhasil dihapus.', 'success');
    } catch (error) { message('workspace-message', error.message || 'Gagal menghapus data.', 'error'); }
  });
  actions.append(button);
  root.append(actions);
}
function addContentWorkflowActions(root, row) {
  const actions = document.createElement('div');
  actions.className = 'record-actions';
  async function setStatus(status, publishedAt) {
    await api('content_items', { method: 'PATCH', query: 'id=eq.' + encodeURIComponent(row.id), body: { status, published_at: publishedAt } });
    await refreshAll();
  }
  if (row.status === 'draft' || row.status === 'idea' || row.status === 'brief') {
    const review = document.createElement('button'); review.type = 'button'; review.className = 'button button-small'; review.textContent = 'Kirim review';
    review.addEventListener('click', async () => { try { await setStatus('review', null); } catch (e) { message('workspace-message', e.message, 'error'); } }); actions.append(review);
  }
  if ((state.role === 'owner' || state.role === 'admin') && row.status === 'review') {
    const approve = document.createElement('button'); approve.type = 'button'; approve.className = 'button button-small'; approve.textContent = 'Setujui';
    approve.addEventListener('click', async () => { try { await setStatus('approved', null); } catch (e) { message('workspace-message', e.message, 'error'); } }); actions.append(approve);
  }
  if ((state.role === 'owner' || state.role === 'admin') && row.status === 'approved') {
    const publish = document.createElement('button'); publish.type = 'button'; publish.className = 'button button-small'; publish.textContent = 'Publikasikan';
    publish.addEventListener('click', async () => { if (!window.confirm('Publikasikan konten ini ke status published? Pastikan isi dan disclosure sudah ditinjau.')) return; try { await setStatus('published', new Date().toISOString()); } catch (e) { message('workspace-message', e.message, 'error'); } }); actions.append(publish);
  }
  if (row.status === 'published' && (state.role === 'owner' || state.role === 'admin')) {
    const unpublish = document.createElement('button'); unpublish.type = 'button'; unpublish.className = 'button button-small button-danger'; unpublish.textContent = 'Tarik publikasi';
    unpublish.addEventListener('click', async () => { try { await setStatus('archived', null); } catch (e) { message('workspace-message', e.message, 'error'); } }); actions.append(unpublish);
  }
  if (actions.childElementCount) root.append(actions);
}
async function loadProducts() {
  const rows = await api('affiliate_products', { query: 'select=id,name,merchant_name,category,price_amount,currency,status,source_url,affiliate_url,public_slug,public_description,is_public,published_at&workspace_id=eq.' + state.workspace.id + '&order=created_at.desc&limit=100' });
  $('product-count').textContent = String(rows.length);
  $('products-list').replaceChildren();
  if (!rows.length) empty('products-list', 'Belum ada produk. Tambahkan produk pertama melalui formulir di atas.');
  rows.forEach((row) => {
    const price = row.price_amount == null ? 'Harga belum diverifikasi' : new Intl.NumberFormat('id-ID').format(Number(row.price_amount)) + ' ' + (row.currency || 'IDR');
    const publicState = row.is_public ? 'Public page: /products/' + row.public_slug + '/' : 'Private product record';
    const item = record('products-list', row.name, [row.merchant_name, row.category, price, row.source_url, publicState, row.public_description], row.status);
    if (['owner','admin','editor'].includes(state.role)) {
      const actions = document.createElement('div'); actions.className = 'record-actions';
      if (row.status !== 'active' && row.status !== 'archived') {
        const activate = document.createElement('button'); activate.type = 'button'; activate.className = 'button button-small'; activate.textContent = 'Aktifkan produk';
        activate.addEventListener('click', async () => { try { await api('affiliate_products', { method: 'PATCH', query: 'id=eq.' + encodeURIComponent(row.id), body: { status: 'active' } }); await refreshAll(); } catch (e) { message('workspace-message', e.message, 'error'); } });
        actions.append(activate);
      }
      if (row.is_public) {
        const unpublish = document.createElement('button'); unpublish.type = 'button'; unpublish.className = 'button button-small button-danger'; unpublish.textContent = 'Tarik halaman publik';
        unpublish.addEventListener('click', async () => { try { await api('affiliate_products', { method: 'PATCH', query: 'id=eq.' + encodeURIComponent(row.id), body: { is_public: false, published_at: null } }); await refreshAll(); message('workspace-message', 'Produk ditarik dari publikasi; static page akan diperbarui pada deployment berikutnya.', 'success'); } catch (e) { message('workspace-message', e.message, 'error'); } });
        actions.append(unpublish);
      } else if (row.status === 'active' && row.source_url && row.affiliate_url && String(row.public_description || '').trim().length >= 120) {
        const publish = document.createElement('button'); publish.type = 'button'; publish.className = 'button button-small'; publish.textContent = 'Publikasikan halaman produk';
        publish.addEventListener('click', async () => {
          if (!window.confirm('Publikasikan halaman produk? Periksa klaim, harga, hak gambar, dan disclosure terlebih dahulu.')) return;
          try {
            const slug = String(row.public_slug || slugify(row.name)).trim();
            await api('affiliate_products', { method: 'PATCH', query: 'id=eq.' + encodeURIComponent(row.id), body: { status: 'active', is_public: true, public_slug: slug, published_at: new Date().toISOString() } });
            await refreshAll(); message('workspace-message', 'Produk ditandai publik. Halaman statis akan dibuat oleh job publikasi berkala.', 'success');
          } catch (e) { message('workspace-message', e.message || 'Gagal mempublikasikan produk.', 'error'); }
        });
        actions.append(publish);
      }
      if (!row.is_public && (state.role === 'owner' || state.role === 'admin')) addDeleteAction(item, 'affiliate_products', row.id);
      if (actions.childElementCount) item.append(actions);
    }
  });
}
async function loadKeywords() {
  const rows = await api('seo_keywords', { query: 'select=id,keyword,cluster_name,search_intent,locale,search_volume,keyword_difficulty,metrics_source&workspace_id=eq.' + state.workspace.id + '&order=created_at.desc&limit=200' });
  $('keyword-count').textContent = String(rows.length);
  $('keywords-list').replaceChildren();
  if (!rows.length) empty('keywords-list', 'Belum ada keyword. Tambahkan frasa spesifik beserta search intent.');
  rows.forEach((row) => {
    const volume = row.search_volume == null ? 'Volume: not measured' : 'Volume: ' + row.search_volume;
    const difficulty = row.keyword_difficulty == null ? 'Difficulty: not measured' : 'Difficulty: ' + row.keyword_difficulty;
    const item = record('keywords-list', row.keyword, [row.cluster_name, row.search_intent + ' · ' + row.locale, volume + ' · ' + difficulty, row.metrics_source ? 'Source: ' + row.metrics_source : 'No volume source recorded'], row.search_intent);
    if (state.role === 'owner' || state.role === 'admin') addDeleteAction(item, 'seo_keywords', row.id);
  });
}
async function loadContent() {
  const rows = await api('content_items', { query: 'select=id,title,slug,content_type,status,meta_description&workspace_id=eq.' + state.workspace.id + '&order=updated_at.desc&limit=100' });
  $('content-count').textContent = String(rows.filter((row) => row.status !== 'published').length);
  $('content-list').replaceChildren();
  if (!rows.length) empty('content-list', 'Belum ada draft. Buat draft pertama melalui formulir di atas.');
  rows.forEach((row) => { const item = record('content-list', row.title, [row.slug, row.content_type, row.meta_description], row.status); addContentWorkflowActions(item, row); if (state.role === 'owner' || state.role === 'admin') addDeleteAction(item, 'content_items', row.id); });
}
async function loadCampaigns() {
  const rows = await api('campaigns', { query: 'select=id,name,channel,status,start_date,end_date,budget_amount,currency,created_at&workspace_id=eq.' + state.workspace.id + '&order=created_at.desc&limit=100' });
  $('campaign-count').textContent = String(rows.length);
  $('campaigns-list').replaceChildren();
  if (!rows.length) empty('campaigns-list', 'Belum ada kampanye. Buat kampanye pertama untuk mencatat tujuan, channel, jadwal, dan anggaran.');
  rows.forEach((row) => {
    const budget = row.budget_amount == null ? 'Budget not set' : new Intl.NumberFormat('id-ID').format(Number(row.budget_amount)) + ' ' + (row.currency || 'IDR');
    const item = record('campaigns-list', row.name, [row.channel, 'Start: ' + (row.start_date || 'not set'), 'End: ' + (row.end_date || 'not set'), budget], row.status);
    if ((state.role === 'owner' || state.role === 'admin') && row.status === 'draft') addDeleteAction(item, 'campaigns', row.id);
  });
}
async function loadContacts() {
  const rows = await api('crm_contacts', { query: 'select=id,name,email,phone,company,contact_type,source,status,created_at&workspace_id=eq.' + state.workspace.id + '&order=created_at.desc&limit=200' });
  $('crm-count').textContent = String(rows.length);
  $('crm-list').replaceChildren();
  if (!rows.length) empty('crm-list', 'Belum ada kontak CRM. Tambahkan lead, customer, partner, publisher, atau merchant.');
  rows.forEach((row) => {
    const item = record('crm-list', row.name, [row.company, row.email, row.phone, row.source], row.status);
    if ((state.role === 'owner' || state.role === 'admin' || state.role === 'crm_manager') && row.status !== 'archived') addDeleteAction(item, 'crm_contacts', row.id);
  });
}
async function loadExpenses() {
  const rows = await api('expenses', { query: 'select=id,vendor_name,description,category,amount,currency,status,incurred_on,created_at&workspace_id=eq.' + state.workspace.id + '&order=created_at.desc&limit=200' });
  $('expenses-list').replaceChildren();
  if (!rows.length) empty('expenses-list', 'Belum ada pengeluaran tercatat.');
  rows.forEach((row) => {
    const amount = new Intl.NumberFormat('id-ID').format(Number(row.amount)) + ' ' + (row.currency || 'IDR');
    const item = record('expenses-list', row.vendor_name, [row.description, row.category, amount, 'Date: ' + row.incurred_on], row.status);
    if ((state.role === 'owner' || state.role === 'admin' || state.role === 'finance_manager') && row.status === 'draft') addDeleteAction(item, 'expenses', row.id);
  });
}
async function loadEmployees() {
  const rows = await api('employees', { query: 'select=id,employee_code,full_name,email,department,employment_type,status,start_date&workspace_id=eq.' + state.workspace.id + '&order=created_at.desc&limit=200' });
  $('employees-list').replaceChildren();
  if (!rows.length) empty('employees-list', 'Belum ada data karyawan.');
  rows.forEach((row) => {
    const item = record('employees-list', row.full_name, [row.employee_code, row.email, row.department, row.employment_type, 'Start: ' + (row.start_date || 'not set')], row.status);
    if (state.role === 'owner' || state.role === 'admin') addDeleteAction(item, 'employees', row.id);
  });
}
async function loadInventory() {
  const rows = await api('inventory_items', { query: 'select=id,sku,name,unit,quantity_on_hand,reorder_level,unit_cost,status&workspace_id=eq.' + state.workspace.id + '&order=created_at.desc&limit=200' });
  $('inventory-count').textContent = String(rows.length);
  $('inventory-list').replaceChildren();
  if (!rows.length) empty('inventory-list', 'Belum ada item inventaris.');
  rows.forEach((row) => {
    const stock = Number(row.quantity_on_hand) + ' ' + row.unit + ' · reorder at ' + Number(row.reorder_level);
    const cost = row.unit_cost == null ? 'Cost not set' : new Intl.NumberFormat('id-ID').format(Number(row.unit_cost)) + ' IDR / unit';
    const item = record('inventory-list', row.name, [row.sku, stock, cost], row.status);
    if ((state.role === 'owner' || state.role === 'admin' || state.role === 'inventory_manager') && row.status === 'active') addDeleteAction(item, 'inventory_items', row.id);
  });
}
async function refreshAll() {
  try {
    await Promise.all([loadProducts(), loadKeywords(), loadContent(), loadCampaigns(), loadContacts(), loadExpenses(), loadEmployees(), loadInventory()]);
    message('workspace-message', 'Data berhasil dimuat dari Neon Data API.', 'success');
  } catch (error) { message('workspace-message', error.message || 'Gagal memuat data.', 'error'); }
}
async function enterWorkspace() {
  try {
    const result = await identity();
    if (!result.user) {
      $('auth-panel').hidden = false;
      $('dashboard-panel').hidden = true;
      message('auth-message', 'Masuk atau buat akun untuk melanjutkan.');
      return;
    }
    state.user = result.user;
    await ensureProfileAndWorkspace(result.user);
    $('auth-panel').hidden = true;
    $('dashboard-panel').hidden = false;
    $('welcome-title').textContent = state.workspace.name || 'Workspace affiliate';
    $('welcome-subtitle').textContent = (result.user.name || result.user.email || 'Pengguna') + ' · ' + (result.user.email || '') + ' · Role: ' + state.role;
    applyRoleAccess();
    await refreshAll();
  } catch (error) {
    $('auth-panel').hidden = false;
    $('dashboard-panel').hidden = true;
    message('auth-message', error.message || 'Sesi tidak dapat dipulihkan.', 'error');
  }
}
async function handleAuth(event, kind) {
  event.preventDefault();
  const form = event.currentTarget;
  busy(form, true);
  message('auth-message', kind === 'signup' ? 'Membuat akun…' : 'Memeriksa akun…');
  try {
    if (!auth) throw new Error('Konfigurasi Neon Auth belum tersedia.');
    const values = Object.fromEntries(new FormData(form).entries());
    const result = kind === 'signup'
      ? await auth.signUp.email({ name: String(values.name || '').trim(), email: String(values.email || '').trim(), password: String(values.password || '') })
      : await auth.signIn.email({ email: String(values.email || '').trim(), password: String(values.password || '') });
    if (result.error) throw new Error(result.error.message || 'Autentikasi gagal.');
    message('auth-message', 'Autentikasi berhasil. Menyiapkan workspace…', 'success');
    await enterWorkspace();
  } catch (error) { message('auth-message', error.message || 'Autentikasi gagal.', 'error'); }
  finally { busy(form, false); }
}
function bindForm(id, handler) {
  $(id).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    busy(form, true);
    try {
      await handler(new FormData(form));
      form.reset();
      await refreshAll();
    } catch (error) { message('workspace-message', error.message || 'Perubahan gagal disimpan.', 'error'); }
    finally { busy(form, false); }
  });
}
function httpUrl(value, label) {
  if (!value) return null;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(label + ' bukan URL yang valid.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(label + ' harus menggunakan HTTP atau HTTPS.');
  return parsed.href;
}
function requireWorkspace() {
  if (!state.workspace || !state.workspace.id || !state.user || !state.user.id) throw new Error('Workspace belum siap. Masuk kembali.');
}
function applyRoleAccess() {
  const allowed = {
    'product-form': ['owner','admin','editor'],
    'keyword-form': ['owner','admin','editor'],
    'content-form': ['owner','admin','editor'],
    'campaign-form': ['owner','admin','editor'],
    'crm-form': ['owner','admin','editor','crm_manager'],
    'expense-form': ['owner','admin','finance_manager'],
    'employee-form': ['owner','admin','hr_manager'],
    'inventory-form': ['owner','admin','editor','inventory_manager']
  };
  Object.entries(allowed).forEach(([formId, roles]) => {
    const form = $(formId);
    if (form) form.hidden = !roles.includes(state.role);
  });
  const saveSeo = $('save-seo-draft');
  if (saveSeo) saveSeo.hidden = !['owner','admin','editor'].includes(state.role);
  const moduleRoles = {
    expenses: ['owner','admin','finance_manager'],
    employees: ['owner','admin','hr_manager']
  };
  document.querySelectorAll('.module-tab[data-view]').forEach((tab) => {
    const roles = moduleRoles[tab.dataset.view];
    tab.hidden = Boolean(roles && !roles.includes(state.role));
  });
}

$('signin-tab').addEventListener('click', () => {
  $('signin-tab').classList.add('is-active'); $('signup-tab').classList.remove('is-active');
  $('signin-tab').setAttribute('aria-selected', 'true'); $('signup-tab').setAttribute('aria-selected', 'false');
  $('signin-form').hidden = false; $('signup-form').hidden = true; message('auth-message', '');
});
$('signup-tab').addEventListener('click', () => {
  $('signup-tab').classList.add('is-active'); $('signin-tab').classList.remove('is-active');
  $('signup-tab').setAttribute('aria-selected', 'true'); $('signin-tab').setAttribute('aria-selected', 'false');
  $('signup-form').hidden = false; $('signin-form').hidden = true; message('auth-message', '');
});
$('signin-form').addEventListener('submit', (event) => handleAuth(event, 'signin'));
$('signup-form').addEventListener('submit', (event) => handleAuth(event, 'signup'));
$('signout-button').addEventListener('click', async () => {
  try {
    if (auth) await auth.signOut();
    state.user = null; state.workspace = null;
    $('dashboard-panel').hidden = true; $('auth-panel').hidden = false;
    message('auth-message', 'Anda sudah keluar.', 'success');
  } catch (error) { message('workspace-message', error.message || 'Keluar gagal.', 'error'); }
});
document.querySelectorAll('.module-tab').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('.module-tab').forEach((item) => item.classList.toggle('is-active', item === button));
  document.querySelectorAll('.module-panel').forEach((panel) => { panel.hidden = panel.id !== 'view-' + button.dataset.view; });
}));
$('refresh-products').addEventListener('click', () => loadProducts().catch((e) => message('workspace-message', e.message, 'error')));
$('refresh-keywords').addEventListener('click', () => loadKeywords().catch((e) => message('workspace-message', e.message, 'error')));
$('refresh-content').addEventListener('click', () => loadContent().catch((e) => message('workspace-message', e.message, 'error')));
$('refresh-campaigns').addEventListener('click', () => loadCampaigns().catch((e) => message('workspace-message', e.message, 'error')));
$('refresh-crm').addEventListener('click', () => loadContacts().catch((e) => message('workspace-message', e.message, 'error')));
$('refresh-expenses').addEventListener('click', () => loadExpenses().catch((e) => message('workspace-message', e.message, 'error')));
$('refresh-employees').addEventListener('click', () => loadEmployees().catch((e) => message('workspace-message', e.message, 'error')));
$('refresh-inventory').addEventListener('click', () => loadInventory().catch((e) => message('workspace-message', e.message, 'error')));
$('print-button').addEventListener('click', () => window.print());

bindForm('product-form', async (values) => {
  requireWorkspace();
  const name = String(values.get('name') || '').trim();
  if (!name) throw new Error('Nama produk wajib diisi.');
  const rawPrice = String(values.get('price_amount') || '').trim();
  const price = rawPrice === '' ? null : Number(rawPrice);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Harga harus angka nol atau lebih.');
  await api('affiliate_products', { method: 'POST', body: {
    workspace_id: state.workspace.id, name,
    source_url: httpUrl(String(values.get('source_url') || '').trim(), 'URL sumber'),
    affiliate_url: httpUrl(String(values.get('affiliate_url') || '').trim(), 'URL affiliate'),
    merchant_name: String(values.get('merchant_name') || '').trim() || null,
    category: String(values.get('category') || '').trim() || null,
    price_amount: price, currency: 'IDR', status: 'research', created_by: state.user.id
  }});
  message('workspace-message', 'Produk tersimpan di Neon.', 'success');
});
bindForm('keyword-form', async (values) => {
  requireWorkspace();
  const keyword = String(values.get('keyword') || '').trim();
  if (!keyword) throw new Error('Keyword wajib diisi.');
  const rawVolume = String(values.get('search_volume') || '').trim();
  const volume = rawVolume === '' ? null : Number(rawVolume);
  if (volume !== null && (!Number.isInteger(volume) || volume < 0)) throw new Error('Search volume harus bilangan bulat nol atau lebih.');
  const locale = String(values.get('locale') || 'id-ID');
  await api('seo_keywords', { method: 'POST', body: {
    workspace_id: state.workspace.id, keyword,
    cluster_name: String(values.get('cluster_name') || '').trim() || null,
    search_intent: String(values.get('search_intent') || 'informational'),
    locale, country_code: locale === 'en-US' ? 'US' : 'ID',
    search_volume: volume, metrics_source: String(values.get('metrics_source') || '').trim() || null,
    created_by: state.user.id
  }});
  message('workspace-message', 'Keyword tersimpan. Metrik kosong tetap ditampilkan sebagai belum terukur.', 'success');
});
bindForm('content-form', async (values) => {
  requireWorkspace();
  const title = String(values.get('title') || '').trim();
  if (!title) throw new Error('Judul wajib diisi.');
  await api('content_items', { method: 'POST', body: {
    workspace_id: state.workspace.id, title, slug: slugify(title),
    content_type: String(values.get('content_type') || 'article'), status: 'draft',
    body: String(values.get('body') || ''),
    meta_title: String(values.get('meta_title') || '').trim() || null,
    meta_description: String(values.get('meta_description') || '').trim() || null,
    locale: 'id-ID', disclosure_required: true, author_user_id: state.user.id
  }});
  message('workspace-message', 'Draft tersimpan. Draft tidak dipublikasikan otomatis.', 'success');
});

bindForm('campaign-form', async (values) => {
  requireWorkspace();
  const name = String(values.get('name') || '').trim();
  if (!name) throw new Error('Nama kampanye wajib diisi.');
  const startDate = String(values.get('start_date') || '').trim() || null;
  const endDate = String(values.get('end_date') || '').trim() || null;
  if (startDate && endDate && endDate < startDate) throw new Error('Tanggal akhir tidak boleh sebelum tanggal mulai.');
  const rawBudget = String(values.get('budget_amount') || '').trim();
  const budget = rawBudget === '' ? null : Number(rawBudget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) throw new Error('Anggaran harus nol atau lebih.');
  await api('campaigns', { method: 'POST', body: {
    workspace_id: state.workspace.id, name, channel: String(values.get('channel') || 'other'),
    status: 'draft', start_date: startDate, end_date: endDate, budget_amount: budget,
    currency: 'IDR', notes: String(values.get('notes') || '').trim(), created_by: state.user.id
  }});
  message('workspace-message', 'Kampanye tersimpan sebagai draft.', 'success');
});
bindForm('crm-form', async (values) => {
  requireWorkspace();
  const name = String(values.get('name') || '').trim();
  if (!name) throw new Error('Nama kontak wajib diisi.');
  const email = String(values.get('email') || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Format email tidak valid.');
  await api('crm_contacts', { method: 'POST', body: {
    workspace_id: state.workspace.id, name, contact_type: String(values.get('contact_type') || 'lead'),
    email: email || null, phone: String(values.get('phone') || '').trim() || null,
    company: String(values.get('company') || '').trim() || null,
    source: String(values.get('source') || '').trim() || null,
    notes: String(values.get('notes') || '').trim(), status: 'new', created_by: state.user.id
  }});
  message('workspace-message', 'Kontak CRM tersimpan.', 'success');
});
bindForm('expense-form', async (values) => {
  requireWorkspace();
  const vendor = String(values.get('vendor_name') || '').trim();
  const description = String(values.get('description') || '').trim();
  const amount = Number(values.get('amount'));
  if (!vendor || !description) throw new Error('Vendor dan deskripsi wajib diisi.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Nominal pengeluaran harus lebih dari nol.');
  await api('expenses', { method: 'POST', body: {
    workspace_id: state.workspace.id, vendor_name: vendor, description,
    category: String(values.get('category') || 'other').trim() || 'other',
    amount, currency: 'IDR', incurred_on: String(values.get('incurred_on') || '').trim() || new Date().toISOString().slice(0, 10),
    status: 'draft', created_by: state.user.id
  }});
  message('workspace-message', 'Pengeluaran tersimpan sebagai draft; belum disetujui atau dibayar.', 'success');
});
bindForm('employee-form', async (values) => {
  requireWorkspace();
  const employeeCode = String(values.get('employee_code') || '').trim();
  const fullName = String(values.get('full_name') || '').trim();
  if (!employeeCode || !fullName) throw new Error('Kode karyawan dan nama lengkap wajib diisi.');
  const email = String(values.get('email') || '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Format email tidak valid.');
  await api('employees', { method: 'POST', body: {
    workspace_id: state.workspace.id, employee_code: employeeCode, full_name: fullName,
    email: email || null, department: String(values.get('department') || '').trim() || null,
    employment_type: String(values.get('employment_type') || 'full_time'),
    start_date: String(values.get('start_date') || '').trim() || null,
    status: 'active', created_by: state.user.id
  }});
  message('workspace-message', 'Data karyawan tersimpan. Akses dibatasi oleh role HR.', 'success');
});
bindForm('inventory-form', async (values) => {
  requireWorkspace();
  const sku = String(values.get('sku') || '').trim();
  const name = String(values.get('name') || '').trim();
  if (!sku || !name) throw new Error('SKU dan nama item wajib diisi.');
  const quantity = Number(values.get('quantity_on_hand') || 0);
  const reorder = Number(values.get('reorder_level') || 0);
  const rawCost = String(values.get('unit_cost') || '').trim();
  const cost = rawCost === '' ? null : Number(rawCost);
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(reorder) || reorder < 0) throw new Error('Jumlah stok dan reorder level tidak boleh negatif.');
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new Error('Harga pokok tidak boleh negatif.');
  await api('inventory_items', { method: 'POST', body: {
    workspace_id: state.workspace.id, sku, name,
    unit: String(values.get('unit') || 'unit').trim() || 'unit',
    quantity_on_hand: quantity, reorder_level: reorder, unit_cost: cost,
    status: 'active', created_by: state.user.id
  }});
  message('workspace-message', 'Item inventaris tersimpan.', 'success');
});


function renderSeoPlan(plan) {
  state.seoPlan = plan;
  $('seo-results').hidden = false;
  $('seo-intent').textContent = plan.searchIntent;
  $('seo-keyword-count').textContent = String(plan.keywordCount);
  $('seo-meta-length').textContent = String(plan.metaDescriptionCharacters);
  $('seo-meta-description').textContent = plan.metaDescription;
  $('seo-quality-note').textContent = '10 clusters · ' + plan.clusterCount + ' cluster groups · search volume and difficulty are not measured. Human review is required before publishing. Meta description range: ' + (plan.quality.metaDescriptionLengthValid ? 'PASS' : 'CHECK LENGTH') + '.';
  $('seo-title-list').replaceChildren();
  plan.titles.forEach((title) => {
    const li = document.createElement('li');
    li.textContent = title;
    $('seo-title-list').append(li);
  });
  const tbody = $('seo-table-body');
  tbody.replaceChildren();
  plan.rows.forEach((row) => {
    const tr = document.createElement('tr');
    [row.cluster,row.keyword,'Not measured','Not measured',row.searchIntent,row.title,row.metaDescription].forEach((value) => {
      const td = document.createElement('td'); td.textContent = String(value); tr.append(td);
    });
    tbody.append(tr);
  });
}
$('seo-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    const plan = generateSeoPlan({
      keyword: values.keyword, audience: values.audience, benefit: values.benefit,
      cta: values.cta, locale: values.locale, relatedKeywords: values.relatedKeywords
    });
    renderSeoPlan(plan);
    message('workspace-message', 'SEO agent pipeline selesai. Hasil adalah saran berbasis aturan, bukan data volume pencarian atau output LLM.', 'success');
  } catch (error) { message('workspace-message', error.message || 'SEO planner gagal.', 'error'); }
});
$('export-seo-csv').addEventListener('click', () => {
  if (!state.seoPlan) { message('workspace-message', 'Jalankan SEO planner terlebih dahulu.', 'error'); return; }
  const rows = [['keyword cluster','keyword','search volume','keyword difficulty','search intent','title','meta description']];
  state.seoPlan.rows.forEach((row) => rows.push([row.cluster,row.keyword,'Not measured','Not measured',row.searchIntent,row.title,row.metaDescription]));
  const csv = rows.map((row) => row.map((value) => '"' + String(value ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'seo-plan-' + slugify(state.seoPlan.keyword) + '.csv';
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
});
$('save-seo-draft').addEventListener('click', async () => {
  if (!state.seoPlan) { message('workspace-message', 'Jalankan SEO planner terlebih dahulu.', 'error'); return; }
  if (!['owner','admin','editor'].includes(state.role)) { message('workspace-message', 'Role ini tidak dapat menyimpan draft konten.', 'error'); return; }
  try {
    const plan = state.seoPlan;
    const body = [
      'SEO BRIEF — RULE-BASED DRAFT',
      'Target keyword: ' + plan.keyword,
      'Search intent: ' + plan.searchIntent,
      'Intent rationale: ' + plan.intentRationale,
      '',
      'Suggested outline:',
      ...plan.outline.map((heading, index) => (index + 1) + '. ' + heading),
      '',
      'Related keyword ideas (metrics not measured):',
      ...plan.rows.map((row) => '- [' + row.cluster + '] ' + row.keyword + ' — ' + row.searchIntent),
      '',
      'Quality gate: Search volume and keyword difficulty were not fabricated. Verify claims, source data, affiliate disclosure, and rights before publishing.'
    ].join('\n');
    const title = plan.titles[0];
    await api('content_items', { method: 'POST', body: {
      workspace_id: state.workspace.id, title, slug: slugify(title) + '-' + Date.now().toString().slice(-6),
      content_type: 'article', status: 'draft', body,
      meta_title: title, meta_description: plan.metaDescription,
      locale: plan.locale === 'en' ? 'en-US' : 'id-ID',
      disclosure_required: true, author_user_id: state.user.id
    }});
    message('workspace-message', 'SEO brief disimpan sebagai draft. Tidak dipublikasikan otomatis.', 'success');
    await loadContent();
  } catch (error) { message('workspace-message', error.message || 'Gagal menyimpan SEO brief.', 'error'); }
});

if (!AUTH_URL || !DATA_API_URL) {
  message('auth-message', 'Build belum dikonfigurasi dengan URL Neon Auth dan Data API. Login dinonaktifkan agar tidak mengarah ke database yang salah.', 'error');
} else {
  void enterWorkspace();
}
