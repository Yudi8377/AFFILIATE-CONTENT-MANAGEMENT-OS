const DEFAULT_MAX_AGENTS = 12;
const SAFE_ID = /^[a-z][a-z0-9-]{1,63}$/;

function auditEvent(agentId, status, detail) {
  return { agentId, status, detail, at: new Date().toISOString() };
}

/**
 * Run a bounded, dependency-aware multi-agent workflow.
 * Agents are deterministic local functions unless a separately verified
 * model adapter is explicitly injected by the caller.
 */
export async function runAgentWorkflow(options = {}) {
  const workflowId = String(options.workflowId || 'affiliate-content-pipeline');
  const input = options.input ?? {};
  const agents = Array.isArray(options.agents) ? options.agents : [];
  const allowedCapabilities = new Set(options.allowedCapabilities || []);
  const maxAgents = Math.min(DEFAULT_MAX_AGENTS, Math.max(1, Number(options.maxAgents) || DEFAULT_MAX_AGENTS));
  if (!agents.length) throw new Error('Workflow must contain at least one registered agent.');
  if (agents.length > maxAgents) throw new Error('Workflow exceeds the configured agent execution limit.');

  const byId = new Map();
  for (const agent of agents) {
    if (!agent || !SAFE_ID.test(String(agent.id || ''))) throw new Error('Every agent must have a safe, stable id.');
    if (byId.has(agent.id)) throw new Error('Duplicate agent id: ' + agent.id);
    if (typeof agent.run !== 'function') throw new Error('Agent ' + agent.id + ' has no executable handler.');
    byId.set(agent.id, agent);
  }
  for (const agent of agents) {
    for (const dependency of agent.dependsOn || []) {
      if (!byId.has(dependency)) throw new Error('Unknown dependency ' + dependency + ' for agent ' + agent.id + '.');
      if (dependency === agent.id) throw new Error('Agent cannot depend on itself: ' + agent.id);
    }
    for (const capability of agent.capabilities || []) {
      if (!allowedCapabilities.has(capability)) throw new Error('Capability "' + capability + '" is not authorized for agent ' + agent.id + '.');
    }
  }

  const results = {};
  const audit = [];
  const pending = new Set(agents.map((agent) => agent.id));
  const context = Object.freeze({ workflowId, input, results });
  while (pending.size) {
    let progressed = false;
    for (const agent of agents) {
      if (!pending.has(agent.id)) continue;
      const dependencies = agent.dependsOn || [];
      if (!dependencies.every((id) => Object.hasOwn(results, id))) continue;
      pending.delete(agent.id);
      progressed = true;
      if (dependencies.some((id) => results[id].status !== 'completed')) {
        results[agent.id] = { status: 'skipped', output: null, errorCode: 'DEPENDENCY_FAILED' };
        audit.push(auditEvent(agent.id, 'skipped', 'dependency_failed'));
        continue;
      }
      try {
        const output = await agent.run(Object.freeze({
          workflowId,
          input,
          results: Object.freeze({ ...results }),
          dependencies: Object.freeze(Object.fromEntries(dependencies.map((id) => [id, results[id].output])))
        }));
        results[agent.id] = { status: 'completed', output: output ?? null, errorCode: null };
        audit.push(auditEvent(agent.id, 'completed', 'ok'));
      } catch (error) {
        results[agent.id] = {
          status: 'failed',
          output: null,
          errorCode: String(error?.code || 'AGENT_EXECUTION_FAILED').slice(0, 80)
        };
        audit.push(auditEvent(agent.id, 'failed', results[agent.id].errorCode));
      }
    }
    if (!progressed) throw new Error('Agent dependency cycle detected.');
  }

  const failed = Object.values(results).some((result) => result.status === 'failed');
  const skipped = Object.values(results).some((result) => result.status === 'skipped');
  return {
    workflowId,
    status: failed ? 'failed' : skipped ? 'partial' : 'completed',
    agentCount: agents.length,
    results,
    audit,
    externalModelUsed: false,
    humanReviewRequired: true
  };
}
