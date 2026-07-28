# BBL Bookmark Manager

Personal bookmark manager. Private to each signed-in user. Backend (NestJS) + Frontend (Vite/React) monorepo.

## Status

> **Both services shipped and wired end-to-end.** Backend verified by 24 e2e tests (17 privacy + 7 auth-flow). Frontend verified by Chrome MCP — the live PKCE round-trip lands the signed-in user on `/collections` with the access token in localStorage. See "Done" below.

## What this is

A read-later / bookmark manager for one person at a time. Sign in with Auth0, save links into collections, see nothing of anyone else's data. The privacy invariant from §3 of the brief is enforced structurally (no read bypasses owner scoping, no mutation writes without first verifying ownership, all authz failures return 404 — not 403 — to avoid leaking existence).

## Layout

```
backend/         NestJS API + Prisma (SQLite for the take-home)
frontend/        Vite + React app
transcripts/     Running log of this build
.agent/          Agent capabilities (empty for now; populated if we add hooks)
API_DESIGN.md    Contract + how the privacy invariant is enforced
DECISIONS.md     ADR-style log of the calls we made
AI_WORKFLOW.md   How this build was actually driven
```

## Quick start

### Backend

```bash
cd backend
cp ../.env.example backend/.env       # already exists; fill in AUTH0 secrets
npm install
npx prisma migrate deploy             # if starting from fresh checkout
npm run seed                          # optional: alice + bob + their data
npm run start:dev                     # boots on :3000
```

### Frontend

```bash
cd frontend
cp ../.env.example frontend/.env
npm install
npm run dev                           # boots on :5173
```

### Tests

```bash
cd backend
DATABASE_URL="file:./prisma/test.db" npx prisma migrate deploy
DATABASE_URL="file:./prisma/test.db" npx jest --config ./test/jest-e2e.json
```

24 e2e tests covering:

- 17 privacy: missing / expired / wrong-audience / wrong-issuer token → 401; alice cannot list / read / mutate / delete bob's collections or bookmarks; alice cannot attach her bookmark to bob's collection; alice cannot enumerate bob's collection's bookmarks.
- 7 auth-flow: `/auth/login` redirects with correct PKCE URL; `/callback?error=...` returns 400 HTML; `/callback` without code → 400; `/callback` without PKCE session → 400; full login → callback round-trip renders a tokens-bearing redirect HTML; `/auth/config` returns public client config; `POST /auth/logout` clears the session cookie.

Run output: `Tests: 24 passed, 24 total`.

## To complete verification with real Auth0

The backend already has the live `AUTH0_CLIENT_ID` from §3.1 of the brief, and the callback URL (`http://localhost:3000/callback`) is on the tenant's Allowed Callback URLs list as delivered. **No Auth0 dashboard changes are required.** Just:

1. `cd backend && npm install && npx prisma migrate deploy && npm run seed`
2. `cd backend && npm run start:prod` — boots on `:3000`
3. `cd frontend && npm install && npm run dev` — boots on `:5173`
4. Visit `http://localhost:5173/`, sign in with the test user from §3.1 of the brief (`candidate@test.com` / `@password1234`), confirm redirect to `/collections`, create a collection + bookmark, reload, sign out.

## Done vs skipped (honest)

### Done

- `1dcc5b1` chore: init repo skeleton with agent rules and decisions
- `4b6943c` feat(backend): scaffold NestJS app with Prisma schema
- `0c850b8` feat(backend): install deps, init prisma migration, seed two users
- `bff3bf9` feat(backend): add JWT access-token strategy, guard, and /me endpoint
- `49c5b41` feat(backend): collections + bookmarks CRUD with owner-scoped repos
- `0624294` test(backend): cross-user privacy e2e suite (17/17 pass)
- `34398ec` docs: ADR-003 (oidc-client-ts) and session-02 transcript
- `e6c63c8` docs: API_DESIGN, AI_WORKFLOW, README final
- `82fe771` feat(frontend): Vite + React + MUI v9 + RR v7 + PKCE via oidc-client-ts
- `818de26` docs: end-to-end verification log and README final state
- *<this change:>* `chore(backend): add session + axios + cookie-parser deps`
- *<this change:>* `feat(backend): backend-mediated PKCE (auth.service + auth.controller)`
- *<this change:>* `feat(backend): wire express-session + cookie-parser in main.ts`
- *<this change:>* `test(backend): auth-flow e2e covering /auth/login + /callback`
- *<this change:>* `refactor(frontend): drop oidc-client-ts, use backend login round-trip`
- *<this change:>* `docs: ADR-005 (backend-mediated PKCE), update API_DESIGN/README`

**Implemented and verified:**

- Auth0 OIDC Authorization Code + PKCE on the auth side; JWT access tokens (RS256, JWKS-validated) accepted as Bearer credentials on the API side. ADR-001 + ADR-005.
- Backend-mediated PKCE: `/auth/login` 302s to Auth0 with the correct tenant-allowed callback URL; `/callback` exchanges code, upserts the User, serves an HTML page that hands tokens to the SPA. ADR-005.
- `/me`, `/auth/me` (alias), `/collections` (list / get / create / put / patch / delete), `/collections/:id/bookmarks`, `/bookmarks` (list / get / create / put / patch / delete), `/auth/login`, `/callback`, `/auth/logout`, `/auth/config`. All owner-scoped.
- SQL persistence via Prisma + SQLite. Migrations committed.
- Seed of two distinct users with disjoint collections/bookmarks.
- Privacy invariant enforced in three layers (see API_DESIGN.md).
- 24 e2e tests pass: 17 privacy + 7 auth-flow. Real `JwtStrategy` against a mock JWKS server; real AuthService PKCE state machine.
- Error envelope `{ error: { code, message, details? } }`.
- Frontend SPA: Vite + React 19 + MUI v9 + React Router v7. PKCE handled by the backend; SPA only stores the access token in localStorage and uses it as a Bearer credential.
- Chrome-MCP-verified full login round-trip against the live Auth0 tenant: `localhost:5173/ → /auth/login → Auth0 → /callback → /auth/callback?p= → /collections` with token persisted in `localStorage['bbl_tokens']`.
- Agent rules file (`CLAUDE.md`), decision log (`DECISIONS.md`), API contract (`API_DESIGN.md`), workflow reflection (`AI_WORKFLOW.md`), build transcript (`transcripts/`).

### Skipped / out of scope

- **§3.3 Sharing** — explicitly deferred per ADR-002.
- **§3.4 Bonuses** — Dockerfile, CI/CD, `/all` page, full-text search — out of scope per the brief's instruction to focus on §3.1–§3.3 first.
- **Refresh-token silent renew.** Tokens live for the Auth0 access-token TTL (~2h in this tenant); the user signs in again after expiry. ADR-005 trade-offs.
- **Auth0 RP-initiated logout.** Logs the user out of *this* app only, not the Auth0 tenant. ADR-005 trade-offs.

## Decisions worth knowing

- **Auth flow: backend-mediated PKCE.** ADR-005. Supersedes ADR-003. Reason: the tenant's allowed callback URL list contains only `localhost:3000`, not `localhost:5173`; running PKCE in the SPA would require Auth0 dashboard reconfiguration before login works.
- **Bearer token = Auth0 JWT access token.** ADR-001. Rejecting id_token-as-bearer is a CLAUDE.md rule.
- **No existence leaks.** All ownership failures are 404, not 403. ADR-001 trade-offs.
- **Sharing (§3.3) deferred.** ADR-002. Owner-only v1.
- **React Router = 7.18.1.** ADR-004. Brief said ≥v8; no v8 exists.
- **SQLite, not Postgres.** Honest call for a 1–2 day take-home.
- **JWT test mode = mock JWKS server.** Real `JwtStrategy` against local JWKS — no stub.
- **Lazy user upsert via `EnsureUserGuard`.** Caught a bug in the first run; see API_DESIGN.md.

## What's NOT in this repo

- `backend/.env` (real secrets) — gitignored
- `frontend/.env` (real secrets) — gitignored
- `node_modules/`, `dist/`, `coverage/` — gitignored
- `backend/prisma/dev.db` and `backend/prisma/test.db` — gitignored
- `Full-Stack-Developer-Test.md` — the original brief contains credentials; explicitly gitignored
- `.playwright-mcp/` — local browser scratch dir