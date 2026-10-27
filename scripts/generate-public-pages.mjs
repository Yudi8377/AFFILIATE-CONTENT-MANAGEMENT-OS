import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const apiBase = process.env.VITE_NEON_DATA_API_URL;
const siteBase = (process.env.SITE_BASE_URL || 'https://yudi8377.github.io/AFFILIATE-CONTENT-MANAGEMENT-OS/').replace(/\/?$/, '/');
const outputDir = process.env.PUBLIC_OUTPUT_DIR || 'dist';
if (!apiBase) throw new Error('VITE_NEON_DATA_API_URL is required to build public CMS pages.');

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function slug(value) {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}
function meta(value, fallback) {
  const text = String(value || fallback || '').replace(/\s+/g, ' ').trim();
  return text.length > 155 ? text.slice(0, 152).replace(/\s+\S*$/, '') + '...' : text;
}
function validUrl(value) {
  try { const u = new URL(String(value)); return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null; } catch { return null; }
}
function renderTextBody(body) {
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  const output = [];
  let list = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { if (list) { output.push('</ul>'); list = false; } continue; }
    if (/^SEO BRIEF\s*[—-]/i.test(line)) continue;
    const heading = line.match(/^#{1,3}\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (heading) {
      if (list) { output.push('</ul>'); list = false; }
      output.push('<h2>' + esc(heading[1]) + '</h2>');
    } else if (/^[-*]\s+/.test(line)) {
      if (!list) { output.push('<ul>'); list = true; }
      output.push('<li>' + esc(line.replace(/^[-*]\s+/, '')) + '</li>');
    } else {
      if (list) { output.push('</ul>'); list = false; }
      output.push('<p>' + esc(line) + '</p>');
    }
  }
  if (list) output.push('</ul>');
  return output.join('\n');
}
function shell({ title, description, canonical, body, jsonLd, kind }) {
  return '<!doctype html>\n<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="index,follow,max-image-preview:large">' +
    '<title>' + esc(title) + '</title><meta name="description" content="' + esc(description) + '">' +
    '<link rel="canonical" href="' + esc(canonical) + '">' +
    '<meta property="og:type" content="' + (kind === 'product' ? 'product' : 'article') + '">' +
    '<meta property="og:title" content="' + esc(title) + '"><meta property="og:description" content="' + esc(description) + '">' +
    '<meta property="og:url" content="' + esc(canonical) + '">' +
    '<meta name="twitter:card" content="summary"><meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:description" content="' + esc(description) + '">' +
    '<script type="application/ld+json">' + JSON.stringify(jsonLd).replace(/</g, '\\u003c') + '</script>' +
    '<style>body{margin:0;background:#f5f7fa;color:#182434;font:16px/1.75 system-ui,-apple-system,Segoe UI,sans-serif}header,main,footer{width:min(860px,calc(100% - 36px));margin:auto}header{padding:22px 0;border-bottom:1px solid #dbe2ea}header a,footer a{color:#145a72;text-decoration:none;font-weight:700}main{padding:38px 0 72px}h1{font-size:clamp(30px,5vw,48px);line-height:1.15;letter-spacing:-.04em}h2{margin-top:32px;font-size:24px;line-height:1.3}p,li{color:#344256} .disclosure{background:#fff7e6;border:1px solid #eed9a6;padding:13px 16px;border-radius:8px;font-size:13px} .cta{display:inline-block;background:#145a72;color:#fff;padding:12px 17px;border-radius:7px;text-decoration:none;font-weight:700}footer{padding:22px 0 40px;border-top:1px solid #dbe2ea;font-size:12px;color:#637185}</style>' +
    '</head><body><header><a href="' + esc(siteBase) + '">Affiliate Content OS</a></header><main><article><h1>' + esc(title) + '</h1><p class="muted">Updated ' + new Date().toISOString().slice(0, 10) + '</p>' + body + '</article></main><footer><a href="' + esc(siteBase) + '">Home</a> · <a href="' + esc(siteBase) + 'privacy.html">Privacy</a></footer></body></html>';
}
async function getRows(table, query) {
  const headers = { Accept: 'application/json' };
  // Neon Data API requires a JWT. A dedicated read-only token may be supplied
  // by CI, but never put a token into the public browser bundle.
  if (process.env.NEON_PUBLIC_READ_TOKEN) headers.Authorization = 'Bearer ' + process.env.NEON_PUBLIC_READ_TOKEN;
  const response = await fetch(apiBase + '/' + table + '?' + query, { headers, cache: 'no-store' });
  const raw = await response.text();
  if (!response.ok) {
    const detail = raw.slice(0, 250);
    // Keep the static site build deterministic when no read-only publishing
    // credential is configured. Do not hide permission or schema failures.
    if (response.status === 400 && /missing authentication credentials/i.test(detail) && !process.env.NEON_PUBLIC_READ_TOKEN) {
      console.warn('Public CMS read skipped for ' + table + ': no read-only Neon Data API JWT configured; publishing output contains no records from this table.');
      return [];
    }
    throw new Error('Public CMS read failed for ' + table + ': HTTP ' + response.status + ' ' + detail);
  }
  const data = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(data)) throw new Error('Unexpected public CMS response for ' + table);
  return data;
}
async function writePage(relativePath, html) {
  const path = join(outputDir, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, html, 'utf8');
}
async function main() {
  const [articles, products] = await Promise.all([
    getRows('content_items', 'select=id,title,slug,meta_title,meta_description,body,locale,published_at,updated_at,content_type,disclosure_required&status=eq.published&published_at=not.is.null&order=published_at.desc&limit=500'),
    getRows('affiliate_products', 'select=id,name,merchant_name,category,source_url,affiliate_url,price_amount,currency,public_slug,public_description,published_at&is_public=eq.true&status=eq.active&public_slug=not.is.null&order=published_at.desc&limit=500')
  ]);
  const sitemap = new Set([siteBase, siteBase + 'privacy.html', siteBase + 'disclosure.html', siteBase + 'product-intelligence.html', siteBase + 'seo-content.html', siteBase + 'content-studio.html', siteBase + 'campaign-operations.html', siteBase + 'cost-governance.html']);
  let generatedArticles = 0, skippedArticles = 0, generatedProducts = 0, skippedProducts = 0;
  const articleLinks = [], productLinks = [];
  for (const article of articles) {
    const articleSlug = slug(article.slug || article.title);
    const bodyText = String(article.body || '').trim();
    if (!articleSlug || bodyText.length < 300 || /^SEO BRIEF\s*[—-]/i.test(bodyText)) { skippedArticles++; continue; }
    const title = String(article.meta_title || article.title || '').trim().slice(0, 70);
    const description = meta(article.meta_description, bodyText.slice(0, 150));
    const canonical = siteBase + 'articles/' + articleSlug + '/';
    const disclosure = article.disclosure_required ? '<p class="disclosure">Affiliate disclosure: this page may contain affiliate links. The publisher may earn a commission if you purchase through a link, without changing the price you pay. Verify claims and current terms with the merchant.</p>' : '';
    const body = disclosure + renderTextBody(bodyText);
    const jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: title, description, datePublished: article.published_at, dateModified: article.updated_at || article.published_at, mainEntityOfPage: canonical, inLanguage: article.locale || 'id-ID', publisher: { '@type': 'Organization', name: 'Affiliate Content OS' } };
    await writePage('articles/' + articleSlug + '/index.html', shell({ title, description, canonical, body, jsonLd, kind: 'article' }));
    sitemap.add(canonical); articleLinks.push({ title, canonical, description }); generatedArticles++;
  }
  for (const product of products) {
    const productSlug = slug(product.public_slug);
    const sourceUrl = validUrl(product.source_url);
    const affiliateUrl = validUrl(product.affiliate_url);
    const description = meta(product.public_description, 'Informasi produk dan pertimbangan sebelum memilih. Periksa detail dari merchant resmi.');
    if (!productSlug || !sourceUrl || !affiliateUrl || String(product.public_description || '').trim().length < 120) { skippedProducts++; continue; }
    const title = String(product.name || 'Product').trim().slice(0, 70);
    const canonical = siteBase + 'products/' + productSlug + '/';
    const price = product.price_amount == null ? '' : '<p>Price supplied by publisher: ' + esc(new Intl.NumberFormat('id-ID').format(Number(product.price_amount)) + ' ' + (product.currency || 'IDR')) + '. Confirm the current price with the merchant.</p>';
    const body = '<p>' + esc(product.public_description) + '</p><p class="disclosure">Affiliate disclosure: this page may contain an affiliate link. The publisher may earn a commission if you purchase through it, without changing the price you pay. Product details and prices can change; verify them with the merchant.</p>' + price + '<p><a class="cta" href="' + esc(affiliateUrl) + '" rel="sponsored nofollow noopener" target="_blank">View product at merchant</a></p><p><a href="' + esc(sourceUrl) + '" rel="nofollow noopener" target="_blank">Check source details</a></p>';
    const jsonLd = { '@context': 'https://schema.org', '@type': 'Product', name: title, description: String(product.public_description), category: product.category || undefined, brand: product.merchant_name ? { '@type': 'Brand', name: product.merchant_name } : undefined, url: canonical };
    await writePage('products/' + productSlug + '/index.html', shell({ title, description, canonical, body, jsonLd, kind: 'product' }));
    sitemap.add(canonical); productLinks.push({ title, canonical, description }); generatedProducts++;
  }
  const articleIndexUrl = siteBase + 'articles/';
  const productIndexUrl = siteBase + 'products/';
  const articleIndexBody = articleLinks.length
    ? '<ul>' + articleLinks.map((item) => '<li><a href="' + esc(item.canonical) + '">' + esc(item.title) + '</a><p>' + esc(item.description) + '</p></li>').join('') + '</ul>'
    : '<p>Belum ada artikel yang lolos pemeriksaan publikasi. Artikel baru akan tampil setelah konten lengkap, metadata, dan disclosure ditinjau.</p>';
  const productIndexBody = productLinks.length
    ? '<ul>' + productLinks.map((item) => '<li><a href="' + esc(item.canonical) + '">' + esc(item.title) + '</a><p>' + esc(item.description) + '</p></li>').join('') + '</ul>'
    : '<p>Belum ada halaman produk publik. Produk hanya tampil setelah deskripsi, tautan merchant, dan disclosure diperiksa.</p>';
  await writePage('articles/index.html', shell({ title: 'Articles and SEO Guides', description: 'Practical affiliate marketing guides and reviewed content.', canonical: articleIndexUrl, body: articleIndexBody, jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Articles and SEO Guides', url: articleIndexUrl }, kind: 'article' }));
  await writePage('products/index.html', shell({ title: 'Reviewed Affiliate Products', description: 'Affiliate product pages with clear disclosures and merchant links.', canonical: productIndexUrl, body: productIndexBody, jsonLd: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Reviewed Affiliate Products', url: productIndexUrl }, kind: 'product' }));
  sitemap.add(articleIndexUrl);
  sitemap.add(productIndexUrl);
  await writeFile(join(outputDir, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + Array.from(sitemap).map((url) => '<url><loc>' + esc(url) + '</loc></url>').join('\n') + '\n</urlset>\n', 'utf8');
  console.log(JSON.stringify({ generatedArticles, skippedArticles, generatedProducts, skippedProducts, sitemapUrls: sitemap.size, siteBase }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
