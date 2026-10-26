# Production Readiness Gates

This checklist separates code/CI evidence from platform configuration and live operational evidence. A green build is not proof that the product is live or commercially ready.

## Current release boundary

- [ ] Pull request #1 reviewed and intentionally approved before merge.
- [ ] GitHub Pages is enabled for this repository and configured to deploy with GitHub Actions.
- [ ] The published website and workspace URLs return the expected build; no deployment claim before checking the actual URLs.
- [ ] Neon development migration `0004_agent_run_lifecycle.sql` is verified on the development branch.
- [ ] Production schema is compared with the migration set before any production migration is approved.
- [ ] The scheduled CMS publishing workflow has a least-privilege `NEON_PUBLIC_READ_TOKEN` configured, or the workflow remains disabled/fails closed.
- [ ] Authentication, workspace membership, and row-level access tests pass against the intended deployment configuration.
- [ ] A human owner reviews workflow output before publication; local deterministic agents must not be described as external generative AI.

## Verification steps

### 1. GitHub Actions and hosted UI

1. Confirm the latest PR head SHA and require all required CI workflows to pass on that exact SHA.
2. Enable GitHub Pages under **Settings → Pages** and select **GitHub Actions** as the build/deployment source.
3. Confirm the Pages deployment workflow completes successfully.
4. Open the public homepage and workspace URL in a private browser window. Check navigation, asset loading, responsive layout, and console/network errors.
5. Confirm the workspace refuses to operate if Neon Auth or Data API URLs are absent or incorrect.

### 2. Neon branch safety

- Development branch: `br-morning-recipe-aov26ci2`.
- Production branch: `br-noisy-snow-aoosguyk`.
- Project: `holy-block-61637276`.

Before any production migration, compare the applied schema and policies against the checked-in migration sequence. Do not infer production readiness from development-only policy checks. Apply migrations only after a reviewed release decision and a recovery/rollback plan.

### 3. Agent run audit lifecycle

- Create only a minimal audit record; do not persist raw prompts, source documents, or generated copy in the audit record.
- A workflow is labelled `needs_review` until a human reviews it; failures remain explicit.
- `provider_status=unverified` and `externalModelUsed=false` are intentional for deterministic local workflows.
- Validate workspace isolation and requester identity under the authenticated Data API role.
- A successful insert/finalize smoke test proves the tested branch and role only; it is not proof of production behavior.

### 4. Scheduled publication prerequisites

The scheduled publisher must fail closed if the public-read token is missing or invalid. Configure only a read-only token with the minimum required scope. Then test:
- missing token → no publication and a clear failure;
- invalid token → no publication;
- valid token → only eligible, reviewed records are emitted;
- unpublished/private records remain private;
- generated output includes canonical URLs and affiliate disclosures where required.

### 5. Commercial-readiness exclusions

Do not advertise these as production features until implemented and tested: external generative AI, voice generation, server-side media storage, social-network publishing, measured SEO search volume/difficulty integrations, final accounting posting, payroll payment, or compliance certification.

## Release evidence log

For each release, record the commit SHA, workflow run URLs, tested public URL, Neon branch, migration identifiers, manual test results, unresolved risks, and reviewer. Keep secrets out of this log.
