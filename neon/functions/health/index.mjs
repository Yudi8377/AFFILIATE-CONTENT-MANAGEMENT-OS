export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (url.pathname === '/health' || url.pathname === '/') {
      return Response.json({
        ok: true,
        service: 'affiliate-content-management-os-api',
        status: 'healthy',
        mode: 'health-check-only',
        timestamp: new Date().toISOString()
      }, { headers: corsHeaders(request) });
    }
    return Response.json({ error: 'not_found' }, { status: 404, headers: corsHeaders(request) });
  }
};

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'https://yudi8377.github.io']);
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  });
  if (allowed.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}
