# BBL Bookmark Manager

Personal bookmark manager. Private to each signed-in user. Backend (NestJS) + Frontend (Vite/React) monorepo.

> **Status: backend complete (Task 9 of 19). Frontend and end-to-end verification still pending — see "Done vs skipped" below for an honest scope statement.**

## What this is

A read-later / bookmark manager for one person at a time. Sign in with Auth0, save links into collections, see nothing of anyone else's data. The privacy invariant from §3 of the brief is enforced structurally (no read bypasses owner scoping, no mutation writes without first verifying ownership, all authz failures return 404 — not 403 — to avoid leaking existence).

## Layout

```
backend/         NestJS API + Prisma (SQLite for the take-home)
frontend/        Vite + React app (not started yet)
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
npm install                            # already done in this repo
npx prisma migrate deploy              # if you're starting from a fresh checkout
npm run seed                           # optional: alice + bob + their data
npm run start:dev                      # boots on :3000
```

### Frontend

```bash
cd frontend                            # not yet created
npm install
npm run dev                            # boots on :5173
```

### Tests

```bash
cd backend
DATABASE_URL="file:./prisma/test.db" npx prisma migrate deploy
DATABASE_URL="file:./prisma/test.db" npx jest --config ./test/jest-e2e.json
```

17 e2e tests covering:

- missing / expired / wrong-audience / wrong-issuer token → 401
- alice cannot list / read / mutate / delete bob's collections or bookmarks
- alice cannot attach her bookmark to bob's collection
- alice cannot enumerate bob's collection's bookmarks

Run output: `Tests: 17 passed, 17 total`.

## Done vs skipped (honest)

### Done

- `1dcc5b1` chore: init repo skeleton with agent rules and decisions
- `4b6943c` feat(backend): scaffold NestJS app with Prisma schema
- `0c850b8` feat(backend): install deps, init prisma migration, seed two users
- `bff3bf9` feat(backend): add JWT access-token strategy, guard, and /me endpoint
- `49c5b41` feat(backend): collections + bookmarks CRUD with owner-scoped repos
- `0624294` test(backend): cross-user privacy e2e suite (17/17 pass)
- `34398ec` docs: ADR-003 (oidc-client-ts) and session-02 transcript

**Implemented and verified:**

- Auth0 OIDC Authorization Code + PKCE on the auth side; JWT access tokens (RS256, JWKS-validated) accepted as Bearer credentials on the API side. ADR-001.
- `/me`, `/collections` (list / get / create / put / patch / delete), `/collections/:id/bookmarks`, `/bookmarks` (list / get / create / put / patch / delete). All owner-scoped.
- SQL persistence via Prisma + SQLite. Migrations committed.
- Seed of two distinct users (`alice@test.local`, `bob@test.local`) with disjoint collections/bookmarks so privacy tests are meaningful.
- Privacy invariant enforced in three layers (see API_DESIGN.md).
- Privacy e2e suite, 17 tests, all passing, exercised against a real `JwtStrategy` via a mock JWKS server (not a stubbed strategy).
- Error envelope `{ error: { code, message, details? } }`.
- Agent rules file (`CLAUDE.md`), decision log (`DECISIONS.md`), API contract (`API_DESIGN.md`), workflow reflection (`AI_WORKFLOW.md`), build transcript (`transcripts/`).

### Skipped / out of scope

- **Frontend (`/frontend` directory)** — not started. Vite + React + MUI v9 + React Router v8 + `oidc-client-ts` was the chosen stack (ADR-003). The build order in CLAUDE.md picks this up next.
- **End-to-end Chrome DevTools MCP verification** — depends on the frontend existing. Plan calls for it once the SPA boots and signs in against the real Auth0 tenant.
- **§3.3 Sharing** — explicitly deferred per ADR-002. A share endpoint, if added later, returns 501.
- **§3.4 Bonuses** — Dockerfile, CI/CD, `/all` page, full-text search. Out of scope until §3.1–§3.3 are solid and verified.

## Decisions worth knowing

- **Bearer token = Auth0 JWT access token.** Verified live against the tenant's JWKS. ADR-001. Rejecting id_token-as-bearer is a CLAUDE.md rule.
- **No existence leaks.** All ownership failures are 404, not 403. ADR-001 trade-offs.
- **Sharing (§3.3) deferred.** ADR-002. Owner-only v1.
- **Frontend PKCE client = `oidc-client-ts`.** ADR-003. Not hand-rolled, not vendor-tied.
- **SQLite, not Postgres.** Brief says ship smaller + honest. SQLite is the honest call for a 1–2 day take-home.
- **JWT test mode = mock JWKS server.** Real `JwtStrategy` exercises signature / iss / aud / exp against a local JWKS endpoint. No strategy stub.
- **Lazy user upsert via `EnsureUserGuard`.** First authenticated request provisions the local `User` row so `Collection/Bookmark` FK targets always exist. Caught a bug in the first run; see API_DESIGN.md "things the agent got wrong first."

## What's NOT in this repo

- `backend/.env` (real secrets) — gitignored
- `frontend/.env` (real secrets) — gitignored once the frontend exists
- `node_modules/`, `dist/`, `coverage/` — gitignored
- `backend/prisma/dev.db` and `backend/prisma/test.db` — gitignored
- `Full-Stack-Developer-Test.md` — the original brief contains credentials; explicitly gitignored