# Multi-agent orchestration for Affiliate Content Management OS

## Scope

This layer coordinates specialist agents as a bounded workflow instead of treating every AI task as an isolated button. The current implementation is a local orchestration engine: agent handlers are injected, dependency-aware, capability-gated, and auditable. It does **not** call an external LLM and must not be presented as generative AI.

The reference URL supplied for the Transmind Nexus page could not be retrieved by the current inspection environment. This implementation therefore adopts general multi-agent platform patterns rather than claiming feature parity with that page. A feature-by-feature mapping should be made only after its public description or screenshots are available.

## Initial specialist roles

1. **Request & Context Intake** — normalize the user's goal, locale, product facts, intended audience, and output format.
2. **SEO Research Planner** — classify intent and prepare keyword clusters, titles, and meta descriptions. Search volume and difficulty stay “Not measured” until verified data exists.
3. **Campaign Strategist** — convert approved product facts and goals into a channel plan, messages, activities, and measurable KPIs.
4. **Content / Storyboard Planner** — produce structured article briefs or 30/45/60-second storyboard drafts from supplied facts.
5. **Affiliate Compliance Reviewer** — check source and affiliate URLs, disclosure, unsupported claims, and required human review.
6. **Evidence & Quality Reviewer** — verify required fields, duplicate outputs, unsafe claims, and handoff completeness.
7. **Cost & Provider Gate** — block external providers unless free quota, commercial rights, privacy terms, and a real integration test are verified.
8. **Human Approval Gate** — require human review before public publication, irreversible actions, or sensitive changes.

These roles describe the intended workflow. The SEO planner and campaign strategist now run through the coordinator with a downstream quality reviewer in the workspace UI. The workspace initializes both the campaign planner and the local studio. SEO and campaign workflow summaries are written to `agent_runs` through the authenticated Data API: raw input and agent output are excluded from the audit payload; final records use `needs_review` (or `failed`) and `provider_status=unverified`. Storyboard and affiliate-compliance helpers still run as separate local tools; they are not yet part of one end-to-end cross-domain workflow. No unimplemented role should be shown as active.

## Execution contract

- Stable agent IDs, unique registrations, explicit dependencies, and a hard limit of 12 agents per workflow.
- Each agent declares required capabilities. The caller must explicitly allow those capabilities; otherwise execution is rejected before any agent runs.
- Agents receive the request and the outputs of declared dependencies, not unrestricted access to every integration.
- Dependencies execute before downstream agents. A failed dependency blocks dependent agents.
- Failures return bounded error codes; private exception messages are not copied into the audit trail.
- The workflow reports completed, partial, or failed, and always marks human review as required.
- Current output is local/deterministic by default (externalModelUsed: false). A future model adapter must be separately reviewed and explicitly injected.
- Never store API secrets in client code, agent output, or audit records. No external provider is enabled by default.

## Test coverage

The orchestrator test file covers dependency ordering, declared output handoff, capability denial, dependency failure, audit redaction, cycles, and execution limits. npm test includes this test file.

## Operational boundary

This module is a tested orchestration foundation, not proof of production AI autonomy. Before production use, persist workflow audit events to the existing agent_runs model through a server/database-authorized path, add authorization checks on the server/database side for every sensitive action, evaluate representative workflows, and run authenticated positive/negative RLS tests. The browser currently displays local workflow results but does not persist their audit trail. Publishing, licensing, accounting posting, payroll payment, and external AI calls must remain gated until those controls pass.
