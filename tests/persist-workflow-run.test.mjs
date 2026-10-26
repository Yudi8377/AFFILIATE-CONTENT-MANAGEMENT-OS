import test from 'node:test';
import assert from 'node:assert/strict';
import { persistWorkflowRun } from '../assets/js/agents/persist-workflow-run.js';

test('persists only a minimal unverified audit summary and requires human review', async () => {
  const calls = [];
  const api = async (table, options) => {
    calls.push({ table, options });
    if (options.method === 'POST') return [{ id: 'run-123' }];
    return [{ id: 'run-123', status: options.body.status }];
  };
  const result = await persistWorkflowRun({
    api, workspaceId: 'workspace-1', userId: 'user-1',
    startedAt: '2026-10-26T10:00:00.000Z', finishedAt: '2026-10-26T10:00:01.000Z',
    workflow: {
      workflowId: 'seo-content-planning', status: 'completed',
      results: {
        'seo-planner': { status: 'completed', output: { secretDraft: 'must not persist' }, errorCode: null },
        'seo-quality-review': { status: 'completed', output: { reviewedRows: 70 }, errorCode: null }
      },
      audit: [
        { agentId: 'seo-planner', status: 'completed', detail: 'ok', at: 'ignored timestamp' },
        { agentId: 'seo-quality-review', status: 'completed', detail: 'ok' }
      ]
    }
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].table, 'agent_runs');
  assert.equal(calls[0].options.body.status, 'queued');
  assert.equal(calls[0].options.body.output, undefined);
  assert.equal(calls[0].options.body.actual_cost, undefined);
  assert.equal(calls[1].options.body.status, 'needs_review');
  assert.equal(calls[1].options.body.provider_status, 'unverified');
  assert.equal(calls[1].options.body.output.humanReviewRequired, true);
  assert.equal(JSON.stringify(calls).includes('must not persist'), false);
  assert.equal(result.id, 'run-123');
  assert.equal(result.humanReviewRequired, true);
});

test('records failed local workflows as failed without exposing exception text', async () => {
  const calls = [];
  const api = async (_table, options) => {
    calls.push(options);
    return options.method === 'POST' ? [{ id: 'run-456' }] : [];
  };
  await persistWorkflowRun({
    api, workspaceId: 'w', userId: 'u', startedAt: '2026-10-26T10:00:00Z', finishedAt: '2026-10-26T10:00:01Z',
    workflow: {
      workflowId: 'affiliate-campaign-planning', status: 'failed',
      results: { 'campaign-strategist': { status: 'failed', errorCode: 'CAMPAIGN_OUTPUT_INCOMPLETE' } },
      audit: [{ agentId: 'campaign-strategist', status: 'failed', detail: 'CAMPAIGN_OUTPUT_INCOMPLETE' }]
    }
  });
  assert.equal(calls[1].body.status, 'failed');
  assert.equal(calls[1].body.failure_reason, 'LOCAL_WORKFLOW_FAILED');
  assert.equal(JSON.stringify(calls).includes('stack trace'), false);
});

test('rejects incomplete identity and malformed agent IDs before writing', async () => {
  let called = false;
  const api = async () => { called = true; return []; };
  await assert.rejects(() => persistWorkflowRun({
    api, workspaceId: null, userId: 'u', workflow: { workflowId: 'x', status: 'completed', results: {}, audit: [] }
  }), /signed-in user and workspace/);
  await assert.rejects(() => persistWorkflowRun({
    api, workspaceId: 'w', userId: 'u', workflow: { workflowId: 'x', status: 'completed', results: { 'BAD ID': {} }, audit: [] }
  }), /identifiers are invalid/);
  assert.equal(called, false);
});
