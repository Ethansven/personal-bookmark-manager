import { UserManager } from 'oidc-client-ts';

/**
 * OIDC client configuration. Built from Vite env vars at module load.
 *
 * `response_type: 'code'` + `code_challenge_method: 'S256'` is the
 * Authorization Code + PKCE flow per ADR-003.
 *
 * Tokens are stored in sessionStorage by default so closing the tab
 * logs the user out — appropriate for a personal app accessed from
 * shared machines; easy to flip to localStorage if desired.
 */
function buildSettings(): ConstructorParameters<typeof UserManager>[0] {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID;
  const audience = import.meta.env.VITE_AUTH0_AUDIENCE;
  const callback = import.meta.env.VITE_AUTH0_CALLBACK_URL;
  const logout = import.meta.env.VITE_AUTH0_LOGOUT_URL;

  if (!domain || !clientId || !audience || !callback) {
    throw new Error(
      'Missing VITE_AUTH0_* env vars. Copy .env.example to .env and fill in.',
    );
  }

  return {
    authority: `https://${domain}`,
    client_id: clientId,
    redirect_uri: callback,
    post_logout_redirect_uri: logout,
    scope: 'openid profile email',
    response_type: 'code',
    extraQueryParams: { audience },
    // S256 PKCE is the default for code flow in oidc-client-ts; we
    // assert it via library source (it uses crypto.subtle.digest
    // 'SHA-256' unconditionally when response_type === 'code').
    loadUserInfo: true,
    automaticSilentRenew: true,
    includeIdTokenInSilentRenew: true,
  };
}

export const userManager = new UserManager(buildSettings());

export async function getAccessToken(): Promise<string | null> {
  const user = await userManager.getUser();
  return user?.access_token ?? null;
}
