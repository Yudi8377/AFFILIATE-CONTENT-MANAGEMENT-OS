import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySearchIntent, generateSeoPlan, slugify } from '../assets/js/agents/seo-planner.js';

test('classifies common search intent signals without claiming search metrics', () => {
  assert.equal(classifySearchIntent('beli affiliate marketing software').intent, 'transactional');
  assert.equal(classifySearchIntent('best affiliate marketing tools comparison').intent, 'commercial');
  assert.equal(classifySearchIntent('cara membuat konten affiliate').intent, 'informational');
});

test('generates ten clusters with seven long-tail keywords each', () => {
  const plan = generateSeoPlan({ keyword: 'affiliate marketing', locale: 'en', audience: 'content creators' });
  assert.equal(plan.clusterCount, 10);
  assert.equal(plan.rows.length, 70);
  assert.equal(plan.rows.every((row) => row.searchVolume === null && row.keywordDifficulty === null), true);
  assert.equal(plan.rows.every((row) => row.metricStatus === 'not measured' && row.reviewRequired), true);
  assert.equal(plan.rows.every((row) => row.metaDescription.length >= 120 && row.metaDescription.length <= 155), true);
});

test('generates a meta description within the recommended character range', () => {
  const plan = generateSeoPlan({
    keyword: 'affiliate marketing platform',
    locale: 'en',
    audience: 'small business owners',
    benefit: 'compare practical options and avoid unnecessary spend',
    cta: 'review the checklist'
  });
  assert.ok(plan.metaDescriptionCharacters >= 120);
  assert.ok(plan.metaDescriptionCharacters <= 155);
  assert.equal(plan.quality.searchVolumeFabricated, false);
  assert.equal(plan.quality.keywordDifficultyFabricated, false);
});

test('keeps supplied related keywords unique and adds a human-review flag', () => {
  const plan = generateSeoPlan({
    keyword: 'konten affiliate',
    locale: 'id',
    relatedKeywords: 'konten affiliate, cara membuat konten affiliate; strategi konten affiliate'
  });
  const values = plan.rows.map((row) => row.keyword.toLocaleLowerCase());
  assert.equal(new Set(values).size, values.length);
  assert.equal(plan.rows.length, 71); // Two supplied terms already exist in the generated cluster list.
  assert.ok(plan.rows.some((row) => row.keyword === 'strategi konten affiliate'));
  assert.equal(plan.quality.humanReviewRequired, true);
});

test('creates safe URL slugs from titles', () => {
  assert.equal(slugify('Cara Memilih Produk Affiliate!'), 'cara-memilih-produk-affiliate');
});
