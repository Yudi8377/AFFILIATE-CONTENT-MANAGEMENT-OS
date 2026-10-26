# Multi-Agent Governance

Status: PLANNED.

## Design principle

The platform uses a workflow orchestrator with small specialist agents. Agents propose and transform content; deterministic application code enforces permissions, budgets, state transitions, validation, and audit requirements.

## Initial agent roster

- Intake and Brief Agent: converts user goals into a structured brief and asks for missing critical facts.
- Product Fact Agent: extracts only verifiable details from supplied text/assets and records source/provenance.
- Keyword Cluster Agent: normalizes keywords and groups them by semantic relevance without inventing metrics.
- Search Intent Agent: classifies informational, commercial, transactional, or navigational intent and explains confidence internally.
- SEO Planner Agent: proposes page type, title, meta description, outline, internal links, and update cadence.
- Content Draft Agent: creates a draft based on the approved brief and sourced facts.
- Editorial QA Agent: checks duplication, unsupported claims, readability, completeness, and on-page SEO.
- Affiliate Compliance Agent: checks disclosure presence, misleading claims, and prohibited or risky claims; flags rather than making legal guarantees.
- Campaign Agent: proposes channel-specific creative variants and schedules but does not publish without approval.
- Storyboard Agent: maps a product brief to scenes, assets, subtitles, voice-over, and CTA.
- Provider and Cost Gate Agent: reports configured provider status, estimated costs, budget availability, and fallback mode; cannot activate an unverified provider.
- Analytics Agent: summarizes imported or observed campaign data, separating actual data from estimates.
- Human Review Coordinator: routes drafts and high-risk changes to authorized users.

## Workflow contract

Every run should have an ID, workspace/user owner, input schema version, output schema version, agent version, start/end time, status, approval state, usage/cost fields when available, and failure reason. Do not store secrets or unnecessary personal data in prompts or logs.

## Allowed and prohibited actions

Agents may draft, classify, summarize, recommend, and create pending records within the caller's permission scope. They must not grant roles, change license entitlements, issue refunds, modify accounting balances, delete critical records, or publish content autonomously. Deterministic policy code and explicit human approval are required for sensitive transitions.

## Quality evaluation

Maintain test cases for source attribution, keyword intent, schema validity, unsupported factual claims, duplicate content, disclosure presence, prompt injection in imported product pages, and failure/retry behavior. A successful model response alone does not pass evaluation.

## Zero-cost behavior

The product must continue to function when no model API key or free quota exists. Manual brief creation, keyword import, template-based drafts, and editorial workflow should remain usable. Any remote model integration is optional and disabled until its API, commercial terms, free allowance, and secure secret path are verified.
