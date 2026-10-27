import { createAuthClient } from '@neondatabase/auth';
import { generateSeoPlan } from './agents/seo-planner.js';
import { runAgentWorkflow } from './agents/orchestrator.js';
import { persistWorkflowRun } from './agents/persist-workflow-run.js';
import { initializeStudio } from './studio.js';
import { initializeCampaignPlanner } from './campaign-planner.js';

const AUTH_URL = import.meta.env.VITE_NEON_AUTH_URL;
const DATA_API_URL = import.meta.env.VITE_NEON_DATA_API_URL;
const auth = AUTH_URL ? createAuthClient(AUTH_URL) : null;
const $ = (id) => document.getElementById(id);
const state = { user: null, workspace: null, role: 'member', seoPlan: null, editingProductId: null, editingContentId: null, employees: [], ledgerAccounts: [], journalEntries: [], journalLines: [], payrollPeriods: [] };

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
async function saveWorkflowAudit(workflow, startedAt) {
  if (!state.user || !state.workspace) return { ok: false, error: 'Sesi dan workspace aktif diperlukan untuk menyimpan audit.' };
  try {
    await persistWorkflowRun({
      api, workspaceId: state.workspace.id, userId: state.user.id, workflow,
      startedAt, finishedAt: new Date().toISOString()
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Audit workflow tidak dapat disimpan.' };
  }
}
function slugify(value) {
  return String(value || '').normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80) || 'draft-' + Date.now();
}
async function readJwtResponse(response) {
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch { payload = null; }
  }
  const token = payload && (
    payload.token ||
    (payload.data && payload.data.token) ||
    (payload.session && payload.session.access_token) ||
    (payload.data && payload.data.session && payload.data.session.access_token)
  );
  if (!response.ok) {
    const detail = payload && (payload.message || payload.error || payload.code);
    throw new Error(detail || ('endpoint token mengembalikan HTTP ' + response.status));
  }
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    throw new Error('respons endpoint token tidak berisi JWT yang valid.');
  }
  return token;
}
async function getWorkspaceJwt(session) {
  // The SDK's token() result can be a cached session shape in some beta builds.
  // Reuse a session access token when present, then ask the Auth token endpoint.
  const accessToken = session && (session.access_token || session.accessToken);
  if (typeof accessToken === 'string' && accessToken.split('.').length === 3) return accessToken;

  let sdkError = null;
  try {
    const result = await auth.token();
    const data = result && result.data;
    const token = data && (
      data.token ||
      (data.session && data.session.access_token) ||
      data.access_token
    );
    if (!result.error && typeof token === 'string' && token.split('.').length === 3) return token;
    sdkError = (result && result.error && result.error.message) || 'SDK tidak mengembalikan token.';
  } catch (error) {
    sdkError = error && error.message ? error.message : 'Pemanggilan token SDK gagal.';
  }

  // Keep the browser-managed HttpOnly session cookie; never copy it to JS storage.
  // credentials: include is required for the cross-origin Neon Auth endpoint.
  try {
    const response = await fetch(AUTH_URL.replace(/\\/$/, '') + '/token', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    return await readJwtResponse(response);
  } catch (error) {
    const detail = error && error.message ? error.message : 'endpoint token tidak dapat diakses.';
    throw new Error('Neon Auth belum memberikan JWT. SDK: ' + sdkError + ' Endpoint: ' + detail + ' Pastikan sesi masih aktif dan origin GitHub Pages diizinkan oleh Neon Auth.');
  }
}
async function identity() {
  if (!auth) throw new Error('Konfigurasi Neon Auth belum tersedia.');
  const result = await auth.getSession();
  if (result.error) throw new Error(result.error.message || 'Sesi tidak dapat dibaca.');
  const data = result.data;
  const session = data && (data.session || data);
  const user = (data && data.user) || (session && session.user) || null;
  if (!user || !user.id) return { user: null, token: null };
  const token = await getWorkspaceJwt(session);
  return { user, token };
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
    if (String(row.body || '').trim().length >= 300 && !/^SEO BRIEF\s*[—-]/i.test(String(row.body || '').trim())) {
      const publish = document.createElement('button'); publish.type = 'button'; publish.className = 'button button-small'; publish.textContent = 'Publikasikan';
      publish.addEventListener('click', async () => { if (!window.confirm('Publikasikan konten ini ke status published? Pastikan isi, sumber, klaim, dan disclosure sudah ditinjau.')) return; try { await setStatus('published', new Date().toISOString()); } catch (e) { message('workspace-message', e.message, 'error'); } }); actions.append(publish);
    } else {
      actions.append(document.createTextNode('Lengkapi isi artikel minimal 300 karakter sebelum publikasi.'));
    }
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
      if (!row.is_public) {
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button button-small button-ghost'; edit.textContent = 'Edit produk';
        edit.addEventListener('click', () => {
          state.editingProductId = row.id;
          const form = $('product-form');
          ['name','source_url','affiliate_url','merchant_name','category','public_slug','public_description','price_amount'].forEach((key) => {
            const field = form.elements.namedItem(key); if (field) field.value = row[key] == null ? '' : row[key];
          });
          const submit = form.querySelector('button[type="submit"]'); submit.textContent = 'Simpan perubahan produk'; submit.dataset.label = 'Simpan perubahan produk';
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
          message('workspace-message', 'Mode edit produk aktif. Produk yang diedit tetap privat sampai dipublikasikan secara eksplisit.', 'success');
        });
        actions.append(edit);
      }
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
            const slug = slugify(row.public_slug || row.name);
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
  rows.forEach((row) => {
    const item = record('content-list', row.title, [row.slug, row.content_type, row.meta_description, 'Updated: ' + row.updated_at], row.status);
    addContentWorkflowActions(item, row);
    if (['owner','admin','editor'].includes(state.role) && row.status !== 'published') {
      const editActions = document.createElement('div'); editActions.className = 'record-actions';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'button button-small'; edit.textContent = 'Edit draft';
      edit.addEventListener('click', () => {
        state.editingContentId = row.id;
        const form = $('content-form');
        ['title','slug','content_type','meta_title','meta_description','body','locale'].forEach((key) => { const field = form.elements.namedItem(key); if (field) field.value = row[key] || ''; });
        const disclosure = form.elements.namedItem('disclosure_required'); if (disclosure) disclosure.checked = Boolean(row.disclosure_required);
        const submit = form.querySelector('button[type="submit"]'); submit.textContent = 'Simpan perubahan'; submit.dataset.label = 'Simpan perubahan';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        message('workspace-message', 'Mode edit aktif. Simpan akan mengembalikan status ke draft untuk review ulang.', 'success');
      });
      editActions.append(edit); item.append(editActions);
    }
    if ((state.role === 'owner' || state.role === 'admin') && row.status !== 'published') addDeleteAction(item, 'content_items', row.id);
  });
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
  state.employees = rows;
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
async function loadAccounting() {
  const [accounts, entries, lines] = await Promise.all([
    api('ledger_accounts', { query: 'select=id,account_code,account_name,account_type,normal_balance,is_active,created_at&workspace_id=eq.' + state.workspace.id + '&order=account_code.asc&limit=300' }),
    api('journal_entries', { query: 'select=id,entry_number,entry_date,description,status,created_at&workspace_id=eq.' + state.workspace.id + '&order=entry_date.desc&limit=300' }),
    api('journal_lines', { query: 'select=id,journal_entry_id,account_id,description,debit,credit&workspace_id=eq.' + state.workspace.id + '&limit=1000' })
  ]);
  state.ledgerAccounts = accounts || []; state.journalEntries = entries || []; state.journalLines = lines || [];
  $('ledger-list').replaceChildren();
  if (!state.ledgerAccounts.length) empty('ledger-list', 'Belum ada akun buku besar.');
  state.ledgerAccounts.forEach((account) => {
    const item = record('ledger-list', account.account_code + ' · ' + account.account_name, [account.account_type, 'Normal balance: ' + account.normal_balance], account.is_active ? 'active' : 'inactive');
    if (state.role === 'owner' || state.role === 'admin') addDeleteAction(item, 'ledger_accounts', account.id);
  });
  const accountSelect = $('journal-account-select'); accountSelect.replaceChildren();
  state.ledgerAccounts.filter((account) => account.is_active).forEach((account) => {
    const option = document.createElement('option'); option.value = account.id; option.textContent = account.account_code + ' · ' + account.account_name; accountSelect.append(option);
  });
  const entrySelect = $('journal-entry-select'); entrySelect.replaceChildren();
  state.journalEntries.filter((entry) => entry.status === 'draft').forEach((entry) => {
    const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.entry_number + ' · ' + entry.entry_date; entrySelect.append(option);
  });
  $('journal-list').replaceChildren();
  if (!state.journalEntries.length) empty('journal-list', 'Belum ada jurnal transaksi.');
  const accountNames = new Map(state.ledgerAccounts.map((account) => [account.id, account.account_code + ' · ' + account.account_name]));
  state.journalEntries.forEach((entry) => {
    const entryLines = state.journalLines.filter((line) => line.journal_entry_id === entry.id);
    const debit = entryLines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const credit = entryLines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    const balanced = debit > 0 && Math.abs(debit - credit) < 0.005;
    const details = entryLines.map((line) => (accountNames.get(line.account_id) || line.account_id) + ' · D ' + new Intl.NumberFormat('id-ID').format(Number(line.debit)) + ' / K ' + new Intl.NumberFormat('id-ID').format(Number(line.credit)) + (line.description ? ' · ' + line.description : ''));
    const item = record('journal-list', entry.entry_number + ' · ' + entry.description, [entry.entry_date, 'Debit: ' + new Intl.NumberFormat('id-ID').format(debit) + ' IDR', 'Credit: ' + new Intl.NumberFormat('id-ID').format(credit) + ' IDR', balanced ? 'Balanced' : 'Not balanced', ...details], entry.status);
    if (entry.status === 'draft' && balanced && ['owner','admin','finance_manager'].includes(state.role)) {
      const actions = document.createElement('div'); actions.className = 'record-actions';
      const review = document.createElement('button'); review.type = 'button'; review.className = 'button button-small'; review.textContent = 'Kirim review';
      review.addEventListener('click', async () => {
        if (!window.confirm('Kirim jurnal yang seimbang untuk review? Baris jurnal akan terkunci setelah dikirim.')) return;
        try { await api('journal_entries', { method: 'PATCH', query: 'id=eq.' + encodeURIComponent(entry.id), body: { status: 'review' } }); await refreshAll(); }
        catch (error) { message('workspace-message', error.message || 'Gagal mengirim jurnal untuk review.', 'error'); }
      });
      actions.append(review); item.append(actions);
    }
    if (entry.status === 'draft' && ['owner','admin','finance_manager'].includes(state.role)) addDeleteAction(item, 'journal_entries', entry.id);
  });
}
async function loadPayroll() {
  const periods = await api('payroll_periods', { query: 'select=id,period_start,period_end,status,created_at&workspace_id=eq.' + state.workspace.id + '&order=period_start.desc&limit=200' });
  state.payrollPeriods = periods || [];
  const periodSelect = $('payroll-period-select'); periodSelect.replaceChildren();
  state.payrollPeriods.filter((period) => period.status === 'draft').forEach((period) => {
    const option = document.createElement('option'); option.value = period.id; option.textContent = period.period_start + ' → ' + period.period_end; periodSelect.append(option);
  });
  const employeeSelect = $('payroll-employee-select'); employeeSelect.replaceChildren();
  state.employees.filter((employee) => employee.status === 'active').forEach((employee) => {
    const option = document.createElement('option'); option.value = employee.id; option.textContent = employee.employee_code + ' · ' + employee.full_name; employeeSelect.append(option);
  });
  const items = await api('payroll_items', { query: 'select=id,payroll_period_id,employee_id,base_salary,allowances,deductions,tax_amount,net_pay,notes&workspace_id=eq.' + state.workspace.id + '&limit=1000' });
  $('payroll-period-list').replaceChildren();
  if (!state.payrollPeriods.length) empty('payroll-period-list', 'Belum ada periode payroll.');
  state.payrollPeriods.forEach((period) => {
    const periodItems = (items || []).filter((item) => item.payroll_period_id === period.id);
    const item = record('payroll-period-list', period.period_start + ' → ' + period.period_end, ['Payroll items: ' + periodItems.length, 'Status: ' + period.status], period.status);
    if (period.status === 'draft' && periodItems.length > 0 && ['owner','admin','hr_manager'].includes(state.role)) {
      const actions = document.createElement('div'); actions.className = 'record-actions';
      const review = document.createElement('button'); review.type = 'button'; review.className = 'button button-small'; review.textContent = 'Kirim review';
      review.addEventListener('click', async () => {
        if (!window.confirm('Kirim periode payroll untuk review? Item payroll akan terkunci.')) return;
        try { await api('payroll_periods', { method: 'PATCH', query: 'id=eq.' + encodeURIComponent(period.id), body: { status: 'review' } }); await refreshAll(); }
        catch (error) { message('workspace-message', error.message || 'Gagal mengirim payroll untuk review.', 'error'); }
      });
      actions.append(review); item.append(actions);
    }
    if (period.status === 'draft' && ['owner','admin','hr_manager'].includes(state.role)) addDeleteAction(item, 'payroll_periods', period.id);
  });
  $('payroll-items-list').replaceChildren();
  if (!items || !items.length) empty('payroll-items-list', 'Belum ada item payroll.');
  const employeeNames = new Map(state.employees.map((employee) => [employee.id, employee.full_name]));
  const periodNames = new Map(state.payrollPeriods.map((period) => [period.id, period.period_start + ' → ' + period.period_end]));
  (items || []).forEach((payroll) => {
    const period = state.payrollPeriods.find((entry) => entry.id === payroll.payroll_period_id);
    const fmt = (n) => new Intl.NumberFormat('id-ID').format(Number(n || 0)) + ' IDR';
    const item = record('payroll-items-list', employeeNames.get(payroll.employee_id) || payroll.employee_id, [
      'Period: ' + (periodNames.get(payroll.payroll_period_id) || payroll.payroll_period_id),
      'Base: ' + fmt(payroll.base_salary) + ' · Allowances: ' + fmt(payroll.allowances),
      'Deductions: ' + fmt(payroll.deductions) + ' · Tax: ' + fmt(payroll.tax_amount),
      'Net pay: ' + fmt(payroll.net_pay), payroll.notes
    ], period ? period.status : 'unknown');
    if (period && period.status === 'draft' && ['owner','admin','hr_manager'].includes(state.role)) addDeleteAction(item, 'payroll_items', payroll.id);
  });
}
async function refreshAll() {
  try {
    await Promise.all([loadProducts(), loadKeywords(), loadContent(), loadCampaigns(), loadContacts(), loadExpenses(), loadEmployees(), loadInventory()]);
    await Promise.all([loadAccounting(), loadPayroll()]);
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
    'inventory-form': ['owner','admin','editor','inventory_manager'],
    'ledger-form': ['owner','admin','finance_manager'],
    'journal-form': ['owner','admin','finance_manager'],
    'journal-line-form': ['owner','admin','finance_manager'],
    'payroll-period-form': ['owner','admin','hr_manager'],
    'payroll-item-form': ['owner','admin','hr_manager']
  };
  Object.entries(allowed).forEach(([formId, roles]) => {
    const form = $(formId);
    if (form) form.hidden = !roles.includes(state.role);
  });
  const saveSeo = $('save-seo-draft');
  if (saveSeo) saveSeo.hidden = !['owner','admin','editor'].includes(state.role);
  const moduleRoles = {
    expenses: ['owner','admin','finance_manager'],
    employees: ['owner','admin','hr_manager'],
    payroll: ['owner','admin','hr_manager'],
    accounting: ['owner','admin','finance_manager']
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
$('refresh-accounting').addEventListener('click', () => loadAccounting().catch((e) => message('workspace-message', e.message, 'error')));
$('refresh-payroll').addEventListener('click', () => refreshAll());
$('print-button').addEventListener('click', () => window.print());

bindForm('product-form', async (values) => {
  requireWorkspace();
  const name = String(values.get('name') || '').trim();
  if (!name) throw new Error('Nama produk wajib diisi.');
  const rawPrice = String(values.get('price_amount') || '').trim();
  const price = rawPrice === '' ? null : Number(rawPrice);
  if (price !== null && (!Number.isFinite(price) || price < 0)) throw new Error('Harga harus angka nol atau lebih.');
  const payload = {
    workspace_id: state.workspace.id, name,
    source_url: httpUrl(String(values.get('source_url') || '').trim(), 'URL sumber'),
    affiliate_url: httpUrl(String(values.get('affiliate_url') || '').trim(), 'URL affiliate'),
    merchant_name: String(values.get('merchant_name') || '').trim() || null,
    category: String(values.get('category') || '').trim() || null,
    public_slug: String(values.get('public_slug') || '').trim() || null,
    public_description: String(values.get('public_description') || '').trim() || null,
    price_amount: price, currency: 'IDR', created_by: state.user.id
  };
  if (state.editingProductId) {
    await api('affiliate_products', { method: 'PATCH', query: 'id=eq.' + encodeURIComponent(state.editingProductId), body: {
      name: payload.name, source_url: payload.source_url, affiliate_url: payload.affiliate_url,
      merchant_name: payload.merchant_name, category: payload.category, public_slug: payload.public_slug,
      public_description: payload.public_description, price_amount: payload.price_amount, currency: payload.currency
    }});
    state.editingProductId = null;
    const submit = $('product-form').querySelector('button[type="submit"]'); submit.dataset.label = 'Simpan produk';
    message('workspace-message', 'Perubahan produk tersimpan.', 'success');
  } else {
    payload.status = 'research'; payload.is_public = false; payload.published_at = null;
    await api('affiliate_products', { method: 'POST', body: payload });
    message('workspace-message', 'Produk tersimpan di Neon.', 'success');
  }
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


bindForm('ledger-form', async (values) => {
  requireWorkspace();
  const code = String(values.get('account_code') || '').trim();
  const name = String(values.get('account_name') || '').trim();
  if (!code || !name) throw new Error('Kode dan nama akun wajib diisi.');
  await api('ledger_accounts', { method: 'POST', body: {
    workspace_id: state.workspace.id, account_code: code, account_name: name,
    account_type: String(values.get('account_type') || 'asset'),
    normal_balance: String(values.get('normal_balance') || 'debit'), is_active: true,
    created_by: state.user.id
  }});
  message('workspace-message', 'Akun buku besar tersimpan.', 'success');
});
bindForm('journal-form', async (values) => {
  requireWorkspace();
  const number = String(values.get('entry_number') || '').trim();
  const description = String(values.get('description') || '').trim();
  const date = String(values.get('entry_date') || '').trim() || new Date().toISOString().slice(0, 10);
  if (!number || !description) throw new Error('Nomor jurnal dan deskripsi wajib diisi.');
  await api('journal_entries', { method: 'POST', body: {
    workspace_id: state.workspace.id, entry_number: number, entry_date: date,
    description, status: 'draft', created_by: state.user.id
  }});
  message('workspace-message', 'Jurnal dibuat sebagai draft. Tambahkan baris debit dan kredit sebelum review.', 'success');
});
bindForm('journal-line-form', async (values) => {
  requireWorkspace();
  const entryId = String(values.get('journal_entry_id') || '').trim();
  const accountId = String(values.get('account_id') || '').trim();
  const debit = Number(values.get('debit') || 0);
  const credit = Number(values.get('credit') || 0);
  if (!entryId || !accountId) throw new Error('Pilih jurnal draft dan akun.');
  if (!Number.isFinite(debit) || !Number.isFinite(credit) || debit < 0 || credit < 0 || !((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) throw new Error('Isi hanya satu sisi: debit atau kredit, dengan nilai lebih dari nol.');
  await api('journal_lines', { method: 'POST', body: {
    workspace_id: state.workspace.id, journal_entry_id: entryId, account_id: accountId,
    description: String(values.get('description') || '').trim(), debit, credit
  }});
  message('workspace-message', 'Baris jurnal ditambahkan. Total akan dihitung ulang.', 'success');
});
bindForm('payroll-period-form', async (values) => {
  requireWorkspace();
  const start = String(values.get('period_start') || '').trim();
  const end = String(values.get('period_end') || '').trim();
  if (!start || !end || end < start) throw new Error('Tanggal periode payroll tidak valid.');
  await api('payroll_periods', { method: 'POST', body: {
    workspace_id: state.workspace.id, period_start: start, period_end: end,
    status: 'draft', created_by: state.user.id
  }});
  message('workspace-message', 'Periode payroll dibuat sebagai draft.', 'success');
});
bindForm('payroll-item-form', async (values) => {
  requireWorkspace();
  const periodId = String(values.get('payroll_period_id') || '').trim();
  const employeeId = String(values.get('employee_id') || '').trim();
  if (!periodId || !employeeId) throw new Error('Pilih periode payroll dan karyawan aktif.');
  const base = Number(values.get('base_salary') || 0);
  const allowances = Number(values.get('allowances') || 0);
  const deductions = Number(values.get('deductions') || 0);
  const tax = Number(values.get('tax_amount') || 0);
  if ([base,allowances,deductions,tax].some((n) => !Number.isFinite(n) || n < 0)) throw new Error('Komponen payroll harus berupa angka nol atau lebih.');
  if (base + allowances < deductions + tax) throw new Error('Net pay tidak boleh negatif.');
  await api('payroll_items', { method: 'POST', body: {
    workspace_id: state.workspace.id, payroll_period_id: periodId, employee_id: employeeId,
    base_salary: base, allowances, deductions, tax_amount: tax,
    notes: String(values.get('notes') || '').trim()
  }});
  message('workspace-message', 'Item payroll tersimpan. Net pay dihitung oleh database.', 'success');
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
$('seo-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  busy(form, true);
  const workflowStartedAt = new Date().toISOString();
  try {
    const values = Object.fromEntries(new FormData(form).entries());
    const workflow = await runAgentWorkflow({
      workflowId: 'seo-content-planning',
      input: values,
      allowedCapabilities: ['local-seo', 'quality-review'],
      agents: [
        {
          id: 'seo-planner',
          capabilities: ['local-seo'],
          run: ({ input }) => generateSeoPlan({
            keyword: input.keyword, audience: input.audience, benefit: input.benefit,
            cta: input.cta, locale: input.locale, relatedKeywords: input.relatedKeywords
          })
        },
        {
          id: 'seo-quality-review',
          dependsOn: ['seo-planner'],
          capabilities: ['quality-review'],
          run: ({ dependencies }) => {
            const plan = dependencies['seo-planner'];
            const uniqueKeywords = new Set(plan.rows.map((row) => row.keyword.toLocaleLowerCase()));
            const validMetadata = plan.rows.every((row) => row.metaDescription.length >= 120 && row.metaDescription.length <= 155);
            if (plan.rows.length !== 70 || uniqueKeywords.size !== plan.rows.length || !validMetadata) {
              throw Object.assign(new Error('SEO quality gate rejected incomplete or duplicate output.'), { code: 'SEO_QUALITY_GATE_FAILED' });
            }
            if (plan.rows.some((row) => row.searchVolume !== null || row.keywordDifficulty !== null)) {
              throw Object.assign(new Error('SEO metrics must remain unmeasured without verified data.'), { code: 'UNVERIFIED_SEO_METRICS' });
            }
            return { reviewedRows: plan.rows.length, uniqueKeywords: uniqueKeywords.size, metadataValid: true, metricsFabricated: false };
          }
        }
      ]
    });
    if (workflow.status !== 'completed') {
      const audit = await saveWorkflowAudit(workflow, workflowStartedAt);
      const failed = Object.values(workflow.results).find((result) => result.status === 'failed');
      throw new Error((failed?.errorCode || 'Multi-agent SEO workflow did not complete.') + (audit.ok ? ' Audit tercatat.' : ' Audit belum tersimpan: ' + audit.error));
    }
    const audit = await saveWorkflowAudit(workflow, workflowStartedAt);
    const plan = workflow.results['seo-planner'].output;
    renderSeoPlan(plan);
    const review = workflow.results['seo-quality-review'].output;
    message('workspace-message', 'Multi-agent SEO selesai: planner + quality reviewer memeriksa ' + review.reviewedRows + ' keyword. Volume dan difficulty tetap Not measured; tinjauan manusia wajib. ' + (audit.ok ? 'Audit tersimpan di Neon sebagai needs_review.' : 'PERINGATAN: audit belum tersimpan di Neon — ' + audit.error), audit.ok ? 'success' : 'error');
  } catch (error) { message('workspace-message', error.message || 'SEO planner gagal.', 'error'); }
  finally { busy(form, false); }
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

if ($('campaign-planner-form')) {
  initializeCampaignPlanner({
    message,
    api,
    getContext: () => ({ user: state.user, workspace: state.workspace, role: state.role })
  });
}
if ($('studio-canvas')) {
  initializeStudio({
    getContext: () => ({ user: state.user, workspace: state.workspace, role: state.role }),
    api,
    slugify,
    message
  });
}

if (!AUTH_URL || !DATA_API_URL) {
  message('auth-message', 'Build belum dikonfigurasi dengan URL Neon Auth dan Data API. Login dinonaktifkan agar tidak mengarah ke database yang salah.', 'error');
} else {
  void enterWorkspace();
}
