# Runtime and Verification Status

Updated: 2026-10-26.

## Verified directly

- Neon development branch: `dev-icda-baseline` (`br-morning-recipe-aov26ci2`), created as a child of the production branch.
- Neon Auth is provisioned on the development branch with email/password sign-up enabled and email verification not required for the current development configuration.
- Neon Data API is active on the development branch and exposes only the `public` schema to its API configuration.
- The health function deployment completed successfully on Neon Functions (`nodejs24`). Its endpoint is branch-scoped and has no database or AI generation routes.
- Core database schema and workspace-scoped row-level policies were applied on the development branch only.

## Not yet verified

- Public HTTPS invocation of the health function from an external CI runner. The GitHub Actions smoke test is intended to verify this.
- Successful browser sign-up/sign-in, token retrieval, workspace creation, and CRUD through Neon Data API.
- Positive-path and cross-workspace RLS tests using real authenticated sessions.
- Production branch schema/auth/data API changes. None have been made.
- Production GitHub Pages deployment and live SEO validation.
- AI model generation, image generation, video rendering, or provider availability.

## Safety decisions

- No database connection string or Neon API key is placed in the frontend.
- Development URLs are public endpoints, not credentials; they must be replaced with production-branch URLs before any production release.
- No AI gateway or external AI provider is activated because cost and free commercial quota are not yet verified.
- License entitlements can be read by workspace owners/admins but are not writable from browser clients yet.
- Audit records are not writable directly from browser clients yet.
- Agent run records may be created as queued work but cannot be marked successful by the browser client.
