import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStoryboard } from '../assets/js/agents/storyboard-planner.js';
import { reviewAffiliateDraft } from '../assets/js/agents/affiliate-compliance.js';

test('storyboard duration is exact and at least 30 seconds', () => {
  for (const duration of [30,45,60]) {
    const plan = generateStoryboard({ productName: 'Sample Product', benefit: 'The seller lists a rechargeable battery', cta: 'Check seller details', duration, locale: 'en' });
    assert.equal(plan.totalSeconds, duration);
    assert.ok(plan.totalSeconds >= 30);
    assert.equal(plan.externalAiProviderUsed, false);
    assert.equal(plan.scenes.length, 7);
  }
});

test('storyboard rejects unverified missing benefit inputs', () => {
  assert.throws(() => generateStoryboard({ productName: 'Sample Product', benefit: '', duration: 30 }), /manfaat/i);
});

test('affiliate compliance blocks invalid URLs and missing disclosure', () => {
  const result = reviewAffiliateDraft({
    productName: 'Sample Product',
    sourceUrl: 'javascript:alert(1)',
    affiliateUrl: 'https://merchant.example/track',
    description: 'A sufficiently long description that explains the item and its purpose, but this test intentionally lacks disclosure.',
    disclosure: false
  });
  assert.equal(result.pass, false);
  assert.equal(result.status, 'blocked');
  assert.ok(result.issues.some((issue) => issue.code === 'SOURCE_URL_INVALID'));
  assert.ok(result.issues.some((issue) => issue.code === 'DISCLOSURE_MISSING'));
});

test('affiliate compliance flags absolute claims for human review', () => {
  const result = reviewAffiliateDraft({
    productName: 'Sample Product',
    sourceUrl: 'https://merchant.example/product',
    affiliateUrl: 'https://merchant.example/track',
    description: 'A detailed product description longer than one hundred and twenty characters, including context, intended audience, limits, and details to verify with the merchant.',
    disclosure: true,
    claims: ['Guaranteed income with no risk']
  });
  assert.equal(result.pass, false);
  assert.ok(result.issues.some((issue) => issue.code === 'UNSUPPORTED_CLAIM_REVIEW'));
});
