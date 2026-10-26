import { randomBytes } from 'node:crypto';

const authBase = process.env.VITE_NEON_AUTH_URL;
const dataBase = process.env.VITE_NEON_DATA_API_URL;
if (!authBase || !dataBase) throw new Error('Neon smoke-test URLs are required');

async function authRequest(path, options, cookieJar) {
  const opts = options || {};
  const headers = new Headers({ Accept: 'application/json', Origin: 'https://yudi8377.github.io' });
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (cookieJar && cookieJar.size) headers.set('Cookie', Array.from(cookieJar.entries()).map(([k, v]) => k + '=' + v).join('; '));
  const response = await fetch(authBase + '/' + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    redirect: 'manual'
  });
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  for (const line of setCookies) {
    const pair = line.split(';', 1)[0];
    const index = pair.indexOf('=');
    if (index > 0) cookieJar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  const raw = await response.text();
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 300) }; } }
  if (!response.ok) throw new Error('Neon Auth ' + path + ' returned ' + response.status + ': ' + JSON.stringify(data));
  return { data, status: response.status };
}
async function createIdentity(label) {
  const cookieJar = new Map();
  const unique = String(process.env.GITHUB_RUN_ID || 'local') + '-' + String(process.env.GITHUB_RUN_ATTEMPT || '1') + '-' + Date.now() + '-' + randomBytes(3).toString('hex');
  const email = 'acmos-' + label + '-' + unique + '@example.com';
  const password = randomBytes(24).toString('base64url') + 'Aa1!';
  await authRequest('sign-up/email', { method: 'POST', body: { name: 'ACMOS CI ' + label, email, password } }, cookieJar);
  const sessionResult = await authRequest('get-session', {}, cookieJar);
  const sessionData = sessionResult.data;
  const user = (sessionData && sessionData.user) || (sessionData && sessionData.session && sessionData.session.user);
  if (!user || !user.id) throw new Error('Neon Auth sign-up did not restore a user session.');
  const tokenResult = await authRequest('token', {}, cookieJar);
  const token = tokenResult.data && tokenResult.data.token;
  if (!token) throw new Error('Neon Auth token endpoint did not return a Data API JWT.');
  return { user, token };
}
async function dataRequest(table, token, options) {
  const opts = options || {};
  const headers = new Headers({ Accept: 'application/json', Origin: 'https://yudi8377.github.io' });
  if (token) headers.set('Authorization', 'Bearer ' + token);
  if (opts.body !== undefined) headers.set('Content-Type', 'application/json');
  if (opts.method && opts.method !== 'GET') headers.set('Prefer', 'return=representation');
  const response = await fetch(dataBase + '/' + table + (opts.query ? '?' + opts.query : ''), {
    method: opts.method || 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: 'no-store'
  });
  const raw = await response.text();
  let data = null;
  if (raw) { try { data = JSON.parse(raw); } catch { data = { message: raw.slice(0, 300) }; } }
  return { ok: response.ok, status: response.status, data };
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function main() {
  const owner = await createIdentity('owner');
  const profile = await dataRequest('user_profiles', owner.token, {
    method: 'POST',
    body: { user_id: owner.user.id, display_name: owner.user.name || owner.user.email, preferred_locale: 'id-ID' }
  });
  assert(profile.ok, 'Profile insert failed: ' + JSON.stringify(profile));
  const workspaceResult = await dataRequest('workspaces', owner.token, {
    method: 'POST',
    body: { name: 'CI Smoke Workspace', slug: 'ci-smoke-' + randomBytes(5).toString('hex'), owner_user_id: owner.user.id }
  });
  assert(workspaceResult.ok && Array.isArray(workspaceResult.data) && workspaceResult.data[0]?.id, 'Workspace insert failed: ' + JSON.stringify(workspaceResult));
  const workspaceId = workspaceResult.data[0].id;
  const membership = await dataRequest('workspace_memberships', owner.token, {
    method: 'POST',
    body: { workspace_id: workspaceId, user_id: owner.user.id, role: 'owner', status: 'active' }
  });
  assert(membership.ok, 'Owner membership insert failed: ' + JSON.stringify(membership));
  const product = await dataRequest('affiliate_products', owner.token, {
    method: 'POST',
    body: { workspace_id: workspaceId, name: 'CI test product', status: 'research', created_by: owner.user.id, currency: 'IDR', facts: {} }
  });
  assert(product.ok, 'Product insert failed: ' + JSON.stringify(product));
  const ownerRead = await dataRequest('affiliate_products', owner.token, { query: 'select=id,name&workspace_id=eq.' + workspaceId });
  assert(ownerRead.ok && Array.isArray(ownerRead.data) && ownerRead.data.length === 1, 'Workspace owner could not read own product: ' + JSON.stringify(ownerRead));

  const other = await createIdentity('other');
  const otherRead = await dataRequest('affiliate_products', other.token, { query: 'select=id,name' });
  assert(otherRead.ok && Array.isArray(otherRead.data) && otherRead.data.length === 0, 'RLS isolation failed: another user can see workspace products.');
  const anonymousRead = await dataRequest('affiliate_products', null, { query: 'select=id,name' });
  assert(!anonymousRead.ok || (Array.isArray(anonymousRead.data) && anonymousRead.data.length === 0), 'Anonymous request can read private products.');
  console.log('Neon Auth/Data API smoke test passed: sign-up, JWT, profile/workspace/membership/product writes, owner read, cross-user isolation, anonymous denial.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
