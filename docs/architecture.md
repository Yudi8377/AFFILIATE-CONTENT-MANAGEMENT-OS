# Architecture Baseline

Status: PLANNED. This document is a decision baseline, not evidence of implementation.

## Infrastructure boundary

Approved project resources are the GitHub repository Yudi8377/AFFILIATE-CONTENT-MANAGEMENT-OS and Neon project holy-block-61637276 only. Do not add a required hosting vendor, backend-as-a-service, SaaS plugin, or paid API.

## Deployment feasibility gate

GitHub Pages can serve a static frontend; it cannot execute a private server runtime. Neon PostgreSQL is a database and must never be accessed from browser code using a privileged database connection string. Before choosing the final architecture, verify which first-party Neon capabilities are enabled for this project: Neon Auth, Data API/RLS support, and any server-side function/runtime capability. If a secure server-side execution path is unavailable within the approved resources, document the exact limitation instead of exposing secrets or silently adding a vendor.

## Proposed application shape

- Frontend: TypeScript, React, Vite, static build compatible with GitHub Pages; use a single canonical base-path configuration and test deep-link refresh behavior.
- Database: Neon PostgreSQL with versioned SQL migrations, least-privilege roles, constraints, indexes, and row-level security where supported by the actual access path.
- Authentication: choose only after inspecting enabled Neon Auth capabilities and testing token/session behavior end-to-end. Never assume that a user object is a JWT or that a client session automatically authenticates database requests.
- Public SEO pages: static/prerendered content where possible; stable slugs, canonical URLs, metadata, sitemap, robots rules, structured data, and internal links.
- Media: store metadata and approved asset references in PostgreSQL; actual binary storage is not assumed available until a first-party Neon storage capability and free limits are verified.
- Background jobs and AI: provider-independent interfaces with disabled-by-default adapters. Never put provider API keys in the public bundle. If there is no approved secure execution environment, ship local/manual and template-first workflows before remote AI generation.

## Core domain modules

Identity and workspaces; roles and permissions; affiliate products and networks; link tracking records; content briefs and SEO keyword clusters; editorial calendar; CMS posts/pages/categories; media assets; campaigns; clicks/conversions/commissions imports; CRM contacts; tasks and approvals; accounting journal and expense records; HR/payroll records; license entitlements; audit events; AI agent runs, evaluations, budgets, and provider status.

## Multi-agent model

Agents are task-bounded services, not independent unrestricted administrators. Initial roles: Research Planner, Product Fact Extractor, Keyword Clusterer, Search Intent Classifier, SEO Brief Writer, Draft Writer, Editorial Reviewer, Compliance and Disclosure Checker, Campaign Planner, Asset Storyboard Planner, Cost and Provider Gate, Analytics Summarizer, and Human Approval Coordinator.

Each agent receives a typed input, produces a schema-validated output, records model/provider/status/cost metadata when available, and cannot publish, change roles, spend money, or modify accounting data without a deterministic policy gate and user permission. Agent outputs must label unknown facts and never invent search volumes, commissions, product features, or provider availability.

## Delivery sequence

1. Repository quality gates and application shell.
2. Confirm hosting path and Neon capabilities; implement auth only after smoke tests are specified.
3. Build public SEO pages and CMS content lifecycle.
4. Build product catalog, affiliate campaign and user workspace flows.
5. Add admin access, RBAC, license entitlements and audit log.
6. Add CRM and operational finance modules after core workflows are proven.
7. Add template-first content studio; integrate real AI only where API access, terms, free quota, and secure secret handling are verified.
8. Expand HR/payroll and inventory only with a documented business need and jurisdiction-specific rules.
