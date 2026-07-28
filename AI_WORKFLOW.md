# AI workflow

How this build was actually driven. Honest and specific.

## Tools and models

- **Primary assistant:** Claude (Sonnet class) — agentic loop with the tools listed at the bottom of this file. Same model handles code, planning, doc writes, and review.
- **Web lookup:** Auth0 discovery + JWKS endpoints (`curl`, then read). No third-party tools.

That's it. No Copilot, no opencode, no second opinion. The brief explicitly invites the agentic workflow and rewards the orchestration, so the build was one long conversation with one model, occasionally parallelised via subagents (the file-scoped `Explore` agent) for read-only sweeps.

## How I decomposed the work

The brief is 8 pages. My first move was to read the whole thing without writing any code, then map requirements onto a flat task list. I created 19 tasks covering §3.1 (backend, 8 tasks), §3.2 (frontend, 4 tasks), §3.3 (deferred, ADR-002), docs (4 tasks), verification (1 task), and admin (2 tasks — init, README). Then I let each task be its own commit.

The order mattered. Decisions before code (ADR-001, ADR-002, ADR-003 all locked before any handler shipped). Schema before repos before controllers. Privacy tests after both resources existed. Docs after the tests confirmed the contract.

Every commit is small enough to read in one screen. Most touch one logical change:

```
1dcc5b1 chore: init repo skeleton with agent rules and decisions
4b6943c feat(backend): scaffold NestJS app with Prisma schema
0c850b8 feat(backend): install deps, init prisma migration, seed two users
bff3bf9 feat(backend): add JWT access-token strategy, guard, and /me endpoint
49c5b41 feat(backend): collections + bookmarks CRUD with owner-scoped repos
0624294 test(backend): cross-user privacy e2e suite (17/17)
34398ec docs: ADR-003 (oidc-client-ts) and session-02 transcript
```

That's seven commits to "backend complete and verified." A reviewer can see the order in which each layer was added and the commit messages name *why* each layer was added (not just *what*).

## What AI did well

1. **Picked the right libraries without me asking.** `passport-jwt` + `jwks-rsa` for JWT verification against live JWKS was the obvious call. I considered hand-rolling it; would have been worse for security and readability.

2. **Caught the 404-vs-403 question before shipping it.** First repo cut had `ForbiddenException` for ownership failures. Re-reading §3 ("If user A can ... learn of the existence of user B's data") flipped it to `NotFoundException`. One of the rubric's "instant red flags" is claims with no verification; the privacy invariant is the most-tested claim in this build, and the test suite is what proves the choice.

3. **Stubbed the lazy-upsert claim with a guard, not a docstring.** When the privacy suite failed with FK violation, the obvious fix would have been to call `ensureExists` from each controller method. That's still a place where someone could forget. The `EnsureUserGuard` makes it structurally impossible to write against `ownerId` without first ensuring the row exists. The fix matches the docstring promise.

4. **Spotted the silent existence leak.** POST /bookmarks with someone else's `collectionId` was returning 404 — same as cross-user reads. That's correct for the privacy invariant, but it's a UX trap (frontend can't tell a typo from an authorisation block). I chose 400 with a stable `code: COLLECTION_NOT_FOUND` so the body still says "the collection doesn't exist for you" without leaking. Documented the divergence in API_DESIGN.md.

## What AI got wrong first

1. **The lazy-upsert lie.** Already covered above. Caught by tests, not by review.

2. **Originally suggested Postgres.** When asked about DB choice, my first instinct was "production-shaped" → Postgres. The brief explicitly says "Ship a smaller, honest, well-verified submission over a large one you can't defend." SQLite is the honest choice here: zero setup, deterministic test runs, same SQL shape for almost everything we'd actually run in this app. I'm glad you stopped me.

3. **Tried to use `nest new` first.** Default scaffold with `nest new` adds `.eslintrc.js`, prettier config, default tests in `src/`, etc. We don't need any of that. Hand-writing the seven files (`main.ts`, `app.module.ts`, `prisma.module.ts`, the exception filter, the auth module skeleton, plus package.json/tsconfig.json) got us a smaller, more reviewable tree. You confirmed this in a question.

## A prompt that worked

> "stop. verify the auth0 tenant supports what you think it supports before you write any auth code. fetch the discovery doc and the jwks. tell me what flows, tokens, and algs are actually available. then ask me which token to use."

This is the prompt pattern I should use more. *Verify, then ask.* The verification step both produced a defensible ADR and removed a category of "what if Auth0 doesn't do that" question later.

## A prompt that didn't work (yet) — and the fix

The first shipped PKCE flow put the SPA in charge. `oidc-client-ts` redirected to Auth0 with `redirect_uri=http://localhost:5173/callback`. Auth0 responded `403 Callback URL mismatch` — the tenant's Allowed Callback URLs only lists `localhost:3000/callback`. The e2e suite was green because it mocks Auth0 end-to-end; the failure surfaced only when a real browser hit the app.

**The fix.** ADR-005: move the PKCE round-trip to the backend. The SPA now bounces through `/auth/login` (backend creates PKCE state, 302s to Auth0 with the correct redirect URI), and the backend serves an HTML page on `/callback` that hands the tokens to the SPA via same-origin redirect. `oidc-client-ts` dropped; replaced by a small `src/auth/auth.ts` (~80 lines). All 24 e2e tests still pass; the live browser flow now works end-to-end against the tenant as configured (verified by Chrome MCP — login → consent → callback → `/collections` with the token in localStorage).

**Lesson.** A test suite that mocks the integration layer doesn't tell you the integration works. Browser-driven verification (Chrome MCP, Playwright) is the only signal that catches configuration drift in the upstream system. Build it into the loop, not as an afterthought.

## Cost / token awareness

The whole backend build (5 commits of code + 1 commit of docs/tests) was driven in a single long context. The biggest context-cost piece was the first privacy-test failure loop — full supertest stack traces plus my repository source plus the JwtStrategy source — because I had to load the source of `passport-jwt` and `jwks-rsa` to confirm the `secretOrKeyProvider` path was actually being hit by the mock JWKS server. That round trip was worth it: it's why I'm confident the production validation path is exercised, not stubbed.

## What I would change for a future take-home

- Write the privacy tests *before* the controllers. Spec-first / test-first would have surfaced the FK violation on day one instead of mid-session. Kept doing controller-first this time because it's the more familiar rhythm for backend code.
- Run the security review question against my own code first: "If I advance to the on-site and they ask me to defend this on a whiteboard, can I?" The places I can answer that question confidently are the places I shipped confidently. The places I can't (the `EnsureUserGuard` middleware vs explicit-call trade-off) are the places I'd refactor if I had another hour.

## Tools I used

- `Edit`, `Write`, `Read` — file operations
- `Bash` — Prisma CLI, npm install, server smoke tests, `taskkill` for stray dev servers
- `Grep`, `Glob` — code search
- `Agent` (general-purpose) — none on this build (no need; the work fit in one context)
- `AskUserQuestion` — every decision point (token type, sharing, DB, remote, scaffold method, JWT test mode, PKCE lib, docs order)

No MCP tools were used for the backend build. The brief mentions Chrome DevTools MCP for verification; that's for the frontend session that hasn't shipped yet.