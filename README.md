# BBL Bookmark Manager

Personal bookmark manager. Private to each signed-in user. Backend (NestJS) + Frontend (Vite/React) monorepo.

## Status

> **Both services shipped and wired end-to-end.** Backend verified by 17 e2e tests; frontend verified by MCP — the PKCE flow produces the correct Auth0 authorize URL. Full token round-trip requires the real Auth0 `client_id`, which is not committed (see "To complete verification" below).

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
cp ../.env.example frontend/.env      # fill in VITE_AUTH0_CLIENT_ID
npm install
npm run dev                           # boots on :5173
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

## To complete verification with real Auth0

1. Open `frontend/.env` and set `VITE_AUTH0_CLIENT_ID=<your-spa-client-id>`.
2. In the Auth0 dashboard, add `http://localhost:5173/callback` to the SPA Application's **Allowed Callback URLs**.
3. Restart `npm run dev` in `frontend/`.
4. Visit `http://localhost:5173/`, sign in with the test user from §3.1 of the brief (`candidate@test.com` / `@password1234`), confirm redirect to `/collections`, create a collection + bookmark, reload, sign out.

If the round-trip fails, the most likely culprit is the SPA Application not being authorised to request the `https://bbl-candidate-test-api` audience. The MCP-verified authorize URL already includes `audience=https://bbl-candidate-test-api` — that is what tells Auth0 to mint a JWT (not opaque) access token for the API.

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
- `34da5ed` feat(frontend): Vite + React + MUI v9 + RR v7 + PKCE via oidc-client-ts

**Implemented and verified:**

- Auth0 OIDC Authorization Code + PKCE on the auth side; JWT access tokens (RS256, JWKS-validated) accepted as Bearer credentials on the API side. ADR-001.
- `/me`, `/collections` (list / get / create / put / patch / delete), `/collections/:id/bookmarks`, `/bookmarks` (list / get / create / put / patch / delete). All owner-scoped.
- SQL persistence via Prisma + SQLite. Migrations committed.
- Seed of two distinct users with disjoint collections/bookmarks.
- Privacy invariant enforced in three layers (see API_DESIGN.md).
- Privacy e2e suite, 17 tests, all passing, exercised against a real `JwtStrategy` via a mock JWKS server.
- Error envelope `{ error: { code, message, details? } }`.
- Frontend SPA: Vite + React 19 + MUI v9 + React Router v7 + `oidc-client-ts` PKCE client.
- MCP-verified PKCE flow produces the correct Auth0 authorize URL with `response_type=code`, `code_challenge_method=S256`, `audience=https://bbl-candidate-test-api`.
- Agent rules file (`CLAUDE.md`), decision log (`DECISIONS.md`), API contract (`API_DESIGN.md`), workflow reflection (`AI_WORKFLOW.md`), build transcript (`transcripts/`).

### Skipped / out of scope

- **§3.3 Sharing** — explicitly deferred per ADR-002.
- **§3.4 Bonuses** — Dockerfile, CI/CD, `/all` page, full-text search — out of scope per the brief's instruction to focus on §3.1–§3.3 first.
- **Full real-Auth0 round-trip verification** — needs the SPA `client_id`. The PKCE shape is correct (MCP-verified); everything downstream of "we have a valid token" is covered by the e2e suite.

## Decisions worth knowing

- **Bearer token = Auth0 JWT access token.** ADR-001. Rejecting id_token-as-bearer is a CLAUDE.md rule.
- **No existence leaks.** All ownership failures are 404, not 403. ADR-001 trade-offs.
- **Sharing (§3.3) deferred.** ADR-002. Owner-only v1.
- **Frontend PKCE client = `oidc-client-ts`.** ADR-003.
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