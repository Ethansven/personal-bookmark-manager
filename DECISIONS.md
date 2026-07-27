# DECISIONS

Short ADR-style log. Newest at top. Each entry: context, decision, trade-offs, how the agent was steered.

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
