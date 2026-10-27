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
- **DATABASE STATUS:** core application tables and RLS are present on both Neon branches. Migration `0004_agent_run_lifecycle.sql` was applied and verified only on development branch `br-morning-recipe-aov26ci2` in this work; the production branch was not modified. Do not infer that every repository migration has been applied to both branches without checking each migration and schema.
- **CI discipline:** pull-request validation checks out the exact head SHA, runs syntax checks, unit tests, static generation, and Neon/RLS smoke tests. If no dedicated read-only Neon publishing JWT is configured, static generation warns and produces empty article/product collections rather than failing the whole build; real CMS publishing still requires verified read access.
- **TESTED:** only the checks and tests that show successful status in GitHub Actions; review the latest run before treating a release as verified.
- **LIVE DEPLOYMENT VERIFIED (workflow evidence):** GitHub Actions run [#40422849348](https://github.com/Yudi8377/AFFILIATE-CONTENT-MANAGEMENT-OS/actions/runs/40422849348) completed successfully for commit `4560719f6f076aa0d2dc80dd3f66f8c198bfa505`. Its validation and deploy jobs passed, including the production Neon function health check and GitHub Pages artifact deployment. This confirms the workflow completed successfully; it does not by itself verify the public site in a browser, production sign-in, initial platform-admin bootstrap, or scheduled CMS publishing. The repository owner confirmed that `NEON_PUBLIC_READ_TOKEN` is saved, but the token's read permissions and scheduled publishing still need a successful workflow run. The browser media-rendering experience also needs direct live verification.
- **NOT IMPLEMENTED:** external generative AI image/video APIs, AI voice generation, server-side media storage, automatic social publishing, real search-volume/difficulty integrations, a dedicated audit-history UI, final accounting posting, payroll approval/payment, and tax/legal compliance certification. Multi-agent run summaries now persist from SEO/campaign flows to Neon development as `needs_review` (or `failed`) with provider status `unverified`; this is a browser-originated audit summary, not proof that an LLM ran or that output was independently verified.

## Production prerequisites

1. GitHub Pages is configured for GitHub Actions, and deployment from `main` has succeeded in [workflow run #40422849348](https://github.com/Yudi8377/AFFILIATE-CONTENT-MANAGEMENT-OS/actions/runs/40422849348). Open the public site and verify its main routes and assets in a browser before declaring the user-facing release fully verified.
2. `NEON_PUBLIC_READ_TOKEN` is present in Repository secrets per owner confirmation. Run the scheduled CMS workflow and verify the token is accepted, can read only eligible published public records, and cannot write data. Never paste the token into source control, logs, or chat.
3. After deployment, register the owner's account through the production workspace.
4. Bootstrap that exact user ID as the first platform administrator through a verified database procedure; do not create a privileged identity based on a guessed email.
5. Verify sign-in, workspace isolation, product publishing, public sitemap, scheduled CMS workflow, and video rendering in the production browser.
6. Review privacy, affiliate disclosure, tax/accounting rules, and applicable legal obligations before commercial launch.


## Release gate checklist

Use [docs/production-readiness-gates.md](docs/production-readiness-gates.md) as the evidence checklist for hosted deployment, Neon branch safety, workflow audit lifecycle, scheduled publishing prerequisites, and commercial-readiness exclusions. Record the exact commit SHA and workflow run URLs for each release.
