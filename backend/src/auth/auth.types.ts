/**
 * The Auth0 JWT access-token claim shape we rely on.
 * Only the claims we actually use are typed; passport-jwt fills the rest
 * of `payload` from the decoded token.
 */
export interface Auth0AccessTokenPayload {
  sub: string;
  aud: string | string[];
  iss: string;
  exp: number;
  iat: number;
  scope?: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * The minimal "who is this" we attach to the request after auth runs.
 * `sub` is the Auth0 user identifier. `email` is whatever the token
 * provided (may be undefined).
 */
export interface AuthenticatedUser {
  sub: string;
  email?: string;
}
