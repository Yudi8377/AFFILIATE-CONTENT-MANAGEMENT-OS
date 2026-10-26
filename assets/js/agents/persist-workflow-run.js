const SAFE_AGENT_ID = /^[a-z][a-z0-9-]{1,63}$/;

/**
 * Persist a minimal, non-sensitive workflow audit record using the caller's
 * authenticated Data API client. Local results remain unverified and require
 * human review; raw prompt/input/output payloads are never persisted here.
 */
export async function persistWorkflowRun({ api, workspaceId, userId, workflow, startedAt, finishedAt }) {
  if (typeof api !== 'function') throw new Error('Authenticated Data API client is required.');
  if (!workspaceId || !userId) throw new Error('A signed-in user and workspace are required.');
  if (!workflow || !Array.isArray(workflow.audit) || !workflow.results) throw new Error('Workflow result is invalid.');

  const agentIds = Object.keys(workflow.results);
  if (!agentIds.length || agentIds.some((id) => !SAFE_AGENT_ID.test(id))) {
    throw new Error('Workflow agent identifiers are invalid.');
  }

  const created = await api('agent_runs', {
    method: 'POST',
    body: {
      workspace_id: workspaceId,
      requested_by: userId,
      agent_key: agentIds[0],
      status: 'queued',
      input_schema_version: '1',
      output_schema_version: '1',
      input: {
        workflowId: String(workflow.workflowId || 'workflow').slice(0, 80),
        agentIds,
        externalModelUsed: false,
        auditSchemaVersion: '1'
      },
      provider_name: 'local-deterministic',
      provider_status: 'unverified',
      started_at: startedAt
    }
  });

  const row = Array.isArray(created) ? created[0] : created;
  if (!row || !row.id) throw new Error('Audit record was created without a returned record ID.');

  const audit = workflow.audit.map((event) => ({
    agentId: event.agentId,
    status: event.status,
    detail: event.detail
  }));
  const results = Object.fromEntries(agentIds.map((id) => [id, {
    status: workflow.results[id].status,
    errorCode: workflow.results[id].errorCode || null
  }]));
  const finalStatus = workflow.status === 'failed' ? 'failed' : 'needs_review';

  await api('agent_runs', {
    method: 'PATCH',
    query: 'id=eq.' + encodeURIComponent(row.id) + '&requested_by=eq.' + encodeURIComponent(userId) + '&status=eq.queued',
    body: {
      status: finalStatus,
      output: {
        workflowId: String(workflow.workflowId || 'workflow').slice(0, 80),
        workflowStatus: workflow.status,
        results,
        audit,
        externalModelUsed: false,
        humanReviewRequired: true
      },
      provider_status: 'unverified',
      failure_reason: workflow.status === 'failed' ? 'LOCAL_WORKFLOW_FAILED' : null,
      finished_at: finishedAt
    }
  });

  return { id: row.id, status: finalStatus, humanReviewRequired: true, externalModelUsed: false };
}
