# Affiliate Content Management OS

Affiliate marketing operating system with an Indonesian-first public website, a Neon-backed workspace, a restricted platform administration console, and a Rp0-first local creative studio.

## Non-negotiable constraints

- Primary infrastructure is limited to this GitHub repository and the designated Neon project.
- No required paid hosting, AI API, plugin, external backend, or third-party SaaS integration.
- External AI providers remain disabled until free quota, commercial rights, privacy terms, and a real API test are independently verified.
- No secrets in source control, public client bundles, logs, or documentation.
- No destructive production database changes without a tested migration and explicit approval.
- Do not claim implemented, tested, or live functionality without direct evidence.
- Prefer small, reviewable vertical slices and preserve working behavior.
- SEO search volume and keyword difficulty must remain Not measured unless sourced from verified data.

## Current architecture

- **Public website:** static GitHub Pages build, accessible pages, canonical metadata, Open Graph, sitemap and robots rules, privacy notice, affiliate disclosure, and scheduled generation of crawlable article/product pages from published Neon records.
- **User workspace:** Neon Auth session, workspace role checks, products and affiliate links, SEO keyword planning, content drafts and review/publish workflow, campaign planning and records, CRM contacts, expenses, HR records, inventory, double-entry journal drafts, and payroll draft periods/items.
- **Platform administration:** restricted admin.html console for workspaces, registered profiles, platform-admin access, license entitlements, agent registry, provider registry, audit events, and recorded agent runs. Admin access requires a database-authorized platform-admin record; signing in alone does not grant privilege.
- **Database:** Neon PostgreSQL and Data API with row-level security. Migrations 0001 through 0007 cover core schema, policies, CRM/finance/HR/inventory modules, license-write hardening, platform-admin policies, local SEO agents, and provider cost gates.
- **Local SEO and content agents:** search-intent classifier, keyword-cluster generator, SEO planner, campaign planner, affiliate compliance checklist, and storyboard planner. These are deterministic rule-based helpers, not external LLM inference.
- **Multi-agent orchestration foundation:** bounded dependency-aware workflow engine, explicit capability allowlist, failure propagation, cycle and agent-count guards, and redacted execution audit events. It currently coordinates injected local handlers; it does not call a generative model or independently authorize database writes. See docs/multi-agent-orchestration.md.
- **Video & Image Studio:** browser-local Canvas/MediaRecorder template rendering from user-uploaded images, text overlays, storyboard, compliance checks, PNG export, and browser-supported MP4/WebM export. No image/video model, voice generator, cloud upload, or persistent media storage is connected in this version.
- **Provider governance:** only the local manual-template provider is registered as available by default. Database constraints prevent an external provider being marked available without verified free quota and commercial rights.

## Data and publishing safeguards

- New products are private research records until explicitly activated and published.
- Product pages require a source URL, affiliate URL, and a specific public description of at least 120 characters. Pages include an affiliate disclosure and sponsored/nofollow link attributes.
- Content drafts require human review. Publishing controls require approval and at least 300 characters of non-template article content.
- SEO-generated brief outlines are not publishable articles. They must be expanded, checked, and reviewed.
- Browser-local video/image files are not uploaded to Neon. Download and retain them locally.
- Accounting journals can be drafted and submitted for review only when debits equal credits; final posting is not enabled from the browser.
- Payroll records are drafts/review-only; approval and payment execution are not enabled.
- External provider API keys are not stored in the browser.

## Commands

- **npm run check** — syntax and static checks.
- **npm test** — deterministic agent tests.
- **npm run build** — multi-page static build.
- **npm run generate:public** — generate crawlable public pages from records visible to the Neon anonymous role.

## Honest delivery status

- **IMPLEMENTED IN BRANCH:** application modules, role-aware UI, local SEO/campaign/storyboard/compliance helpers, static public-page generator, scheduled publishing workflow, migrations, and CI assertions.
- **DATABASE APPLIED:** migrations 0001–0007 applied to the designated development and production branches.
- **CI discipline:** pull-request validation checks out the exact head SHA, runs syntax checks, unit tests, static generation, and Neon/RLS smoke tests. If no dedicated read-only Neon publishing JWT is configured, static generation warns and produces empty article/product collections rather than failing the whole build; real CMS publishing still requires verified read access.
- **TESTED:** only the checks and tests that show successful status in GitHub Actions; review the latest run before treating a release as verified.
- **NOT YET LIVE VERIFIED:** GitHub repository metadata currently reports Pages disabled. The deployment workflow now requests Pages enablement during deployment, but it has not run from main; no live deployment is claimed. Production browser sign-in, initial platform-admin bootstrap, scheduled CMS publishing, and the browser media-rendering experience still require direct live verification. The scheduled CMS workflow fails closed unless the GitHub Actions secret NEON_PUBLIC_READ_TOKEN is configured; without it, no CMS refresh is deployed.
- **NOT IMPLEMENTED:** external generative AI image/video APIs, AI voice generation, server-side media storage, automatic social publishing, real search-volume/difficulty integrations, production-connected multi-agent runs and persisted agent audit UI, final accounting posting, payroll approval/payment, and tax/legal compliance certification.

## Production prerequisites

1. Keep main as the deployment source and merge only after the exact PR head CI is green and deployment changes have been reviewed.
2. Add a narrowly scoped, read-only Neon Data API JWT as the GitHub Actions secret NEON_PUBLIC_READ_TOKEN for the scheduled CMS workflow; verify that it can read only published public records and cannot write data. Do not paste tokens into source control or chat.
3. After deployment, register the owner's account through the production workspace.
4. Bootstrap that exact user ID as the first platform administrator through a verified database procedure; do not create a privileged identity based on a guessed email.
5. Verify sign-in, workspace isolation, product publishing, public sitemap, scheduled CMS workflow, and video rendering in the production browser.
6. Review privacy, affiliate disclosure, tax/accounting rules, and applicable legal obligations before commercial launch.
