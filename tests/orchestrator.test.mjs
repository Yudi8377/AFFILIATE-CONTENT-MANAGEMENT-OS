import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentWorkflow } from '../assets/js/agents/orchestrator.js';

test('runs agents in dependency order and passes only declared dependency outputs', async () => {
  const seen = [];
  const result = await runAgentWorkflow({
    input: { keyword: 'affiliate content' },
    agents: [
      { id: 'quality-review', dependsOn: ['seo-plan'], run: ({ dependencies }) => ({ reviewed: dependencies['seo-plan'].rows === 70 }) },
      { id: 'seo-plan', capabilities: ['local-seo'], run: ({ input }) => { seen.push(input.keyword); return { rows: 70 }; } }
    ],
    allowedCapabilities: ['local-seo']
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.results['quality-review'].output.reviewed, true);
  assert.deepEqual(seen, ['affiliate content']);
  assert.equal(result.externalModelUsed, false);
  assert.equal(result.humanReviewRequired, true);
});

test('blocks an agent whose capability is not explicitly allowed', async () => {
  await assert.rejects(() => runAgentWorkflow({
    agents: [{ id: 'publish-content', capabilities: ['publish'], run: () => 'published' }]
  }), /not authorized/i);
});

test('skips downstream agents after a dependency fails and records audit events', async () => {
  const result = await runAgentWorkflow({
    agents: [
      { id: 'fact-check', run: () => { throw Object.assign(new Error('private detail'), { code: 'FACTS_UNVERIFIED' }); } },
      { id: 'publish-check', dependsOn: ['fact-check'], run: () => 'should not run' }
    ]
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.results['fact-check'].status, 'failed');
  assert.equal(result.results['fact-check'].errorCode, 'FACTS_UNVERIFIED');
  assert.equal(result.results['publish-check'].status, 'skipped');
  assert.equal(result.audit.length, 2);
  assert.equal(JSON.stringify(result.audit).includes('private detail'), false);
});

test('rejects dependency cycles and excessive agent counts', async () => {
  await assert.rejects(() => runAgentWorkflow({ agents: [
    { id: 'agent-alpha', dependsOn: ['agent-bravo'], run: () => null },
    { id: 'agent-bravo', dependsOn: ['agent-alpha'], run: () => null }
  ] }), /cycle/i);
  await assert.rejects(() => runAgentWorkflow({
    maxAgents: 2,
    agents: [1,2,3].map((n) => ({ id: 'agent-' + n, run: () => n }))
  }), /execution limit/i);
});
