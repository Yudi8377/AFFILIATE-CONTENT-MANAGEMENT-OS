# Affiliate Content Management OS

An Indonesian-first affiliate marketing operating system built incrementally with a strict Rp0-first constraint.

## Product vision

A single platform for affiliate creators, publishers, teams, and administrators to discover and manage products, plan SEO content, create promotional assets, track campaigns and commissions, and operate the business with auditable workflows.

## Non-negotiable constraints

- Primary infrastructure: this GitHub repository and the designated Neon PostgreSQL project only.
- No required paid hosting, AI API, plugin, external backend, or third-party SaaS integration.
- Optional external integrations may be considered only if explicitly approved later; the core product must remain useful without them.
- No secrets in source control, public client bundles, logs, or documentation.
- No destructive production database changes without a tested migration and explicit approval.
- No claim of implemented, tested, or live functionality without direct evidence.
- Build in small, reviewable vertical slices; preserve working behavior and avoid broad rewrites.
- Indonesian-first UX, with English SEO/content support where useful.

## Product areas

1. Public SEO website: fast category and product pages, editorial hub, comparison pages, guides, structured metadata, canonical URLs, sitemap, robots rules, internal links, and accessible responsive UI.
2. User workspace: onboarding, profile, product research, affiliate links, content calendar, drafts, media library, campaigns, performance records, and export.
3. Administrator workspace: users and roles, organizations/workspaces, content moderation, products/catalog, campaign oversight, audit log, settings, license/subscription management, and operational reporting.
4. Business operations: CRM, CMS, task/workflow management, finance/accounting records, HR/payroll records, inventory and procurement only where they support actual affiliate operations. Modules must be phased and must not be empty decorative menus.
5. AI-assisted studio: product brief and URL/manual input, script and storyboard assistance, image/video provider adapters, template-based rendering, cost controls, and explicit provider availability status.
6. Multi-agent orchestration: narrow agents with typed inputs/outputs, deterministic policy gates, cost/time limits, auditability, evaluation, and human approval for sensitive actions.

## Delivery policy

Feature status must be labeled honestly:
- PLANNED: documented, not built.
- IN_PROGRESS: work has started.
- IMPLEMENTED: code exists.
- TESTED: automated or documented test evidence exists.
- LIVE_VERIFIED: production behavior was checked directly.

A successful CI run is evidence for that workflow only, not proof that every feature works.

## Initial roadmap

- Phase 0: repository baseline, product decisions, security boundaries, schema and test strategy.
- Phase 1: runnable application shell, health/status checks, responsive public website, and CI.
- Phase 2: Neon-backed data model and authentication/session design after validating the chosen deployment constraints.
- Phase 3: public SEO content system and user/admin workspaces with real CRUD and authorization.
- Phase 4: affiliate product/campaign workflows, reports, exports, and audit trail.
- Phase 5: provider-independent AI-assisted content studio and template-first media rendering.
- Phase 6: carefully scoped multi-agent workflows, evaluations, and production-readiness checks.

## Current verified baseline

- Repository exists and is initially empty; main is the default branch.
- Neon project holy-block-61637276 has a ready production branch br-noisy-snow-aoosguyk.
- Initial table inspection returned no application tables.
- No application build or deployment has been verified yet.
