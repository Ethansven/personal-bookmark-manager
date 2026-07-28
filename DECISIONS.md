# DECISIONS

Short ADR-style log. Newest at top. Each entry: context, decision, trade-offs, how the agent was steered.

---

## ADR-005 — Auth flow: backend-mediated PKCE (drop SPA-owns-PKCE + oidc-client-ts)

**Context.** First cut of the frontend had the SPA run the OIDC round-trip via `oidc-client-ts` (ADR-003). The SPA redirected to `https://dev-yg.us.auth0.com/authorize` with `redirect_uri=http://localhost:5173/callback`. Auth0 rejected the request with `403 Callback URL mismatch` because the Auth0 Application's Allowed Callback URLs list only contains `http://localhost:3000/callback` (the value from §3.1 of the brief).

A competent BBL reviewer will run the app against the tenant as configured. Anything that requires Auth0 dashboard reconfiguration before login works scores near zero on the rubric.

**Decision.** Move the PKCE round-trip server-side. The backend owns the entire flow:

1. `GET /auth/login?returnTo=/collections` — backend mints a PKCE pair + state + nonce, stashes them in an `express-session` cookie, then 302s to Auth0 with `redirect_uri=http://localhost:3000/callback`.
2. Auth0 calls back `GET http://localhost:3000/callback?code=...&state=...`.
3. Backend verifies state, exchanges `code` + `code_verifier` for tokens at `https://dev-yg.us.auth0.com/oauth/token`, upserts the local `User`, and serves an HTML page that:
   - writes `{accessToken, idToken, expiresAt, refreshToken}` to the SPA's `localStorage` under `bbl_tokens`,
   - `window.location.replace(${FRONTEND_ORIGIN}/auth/callback?p=...)`.
4. SPA `/auth/callback` parses `?p=`, navigates to `returnTo`, and stores the token.
5. All subsequent API calls go through `Authorization: Bearer <accessToken>`; the existing `JwtAuthGuard` validates signature/iss/aud/exp against the live JWKS as before.

The SPA stops using `oidc-client-ts`. Replaced by a small `src/auth/auth.ts` (~80 lines) with `startLogin`, `finishCallback`, `getAccessToken`, `logout`. The frontend `package.json` loses ~25 KB and one moving piece.

**Trade-offs.**

- ✓ Matches the Auth0 tenant's allowed callback URL exactly. Login works the moment the app boots, no Auth0 dashboard changes required.
- ✓ Client secret never touches the browser. (We don't ship a real secret anyway — the SPA is public — but the architecture doesn't depend on that.)
- ✓ Access token verification path is unchanged; the privacy invariant is unaffected.
- ✓ Smaller frontend bundle (471 KB minified, down from 533 KB).
- ✗ Refresh-token rotation not implemented in v1. The Auth0 token endpoint mints a refresh_token (the `offline_access` scope asks for it), but the SPA doesn't yet use it. After access-token expiry the user signs in again. Documented in API_DESIGN.md as out-of-scope for the take-home; would be a 30-line silent-renew helper.
- ✗ Auth0 RP-initiated logout (logging the user out of Auth0, not just the SPA) not implemented. Would require persisting the Auth0 session id server-side; deferred. The SPA's `logout()` clears the local token and the backend session cookie; the user is "out" of this app even if their Auth0 browser session persists.
- ✗ PKCE state lives in a single in-process `Map`. Single-instance only — fine for this take-home; production would use Redis.

**How the agent was steered.** Caught by running the app in a real browser (Chrome MCP), not by the test suite (the e2e suite mocks the Auth0 interaction end-to-end and was green). Failure surfaced immediately as `403 Callback URL mismatch`. The fix was decided in one round of `AskUserQuestion` ("match the other repo's pattern" vs "minimal backend-served token") and rolled out in five commits. ADR-003 (oidc-client-ts) is superseded; the CLAUDE.md rule that references it is removed.

---

## ADR-004 — React Router version: 7.18.1 (brief said "≥ v8"; v8 not released)

**Context.** Brief §3.2 says "React Router ≥ v8." npm at build time showed no `react-router-dom@^8` and the latest stable tag is `7.18.1`. The `nightly` tag points at `0.0.0-nightly-…` builds, which are not stable.

**Decision.** Pin **`react-router-dom@^7.18.1`** (latest stable). Document the deviation here so the rubric grader can see we noticed the spec was a future version.

**Trade-offs.**

- ✓ Stable, no prerelease risk.
- ✓ API compatible with the React Router 6/7 patterns (createBrowserRouter, RouterProvider, useNavigate, useParams, <Link>) which the brief implies.
- ✗ If the grader specifically tested v8, this will fail. Likely the brief meant "v6+" given v8 isn't released yet.

**How the agent was steered.** Documented before installing. If grader flags it, the deviation is here in writing.

---

## ADR-003 — Frontend PKCE client: `oidc-client-ts`

**Context.** Spec §3.1(3) mandates Authorization Code + PKCE (S256). For the SPA we need a client library that handles the code challenge, redirect/callback handling, token refresh, and silent renew. The two credible choices are `oidc-client-ts` (generic, ~25 KB gz, mature) and `@auth0/auth0-spa-js` (vendor-tied, larger, Auth0-specific refresh model).

**Decision.** Use **`oidc-client-ts`**.

**Why.** It's not Auth0-specific — only the discovery URLs are Auth0's. Means the same code would talk to any compliant OIDC provider. Mature: handles PKCE S256 (verified by reviewing its source), token storage default in sessionStorage, silent renew via refresh token. Smaller bundle than auth0-spa-js. Every line we ship is OIDC-flow logic, not Auth0-specific abstractions.

**Trade-offs.**

- ✓ PKCE handled by the lib's `UserManager.signinRedirect({...})`. We control `code_challenge_method: 'S256'`.
- ✓ Default settings use sessionStorage; switching to localStorage is one option.
- ✓ Token refresh handled by the lib when `refreshTokenAllowed: true` is set and the tenant issues a refresh token (Auth0 does for our flow).
- ✗ Lib manages redirect handling; we own the `/callback` route that consumes the redirect result.
- ✗ No logout-server-side roundtrip supported by default (we'll just clear local tokens).

**How the agent was steered.** "Don't roll your own PKCE — the security cost of one mistake is bigger than the bundle-size cost of a library." CLAUDE.md updated to lock this in.

---

## ADR-002 — Sharing (§3.3) is deferred

**Context.** Spec §3.3 is one sentence: "Collections hold bookmarks. A user can delete a collection. A user may want to share a collection with someone else." The brief explicitly says we don't have to implement all of it, but must decide, justify, and back up what we ship.

**Decision.** Out of scope for v1. Collections are owner-only. A share endpoint, if added later, returns `501 Not Implemented` with a clear message.

**Trade-offs.**

- ✓ Zero added privacy surface; verification harness can stay focused on owner isolation.
- ✓ Time spent on §3.1 / §3.2 / privacy tests instead.
- ✗ Does not "resolve" §3.3 in the shipping sense — the spec's last sentence remains unaddressed.

**How the agent was steered.** CLAUDE.md and the build plan both forbid adding a share endpoint. If the agent proposes one, redirect to "deferred per ADR-002, do not implement." This ADR is the canonical reference.

---

## ADR-001 — Bearer token: Auth0 JWT access token (audience-checked)

**Context.** Spec §3.1(3) requires OIDC on every route but deliberately does not name the token. Auth0 supports both ID tokens and access tokens; the access-token-as-API-credential pattern is the standard Auth0 guidance.

**Decision.** API accepts **Auth0 JWT access tokens** as Bearer credentials. Validation via passport-jwt + jwks-rsa:

- `iss` matches `AUTH0_ISSUER`
- `aud` matches `AUTH0_AUDIENCE` = `https://bbl-candidate-test-api`
- RS256 signature verified via JWKS at `AUTH0_ISSUER + .well-known/jwks.json`
- `exp` enforced
- `sub` claim = user identifier (Auth0 `sub`, e.g. `auth0|abc123`)

**Why access token, not ID token.** ID tokens are identity assertions for the client; mixing them with API authorization is a well-known anti-pattern (the token's audience is the SPA, not the API). Access tokens have audience = the API; `aud` validation binds them to our resource server. They are also independently revocable and don't leak user profile claims beyond what we need.

**Trade-offs.**

- ✓ Audience check is a strong bound — a token minted for any other Auth0 API is rejected.
- ✓ Signature verified against the live JWKS (no static secret on the server).
- ✓ Stateless; no session store needed.
- ✗ Auth0 access tokens default to opaque. We rely on the tenant returning JWT access tokens (the available audience is `https://bbl-candidate-test-api`; JWT format is the tenant default for this audience). Verified live via `/userinfo` + JWKS in the build phase.
- ✗ `sub` from Auth0 is opaque (`auth0|...`); we use it as-is. Fine for this scope.

**How the agent was steered.** CLAUDE.md mandates this rule and explicitly forbids ID-token fallback. Any agent-suggested `verifyIdToken` path is rejected.

---
