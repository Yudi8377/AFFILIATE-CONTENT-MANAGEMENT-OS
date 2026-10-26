const SUSPICIOUS_CLAIM_PATTERNS = [
  /\b(guaranteed income|guaranteed results|risk[- ]free|100% guaranteed|#1 product|number one|cures|clinically proven|best in the world)\b/i,
  /\b(pasti untung|dijamin berhasil|bebas risiko|100% berhasil|nomor satu|paling terbaik|menyembuhkan)\b/i
];
function validHttpUrl(value) {
  try { const url = new URL(String(value)); return url.protocol === 'http:' || url.protocol === 'https:'; } catch { return false; }
}
export function reviewAffiliateDraft(input) {
  const data = input || {};
  const issues = [];
  const productName = String(data.productName || '').trim();
  const description = String(data.description || '').trim();
  const sourceUrl = String(data.sourceUrl || '').trim();
  const affiliateUrl = String(data.affiliateUrl || '').trim();
  const disclosure = Boolean(data.disclosure);
  const claims = Array.isArray(data.claims) ? data.claims : [];
  if (!productName) issues.push({ code: 'PRODUCT_NAME_MISSING', severity: 'high', message: 'Product name is required.' });
  if (!validHttpUrl(sourceUrl)) issues.push({ code: 'SOURCE_URL_INVALID', severity: 'high', message: 'A valid HTTP(S) source URL is required for fact checking.' });
  if (affiliateUrl && !validHttpUrl(affiliateUrl)) issues.push({ code: 'AFFILIATE_URL_INVALID', severity: 'high', message: 'Affiliate URL must use HTTP or HTTPS.' });
  if (affiliateUrl && !disclosure) issues.push({ code: 'DISCLOSURE_MISSING', severity: 'high', message: 'Affiliate disclosure is required when an affiliate link is used.' });
  if (description.length < 120) issues.push({ code: 'DESCRIPTION_TOO_SHORT', severity: 'medium', message: 'Provide at least 120 characters of specific product description before public publication.' });
  for (const claim of claims) {
    const text = String(claim || '').trim();
    if (!text) continue;
    if (SUSPICIOUS_CLAIM_PATTERNS.some((pattern) => pattern.test(text))) {
      issues.push({ code: 'UNSUPPORTED_CLAIM_REVIEW', severity: 'high', message: 'Review this absolute or high-risk claim against reliable evidence: ' + text });
    }
  }
  return {
    pass: issues.length === 0,
    status: issues.some((issue) => issue.severity === 'high') ? 'blocked' : issues.length ? 'review_required' : 'ready_for_human_review',
    issues,
    checkedAt: new Date().toISOString(),
    externalProviderUsed: false,
    disclaimer: 'This is a deterministic checklist, not legal advice or proof that a claim is true.'
  };
}
