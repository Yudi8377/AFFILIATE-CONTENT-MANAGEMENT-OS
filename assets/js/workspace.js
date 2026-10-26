import { createAuthClient } from '@neondatabase/auth';

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL;
const DATA_API_URL = import.meta.env.VITE_NEON_DATA_API_URL;
const auth = AUTH_URL ? createAuthClient(AUTH_URL) : null;
const $ = (id) => document.getElementById(id);
const state = { user: null, workspace: null, role: 'member' };

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
  const rows = await api('affiliate_products', { query: 'select=id,name,merchant_name,category,price_amount,currency,status,source_url&workspace_id=eq.' + state.workspace.id + '&order=created_at.desc&limit=100' });
  $('product-count').textContent = String(rows.length);
  $('products-list').replaceChildren();
  if (!rows.length) empty('products-list', 'Belum ada produk. Tambahkan produk pertama melalui formulir di atas.');
  rows.forEach((row) => {
    const price = row.price_amount == null ? 'Harga belum diverifikasi' : new Intl.NumberFormat('id-ID').format(Number(row.price_amount)) + ' ' + (row.currency || 'IDR');
    const item = record('products-list', row.name, [row.merchant_name, row.category, price, row.source_url], row.status);
    if (state.role === 'owner' || state.role === 'admin') addDeleteAction(item, 'affiliate_products', row.id);
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
async function refreshAll() {
  try {
    await Promise.all([loadProducts(), loadKeywords(), loadContent()]);
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
    $('welcome-subtitle').textContent = (result.user.name || result.user.email || 'Pengguna') + ' · ' + (result.user.email || '');
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

if (!AUTH_URL || !DATA_API_URL) {
  message('auth-message', 'Build belum dikonfigurasi dengan URL Neon Auth dan Data API. Login dinonaktifkan agar tidak mengarah ke database yang salah.', 'error');
} else {
  void enterWorkspace();
}
