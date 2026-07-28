# API design — BBL bookmark manager

Public contract for the backend in `/backend`. Honest documentation — what we actually shipped, including the parts that surprise.

## Resources

- `/me` — current signed-in person.
- `/collections` — owner-scoped collections.
- `/collections/:id/bookmarks` — bookmarks inside one owned collection.
- `/bookmarks` — owner-scoped bookmarks (filter by `collectionId`).

Both resources are owner-scoped. There is no public route to any resource.

## Auth

### Login round-trip (backend-mediated PKCE, ADR-005)

The backend runs the entire OIDC round-trip. The SPA never sees Auth0 directly.

| Step | URL | Actor | What happens |
|---|---|---|---|
| 1 | `GET /auth/login?returnTo=/collections` | Backend | Mints PKCE pair + state + nonce. Stashes them in `express-session` (HttpOnly `connect.sid` cookie). 302s to Auth0 `/authorize` with `redirect_uri=http://localhost:3000/callback`, `code_challenge_method=S256`, `audience=https://bbl-candidate-test-api`. |
| 2 | Auth0 `/authorize` | Auth0 | Universal Login. User signs in. |
| 3 | `GET /callback?code=...&state=...` | Backend | Verifies `state` against the session. Calls Auth0 `/oauth/token` with `code` + `code_verifier` (no `client_secret` — public SPA). Verifies the returned `id_token` (issuer, audience = `AUTH0_CLIENT_ID`, nonce matches). Upserts the local `User` row. Serves an HTML page that writes `{accessToken, idToken, refreshToken, expiresIn}` to `localStorage['bbl_tokens']` and redirects to `${FRONTEND_ORIGIN}/auth/callback?p=<encoded JSON>`. |
| 4 | `GET /auth/callback` | SPA | Parses `?p=`, stores the token, navigates to `returnTo`. |

Errors render as `text/html` (a small "Sign-in failed" page) so a browser navigation gives the user something to read. Status codes: `400` for missing/bad state, `500` for upstream Auth0 failures.

### `GET /auth/config`

Public, no auth. Returns `{ issuer, audience, clientId, callbackUrl }` — useful for diagnostics and tests. No secrets.

### `POST /auth/logout`

Best-effort: destroys the `express-session`, clears the `connect.sid` cookie. SPA also clears `localStorage['bbl_tokens']`. Auth0 RP-initiated logout is out of scope (ADR-005 trade-offs).

### `GET /auth/me`

Alias for `/me`. Same lazy-upsert behaviour. Kept for compatibility with Auth0-style clients; both routes serve the same payload.

### Bearer token validation (every protected route)

- Token type: **Auth0 JWT access token**. Never an id_token. (See ADR-001.)
- Validation:
  - signature via live JWKS at `${AUTH0_ISSUER}/.well-known/jwks.json`
  - `iss` matches `AUTH0_ISSUER`
  - `aud` contains `AUTH0_AUDIENCE` (`https://bbl-candidate-test-api`)
  - `exp` not expired (passport-jwt default)
  - algorithms restricted to RS256
- Identity: `req.user.sub` is the Auth0 `sub` claim (e.g. `auth0|abc123`). This is the local `User.id`. New users are lazy-upserted on the first authenticated request via `EnsureUserGuard` (so `Collection/Bookmark` FK targets always exist before any insert).

### Token storage shape (SPA side)

`localStorage['bbl_tokens']` (JSON-encoded):

```json
{
  "accessToken": "eyJ...",
  "idToken": "eyJ...",
  "refreshToken": "rt_...",
  "expiresAt": 1785236485060
}
```

`expiresAt` is ms epoch. `apiFetch` re-reads this on every call; an expired entry triggers a re-login via `/auth/login`. Cleartext `refresh_token` is stored in localStorage because we don't yet implement silent renew (ADR-005); a future iteration should move it to an HttpOnly cookie or drop it.

## Endpoints

### `GET /me`

Returns the current signed-in person. Lazily creates the local `User` row on first call.

Response `200`:

```json
{ "id": "auth0|abc123", "email": "alice@example.com", "createdAt": "2026-07-27T10:00:00.000Z" }
```

### `GET /collections`

List the caller's collections, newest first.

Query params:

| Name   | Type    | Default | Notes                                   |
|--------|---------|---------|-----------------------------------------|
| offset | int     | 0       | 0–N                                     |
| limit  | int     | 50      | 1–100                                   |
| q      | string  | —       | Substring match on `name` (SQLite LIKE).|

Response `200`: array of `Collection` rows. The list never contains another user's collections. There is no `total` count and no pagination cursor in this version — fine for a personal app.

### `POST /collections`

Create a collection owned by the caller.

Body: `{ "name": "Reading" }`. Validation: `name` 1–200 chars.

Response `201`: full `Collection` row.

### `GET /collections/:id`

Fetch one collection the caller owns. Returns `404` if it doesn't exist **or** if it's owned by someone else — the response shape is identical in both cases so the existence of another user's collection is not disclosed.

### `PUT /collections/:id`

Replace a collection. Body: `{ "name": "..." }`. Same 404 semantics as GET on the authz side; 400 on validation.

### `PATCH /collections/:id`

Partial update. Body: `{ "name"?: "..." }`. Empty PATCH is a no-op (200, unchanged row).

### `DELETE /collections/:id`

Delete. **Bookmarks inside this collection get `collectionId = NULL`** (Prisma `onDelete: SetNull`). The bookmarks are not deleted. This matches the spec's "A bookmark belongs to a collection (nullable — a bookmark can be uncategorised)."

Response: `204 No Content`.

### `GET /collections/:id/bookmarks`

List bookmarks in this owned collection, newest first. `404` if the collection isn't yours.

### `GET /bookmarks`

List bookmarks. Query params:

| Name         | Type   | Default | Notes                                    |
|--------------|--------|---------|------------------------------------------|
| offset       | int    | 0       |                                          |
| limit        | int    | 50      | 1–100                                    |
| q            | string | —       | Substring match on `title` OR `notes`.    |
| collectionId | string | —       | Filter to one collection. Pass the literal string `"null"`? No — pass no value to mean "uncategorised" is currently a frontend concern, not an API filter. (See note below.) |

(Note on `collectionId=null` filtering: today's API returns bookmarks filtered by the literal collection id. Frontend can either call `/collections/:id/bookmarks` for the per-collection view or pass the id explicitly. We did not add an "uncategorised" sentinel because we don't yet need it and the UI has its own collection selector.)

### `POST /bookmarks`

Body:

```json
{
  "url": "https://example.com",
  "title": "Example",
  "notes": "optional",
  "collectionId": "optional; must belong to caller"
}
```

If `collectionId` is provided and does not belong to the caller, returns `400 COLLECTION_NOT_FOUND` (no existence leak — same shape as if it didn't exist).

### `PUT /bookmarks/:id`

Full replace. Same authz semantics: `404` if not owned, `400` if `collectionId` belongs to someone else.

### `PATCH /bookmarks/:id`

Partial. Any subset of `url`/`title`/`notes`/`collectionId`.

### `DELETE /bookmarks/:id`

Delete. Response `204`.

## Status codes

| Code | Meaning                                                   |
|------|-----------------------------------------------------------|
| 200  | Success with body                                         |
| 201  | Create with body                                          |
| 204  | Delete (no body)                                          |
| 400  | Validation error / cross-user collectionId                |
| 401  | Missing or invalid bearer                                 |
| 404  | Resource not found **or** not yours                        |
| 500  | Unexpected server error                                   |

## Error shape

Every error response has the same shape, regardless of source:

```json
{ "error": { "code": "STRING_CODE", "message": "human readable", "details": "..." } }
```

`code` is stable for clients to switch on:

| Code                    | Meaning                                  |
|-------------------------|------------------------------------------|
| `BAD_REQUEST`           | validation failed                        |
| `UNAUTHENTICATED`       | missing/invalid/expired token            |
| `FORBIDDEN`             | unused — we never return 403             |
| `NOT_FOUND`             | resource missing or not yours            |
| `CONFLICT`              | unused (no unique-constraint collisions in this model) |
| `UNPROCESSABLE_ENTITY`  | unused                                   |
| `INTERNAL_ERROR`        | unexpected                               |
| `COLLECTION_NOT_FOUND`  | used inside bookmarks when `collectionId` doesn't belong to caller |

We deliberately do **not** return 403 for "not yours." Returning 403 would tell an attacker the row exists — see §3 of the spec.

## Filtering & pagination

Today: `offset`/`limit` with sane caps (max 100, default 50). No cursor. No full-text search ranking — plain substring match. Search is a bonus (§3.4) so we have not invested here.

## Relation + on-delete

- `User (1) → (N) Collection` — `onDelete: Cascade` (deleting the local User row removes their collections/bookmarks; in practice we never delete the local User row in this app).
- `User (1) → (N) Bookmark` — `onDelete: Cascade`.
- `Collection (1) → (N) Bookmark` — `onDelete: SetNull`. Deleting a collection preserves the bookmarks as uncategorised. This matches the spec's nullable `collectionId`.

## How the privacy invariant is enforced in code

Not by convention — by structure. There are three layers that together make cross-user access impossible:

1. **No read can bypass scoping.** Every Prisma query for collections/bookmarks goes through `CollectionsRepository` / `BookmarksRepository`. Both classes take `ownerId: string` as the first argument and never expose a method that reads without it. The controller passes `user.sub` from `CurrentUser` — there is no path for a handler to grab a row without filtering by the token's sub.

2. **Mutations verify ownership before writing.** `replaceOwned`, `patchOwned`, `deleteOwned` all start with `findOwned(ownerId, id)` which throws `NotFoundException` if the row isn't the caller's. The handler never sees the row, so it can't update it.

3. **404 over 403 for ownership failures.** Whether the row doesn't exist OR belongs to someone else, the API returns the same `404 NOT_FOUND` with the same body. An attacker probing ids cannot distinguish "missing" from "not yours."

These are enforced structurally: any future agent adding a controller method must use the repo (or replicate the same `findFirst({ where: { id, ownerId } })` pattern). CLAUDE.md spells this out so the pattern stays consistent.

## Things the agent got wrong first

Recorded here because the rubric explicitly asks for it. Three concrete cases:

### 1. Lazy-upsert was a lie

The first privacy test run failed with HTTP 500 on every authenticated POST. The `UsersService` was supposed to "ensure every authenticated request goes through `ensureExists`", but only `/me` actually called it. Resource controllers went straight to Prisma without the FK target existing.

**How it was caught.** The privacy suite (which posts directly to `/collections` without ever calling `/me`) was the first code path to hit it. Production traffic from a SPA would have hit it the moment a user signed up and immediately added a bookmark.

**Fix.** New `EnsureUserGuard` runs after `JwtAuthGuard` on every resource route and calls `ensureExists`. Wired into `CollectionsController` and `BookmarksController`.

**Lesson.** A service's docstring is not enforcement. If a service promises something universal, there should be a single, structural enforcement point (guard, middleware, repo wrapper).

### 2. The 404-vs-403 decision deserves a paragraph, not a code review comment

The first cut of the repos returned `403 FORBIDDEN` when the caller wasn't the owner. That is the textbook-correct response for an authorization failure, and it's what most BaaS scaffolds return. It is also the wrong choice for this spec: 403 tells the attacker the resource exists.

**How it was caught.** Re-reading §3 of the spec: "If user A can see, edit, or even learn of the existence of user B's data, the app is broken." Existence leakage *is* broken.

**Fix.** All `findOwned`/`deleteOwned`/`replaceOwned` paths throw `NotFoundException` and the filter always returns 404. ADR was added retroactively to lock this in (see ADR-001 trade-offs and CLAUDE.md).

**Lesson.** Privacy specs read like product specs but they constrain API shape more than product specs do. Read the threat model, not just the happy path.

### 3. The `collectionId` cross-user check should be 400, not 404

When alice tries to create a bookmark with bob's collectionId, the spec's privacy invariant applies (alice should not be able to *learn* about bob's collection). So 400 would leak. But also: 404 would be more uniform.

We chose **400 with code `COLLECTION_NOT_FOUND`** — same body as 404 — and we documented this as the one place we diverge from "always 404". The reason: this is a *request shape* error (the request body references a thing you cannot attach to), not an *authz* error (you are not authorised to view the resource). Conceptually the same, but it lets a frontend distinguish "you typo'd a collection id" from "you don't have access to that collection" without either leak.

**How it was caught.** Reviewing my own first implementation against the failure modes. No test broke; this is a documentation/clarity pass.

**Lesson.** When a privacy spec says "no existence leak," the *surface* of the leak is what matters, not the numeric status code.

---

## What is deliberately not documented

These belong elsewhere:

- Internal Prisma index choices — see `backend/prisma/schema.prisma`.
- Auth0 tenant config — see `DECISIONS.md` (ADR-001).
- Frontend route names — see `frontend/src/App.tsx` once it ships.