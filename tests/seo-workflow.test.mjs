import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSeoPlan } from '../assets/js/agents/seo-planner.js';
import { runAgentWorkflow } from '../assets/js/agents/orchestrator.js';

test('SEO planner and quality reviewer complete a safe 10-by-7 plan', async () => {
  const workflow = await runAgentWorkflow({
    workflowId: 'seo-content-planning-test',
    input: { keyword: 'affiliate content', audience: 'new creators', locale: 'id' },
    allowedCapabilities: ['local-seo', 'quality-review'],
    agents: [
      { id: 'seo-planner', capabilities: ['local-seo'], run: ({ input }) => generateSeoPlan(input) },
      { id: 'seo-quality-review', dependsOn: ['seo-planner'], capabilities: ['quality-review'], run: ({ dependencies }) => {
        const plan = dependencies['seo-planner'];
        const unique = new Set(plan.rows.map((row) => row.keyword.toLocaleLowerCase()));
        const validMeta = plan.rows.every((row) => row.metaDescription.length >= 120 && row.metaDescription.length <= 155);
        assert.equal(plan.rows.length, 70);
        assert.equal(unique.size, 70);
        assert.equal(validMeta, true);
        assert.equal(plan.rows.every((row) => row.searchVolume === null && row.keywordDifficulty === null), true);
        return { checked: plan.rows.length, validMeta, metricsInvented: false };
      } }
    ]
  });
  assert.equal(workflow.status, 'completed');
  assert.equal(workflow.results['seo-quality-review'].output.checked, 70);
  assert.equal(workflow.audit.length, 2);
});
