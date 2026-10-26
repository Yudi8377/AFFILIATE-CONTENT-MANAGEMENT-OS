# Lessons From Related Projects

This document records reusable engineering lessons from related work. It does not copy their runtime dependencies or assume their services are allowed in this project.

## NUSA-DESAIN

Useful lessons: use a language and stack with a single documented build path; distinguish a local UI demo from persisted production data; do not describe AI image/video generation as connected until a real API request and resulting asset are verified; and make schema migrations explicit. Its prior Neon Auth/JWT troubleshooting is a warning to test the complete sign-in, token, cookie/session, protected API, and sign-out lifecycle before opening protected dashboards.

Do not import NUSA's database schema or assume its deployment configuration fits this product.

## ASURANSI-INTELIGEN-OS

Useful lessons: the dashboard is not the security boundary; authorization must be enforced at the trusted data/API layer. Use deny-by-default access, tenant isolation, audit trails, secret hygiene, and human approval for sensitive financial or administrative operations. Demo data must be clearly marked and must not be mixed with production records.

Do not import insurance-specific workflows or claim a security certification based on configuration alone.

## AGENT-OS

Useful lessons: keep agent orchestration, tool registry, policy checks, workflow state, evaluation, and auditability explicit. A model API key is a real dependency and may cost money; a configured agent interface does not prove that model generation or safe tool execution is operational. Agents need bounded permissions, input/output schemas, and tests.

Do not reuse AGENT-OS's Supabase dependency because this project is constrained to GitHub and Neon.

## GRC-E-commerce

Useful lessons: a static GitHub Pages website can deliver public product and editorial content at Rp0, and local/rule-based experiences can remain useful without cloud AI. However, static-only storage does not provide shared, secure multi-user persistence or a trusted backend for private credentials. Treat those as explicit architecture gates rather than hiding the limitation.

## Cross-project rules adopted here

- No migration on production before development-branch validation and explicit review.
- No credential in frontend or repository.
- No authentication integration declared working until a browser-to-database smoke test proves it.
- No empty menu advertised as an operational module.
- No provider marked available without an API smoke test, rights/quota review, and secret-safe runtime.
- No feature status elevated based on documentation or visual appearance alone.
