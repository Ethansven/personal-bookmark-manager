// Auth service — runs the OIDC Authorization Code + PKCE flow server-side.
//
// Per ADR-005 the backend owns the entire PKCE round-trip:
//   1. /auth/login mints state/nonce/code_verifier/code_challenge and
//      stashes them in express-session, then 302s to Auth0 /authorize.
//   2. Auth0 calls back to /callback (mounted at root). Backend verifies
//      state, exchanges code+verifier for tokens at /oauth/token, then
//      serves an HTML page that hands the tokens to the SPA via a
//      same-origin redirect.
//   3. All subsequent API calls go through the existing JwtAuthGuard,
//      which validates the access_token signature/iss/aud/exp against the
//      live JWKS — nothing changes there.

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, type JWTPayload } from 'jose';
import { randomBytes, createHash } from 'crypto';
import axios from 'axios';

export interface PkceSession {
  state: string;
  nonce: string;
  codeVerifier: string;
  codeChallenge: string;
  returnTo?: string;
  createdAt: number;
}

export interface TokenBundle {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface AuthConfigPublic {
  issuer: string;
  audience: string;
  clientId: string;
  callbackUrl: string;
}

const PKCE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private readonly issuer: string;
  private readonly audience: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly callbackUrl: string;

  // In-memory PKCE state. Single-instance take-home; would be Redis in prod.
  private readonly pkceStore = new Map<string, PkceSession>();
  private readonly gcTimer: NodeJS.Timeout;

  constructor(config: ConfigService) {
    this.issuer = this.required(config, 'AUTH0_ISSUER');
    this.audience = this.required(config, 'AUTH0_AUDIENCE');
    this.clientId = this.required(config, 'AUTH0_CLIENT_ID');
    // PKCE-only clients don't need a client_secret. If the env var is
    // missing or still a placeholder, treat it as absent.
    const rawSecret = config.get<string>('AUTH0_CLIENT_SECRET') ?? '';
    this.clientSecret =
      rawSecret && !rawSecret.startsWith('__set_in_local_env__')
        ? rawSecret
        : '';
    this.callbackUrl = this.required(config, 'AUTH0_CALLBACK_URL');

    this.gcTimer = setInterval(() => this.gcPkce(), 60_000);
    this.gcTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.gcTimer);
  }

  // ---- PKCE ----

  createPkceSession(returnTo?: string): PkceSession {
    const state = randomBytes(24).toString('hex');
    const nonce = randomBytes(24).toString('hex');
    const codeVerifier = randomBytes(48).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const session: PkceSession = {
      state,
      nonce,
      codeVerifier,
      codeChallenge,
      returnTo,
      createdAt: Date.now(),
    };
    this.pkceStore.set(state, session);
    return session;
  }

  buildAuthorizationUrl(session: PkceSession): string {
    const url = new URL(`${this.issuer.replace(/\/$/, '')}/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.callbackUrl);
    url.searchParams.set('scope', 'openid profile email offline_access');
    url.searchParams.set('state', session.state);
    url.searchParams.set('nonce', session.nonce);
    url.searchParams.set('code_challenge', session.codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('audience', this.audience);
    return url.toString();
  }

  consumePkceSession(state: string): PkceSession | null {
    const session = this.pkceStore.get(state);
    if (!session) return null;
    this.pkceStore.delete(state);
    if (Date.now() - session.createdAt > PKCE_TTL_MS) return null;
    return session;
  }

  /** Read-only peek for tests. Production code should use consumePkceSession. */
  peekPkceSession(state: string): PkceSession | null {
    const session = this.pkceStore.get(state);
    if (!session) return null;
    if (Date.now() - session.createdAt > PKCE_TTL_MS) return null;
    return session;
  }

  private gcPkce(): void {
    const cutoff = Date.now() - PKCE_TTL_MS;
    for (const [k, v] of this.pkceStore) {
      if (v.createdAt < cutoff) this.pkceStore.delete(k);
    }
  }

  // ---- Token exchange ----

  async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
  ): Promise<TokenBundle> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      code,
      code_verifier: codeVerifier,
      redirect_uri: this.callbackUrl,
    });
    if (this.clientSecret) body.set('client_secret', this.clientSecret);

    try {
      const res = await axios.post<TokenBundle>(
        `${this.issuer.replace(/\/$/, '')}/oauth/token`,
        body.toString(),
        {
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          timeout: 10_000,
        },
      );
      return res.data;
    } catch (err) {
      const detail = axios.isAxiosError(err)
        ? `${err.response?.status ?? 'no-status'} ${JSON.stringify(err.response?.data ?? err.message)}`
        : (err as Error).message;
      this.logger.warn(`token exchange failed: ${detail}`);
      throw new UnauthorizedException({
        code: 'token_exchange_failed',
        message: 'Auth0 rejected the code.',
      });
    }
  }

  // ---- ID-token verification ----

  async verifyIdToken(
    idToken: string,
    expectedNonce: string,
  ): Promise<JWTPayload> {
    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(
        idToken,
        this.jwksGetter(),
        {
          issuer: this.issuer,
          audience: this.clientId,
        },
      );
      payload = verified.payload;
    } catch (err) {
      this.logger.warn(`id_token rejected: ${(err as Error).message}`);
      throw new UnauthorizedException({
        code: 'invalid_id_token',
        message: 'ID token failed verification.',
      });
    }
    if (payload.nonce !== expectedNonce) {
      throw new UnauthorizedException({
        code: 'nonce_mismatch',
        message: 'ID token nonce did not match.',
      });
    }
    return payload;
  }

  // Resolve JWKS lazily so unit tests can stub.
  private jwksGetter() {
    // jose accepts a function that resolves the JWK for a given kid.
    // We fetch once and cache.
    if (!this._jwksCache) {
      throw new Error('JWKS not initialised; call initJwks() at startup.');
    }
    return this._jwksCache;
  }

  private _jwksCache: ReturnType<typeof import('jose').createRemoteJWKSet> | null = null;

  /** Fetch the Auth0 JWKS once and cache it. */
  async initJwks(): Promise<void> {
    if (this._jwksCache) return;
    const { createRemoteJWKSet } = await import('jose');
    this._jwksCache = createRemoteJWKSet(
      new URL(`${this.issuer.replace(/\/$/, '')}/.well-known/jwks.json`),
    );
  }

  // ---- Config exposure ----

  publicConfig(): AuthConfigPublic {
    return {
      issuer: this.issuer,
      audience: this.audience,
      clientId: this.clientId,
      callbackUrl: this.callbackUrl,
    };
  }

  // ---- helpers ----

  private required(config: ConfigService, key: string): string {
    const v = config.get<string>(key);
    if (!v) {
      throw new Error(`Missing required config: ${key}`);
    }
    return v;
  }
}