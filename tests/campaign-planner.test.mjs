import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCampaignPlan } from '../assets/js/agents/campaign-planner.js';

test('campaign planner returns actionable channels, messages, KPIs, and compliance checks', () => {
  const plan = generateCampaignPlan({
    productName: 'Product Alpha',
    audience: 'new affiliate marketers',
    benefit: 'The merchant lists a low setup requirement',
    goal: 'qualified leads',
    budget: 100000,
    locale: 'en',
    channels: ['website','instagram','email']
  });
  assert.equal(plan.externalProviderUsed, false);
  assert.equal(plan.channels.length, 3);
  assert.ok(plan.messageAngles.length >= 3);
  assert.ok(plan.slogans.length >= 3);
  assert.ok(plan.kpis.some((item) => item.toLowerCase().includes('conversion')));
  assert.equal(plan.allocation.reduce((sum, item) => sum + item.allocationAmount, 0), 100000);
  assert.equal(plan.allocation.reduce((sum, item) => sum + item.allocationPercent, 0), 100);
});

test('campaign planner requires evidence supplied by the user', () => {
  assert.throws(() => generateCampaignPlan({ productName: 'Product Alpha', audience: 'creators', benefit: '' }), /manfaat/i);
});
