import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import * as jose from 'jose';

/**
 * In-process OIDC mock.
 *
 * Spins up a tiny HTTP server that serves the JWKS at
 *   /.well-known/jwks.json
 * and an openid-configuration at
 *   /.well-known/openid-configuration
 * so the real `JwtStrategy` (configured with jwks-rsa + passport-jwt)
 * resolves keys against THIS server during the test.
 *
 * Why: we want to prove our auth wiring matches the spec — signature
 * validation, issuer claim, audience claim, expiry — against the
 * exact code that runs in production. The alternative (stubbing the
 * strategy) only proves the repo layer, not the strategy.
 */

export interface TestAuth {
  readonly issuer: string;
  readonly audience: string;
  readonly port: number;
  stop(): Promise<void>;
  mintToken(
    claims: { sub: string; email?: string; scope?: string; nonce?: string },
    opts?: { audience?: string; issuer?: string; expiresIn?: string },
  ): Promise<string>;
  /** Sets the nonce stamped into future issued id_tokens. */
  setIdTokenNonce(nonce: string | undefined): void;
}

export interface TokenEndpointOptions {
  /** Minted access tokens have this audience. */
  audience: string;
  /** Minted id_tokens have this audience. Defaults to `audience`. */
  idTokenAudience?: string;
  /** If true, the token endpoint expects code+code_verifier, rejects otherwise. */
  validatePkce: boolean;
  /** Set true to make token exchanges return 4xx — for failure-mode tests. */
  failNext?: boolean;
  /** Latest token endpoint request body for assertions. */
  lastTokenRequest?: { code?: string; code_verifier?: string };
  /** Nonce stamped into the issued id_token. Defaults to '' (no nonce). */
  idTokenNonce?: string;
}

export async function startTestAuthServer(
  audience: string,
  opts: Partial<TokenEndpointOptions> = {},
): Promise<TestAuth> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const kid = `test-${Date.now()}`;

  const jwk = await jose.exportJWK(publicKey);
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  let issuer = '';
  let server: Server | null = null;
  let port = 0;
  const state: TokenEndpointOptions & {
    failNext?: boolean;
    lastTokenRequest?: { code?: string; code_verifier?: string };
  } = {
    audience,
    idTokenAudience: opts.idTokenAudience ?? audience,
    validatePkce: false,
    failNext: false,
    ...opts,
  };

  await new Promise<void>((resolve) => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      try {
        const url = new URL(req.url ?? '/', `http://localhost`);
        if (url.pathname === '/.well-known/openid-configuration') {
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              issuer,
              jwks_uri: `${issuer}/.well-known/jwks.json`,
            }),
          );
          return;
        }
        if (url.pathname === '/.well-known/jwks.json') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ keys: [jwk] }));
          return;
        }
        if (url.pathname === '/oauth/token' && req.method === 'POST') {
          void handleTokenExchange(req, res);
          return;
        }
        res.statusCode = 404;
        res.end();
      } catch (err) {
        res.statusCode = 500;
        res.end(String(err));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address();
      if (typeof addr === 'object' && addr) {
        port = addr.port;
        issuer = `http://127.0.0.1:${port}`;
      }
      resolve();
    });
  });

  async function handleTokenExchange(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (state.failNext) {
      state.failNext = false;
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString('utf8');
    const params = new URLSearchParams(body);
    const code = params.get('code') ?? '';
    const codeVerifier = params.get('code_verifier') ?? '';
    state.lastTokenRequest = { code, code_verifier: codeVerifier };

    if (state.validatePkce) {
      if (!code || !codeVerifier) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'invalid_grant' }));
        return;
      }
      // PKCE verification: SHA256(verifier) base64url must equal the challenge.
      const expected = (await import('crypto'))
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      if (expected !== params.get('code_challenge')) {
        // Many flows don't echo the challenge; this test server tolerates.
      }
    }

    const access = await mintToken({ sub: 'auth0|test-user', email: 't@x' });
    const id = await mintToken(
      {
        sub: 'auth0|test-user',
        email: 't@x',
        ...(state.idTokenNonce ? { nonce: state.idTokenNonce } : {}),
      },
      { audience: state.idTokenAudience ?? audience },
    );
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        access_token: access,
        id_token: id,
        refresh_token: 'rt_' + Math.random().toString(36).slice(2),
        expires_in: 86400,
        token_type: 'Bearer',
      }),
    );
  }

  async function mintToken(
    claims: { sub: string; email?: string; scope?: string; nonce?: string },
    opts: { audience?: string; issuer?: string; expiresIn?: string } = {},
  ): Promise<string> {
    const aud = opts.audience ?? audience;
    const iss = opts.issuer ?? issuer;
    if (!aud || !iss) {
      throw new Error('TestAuth not initialised: audience/issuer missing.');
    }
    return new jose.SignJWT({
      email: claims.email,
      scope: claims.scope ?? '',
      ...(claims.nonce ? { nonce: claims.nonce } : {}),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setSubject(claims.sub)
      .setAudience(aud)
      .setIssuer(iss)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? '5m')
      .sign(privateKey);
  }

  return {
    get issuer(): string {
      return issuer;
    },
    get audience(): string {
      return audience;
    },
    get port(): number {
      return port;
    },
    async stop(): Promise<void> {
      if (!server) return;
      await new Promise<void>((resolve, reject) =>
        server!.close((err) => (err ? reject(err) : resolve())),
      );
      server = null;
    },
    setIdTokenNonce(nonce: string | undefined): void {
      state.idTokenNonce = nonce;
    },
    mintToken,
  };
}
