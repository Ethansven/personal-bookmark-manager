// Token storage + login glue for backend-mediated PKCE (ADR-005).
//
// The backend runs the entire OIDC round-trip. The SPA only:
//   - triggers /auth/login when there's no token,
//   - parses ?p=... on /auth/callback,
//   - reads the access token from localStorage for API calls,
//   - POSTs /auth/logout to clear the server-side session.

const STORAGE_KEY = 'bbl_tokens';

export interface TokenPayload {
  accessToken: string;
  idToken: string | null;
  refreshToken: string | null;
  expiresAt: number; // ms epoch
}

interface CallbackEnvelope {
  type: 'auth0-callback';
  access_token: string;
  id_token?: string;
  refresh_token?: string | null;
  expires_in?: number;
  returnTo?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Begin the login flow. Bounces the browser to the backend, which
 * redirects to Auth0 and back. Same-origin target so we don't lose
 * the session cookie.
 */
export function startLogin(returnTo = '/collections'): void {
  const url = `${API_BASE}/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  window.location.href = url;
}

/**
 * Called by /auth/callback page. Reads ?p=... and stores the token
 * shape in localStorage. Strips the query string. Returns the
 * returnTo target.
 */
export function finishCallback(): string {
  const params = new URLSearchParams(window.location.search);
  const p = params.get('p');
  if (!p) throw new Error('No payload in callback URL.');
  const envelope = JSON.parse(decodeURIComponent(p)) as CallbackEnvelope;
  if (!envelope.access_token) {
    throw new Error('Callback payload missing access_token.');
  }
  const next: TokenPayload = {
    accessToken: envelope.access_token,
    idToken: envelope.id_token ?? null,
    refreshToken: envelope.refresh_token ?? null,
    expiresAt: Date.now() + ((envelope.expires_in ?? 3600) * 1000),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // Strip the payload so a refresh doesn't re-process it.
  const url = new URL(window.location.href);
  url.searchParams.delete('p');
  window.history.replaceState({}, '', url.toString());
  return envelope.returnTo ?? '/collections';
}

/** Returns the access token if present and not expired, else null. */
export function getAccessToken(): string | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TokenPayload;
    if (!parsed.accessToken) return null;
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed.accessToken;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Best-effort logout: tell the backend to destroy the session, then
 * clear local tokens. Auth0 RP-initiated logout is documented in ADR-005
 * as out of scope for v1.
 */
export async function logout(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // network may be down — still clear locally
  }
  clearTokens();
}