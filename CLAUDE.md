# Agent rules — BBL bookmark manager

These rules are for any agent (Claude Code, Codex, Copilot, opencode) working in this repo. Read this before touching code.

## What this project is

A personal bookmark manager. Two services:

- `/backend` — NestJS + TypeScript + Prisma (SQL)
- `/frontend` — Vite + React + TypeScript + MUI v9 + React Router v8

Auth: Auth0 OIDC Authorization Code + PKCE (S256). API audience `https://bbl-candidate-test-api`.

## The privacy invariant (NON-NEGOTIABLE)

> Everything in this app is private to the person who created it. If user A can see, edit, or even learn of the existence of user B's data, the app is broken.

Implications for every change:

1. Every read query MUST filter by `ownerId` (or use a repo helper that does).
2. Every mutation MUST verify ownership BEFORE applying. Return **404** (not 403) when the resource exists but belongs to someone else — never leak existence.
3. The `/me` endpoint is the only way to discover "the current user." Never trust a userId from request body for authz.
4. Tests must prove this with at least two seeded users; one user attempting any operation on the other's resource must fail.

## Bearer token policy

The API accepts **Auth0 JWT access tokens** as Bearer credentials. The JWT strategy MUST validate:

- `iss` matches `AUTH0_ISSUER`
- `aud` matches `AUTH0_AUDIENCE` (`https://bbl-candidate-test-api`)
- signature via JWKS (RS256)
- `exp` not expired
- `sub` is the user identifier

ID tokens are NOT accepted as Bearer credentials. Do not "fall back" to id_token.

## Frontend auth

The backend runs the entire OIDC PKCE round-trip — see ADR-005. The SPA never speaks to Auth0 directly. Tokens live in `localStorage['bbl_tokens']` (key shape documented in `API_DESIGN.md`) and are sent as `Authorization: Bearer <accessToken>` on every API call.

Don't roll your own PKCE. Don't add a client secret to the browser bundle. Don't drop the existing `JwtAuthGuard` validation — iss/aud/signature/exp still gate every protected route.

## Sharing (§3.3)

**Deferred.** See DECISIONS.md. Do not implement any share endpoint. If you find yourself adding one, stop.

## Optional bonuses

Not in scope. Skip unless §3.1–§3.3 are solid and verified.

## Conventions

- TypeScript strict on both services.
- Conventional Commits for every commit (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`).
- Commits are small. Each commit does one thing. If your diff touches auth + schema + UI in one commit, split it.
- No secrets in commits. `.env`, `.env.*`, `*.db`, `node_modules`, `dist` are gitignored. Reference values via `.env.example` only.
- DTOs validated with `class-validator`. Errors return a consistent shape: `{ error: { code, message, details? } }`.
- Backend uses NestJS modules per resource. Repos encapsulate Prisma calls and enforce owner scoping so handlers can't accidentally bypass it.

## Readability & maintainability

Code must read like something you can defend on-site without rereading it. Concretely:

- Small, single-purpose functions. If a function needs a comment to explain itself, split it first.
- No clever one-liners. Plain code that a stranger can scan wins over dense code that takes a minute to parse.
- Names describe intent, not implementation. `getCollectionsForCurrentUser`, not `query1`.
- Comments explain **why**, not what. The code shows what.
- Match surrounding style. If the file uses early returns, don't slip in nested `if`s.
- TypeScript types are part of the API. If you change a function signature, update its callers and the tests in the same commit.

## Build order (suggested)

1. `.gitignore` + `CLAUDE.md` + `.env.example` + `README.md` skeleton
2. `backend/` scaffold (NestJS)
3. Prisma schema + migration
4. Seed two users + their data
5. JWT auth guard + /me
6. Collections CRUD + nested bookmarks endpoint
7. Bookmarks CRUD
8. Cross-user privacy e2e tests
9. `frontend/` scaffold
10. PKCE login flow
11. /collections page
12. /bookmarks page
13. Docs: API_DESIGN.md, DECISIONS.md, AI_WORKFLOW.md
14. Verify via Chrome DevTools MCP
15. Final README "done vs skipped"

## Don't

- Don't auto-commit finished work. Commit small.
- Don't trust your own code. Run the tests.
- Don't leave a decision undocumented. Update DECISIONS.md in the same commit that implements it.
- Don't dump credentials into any file that gets committed. Even the test user's password belongs in `.env.example` as a placeholder.
