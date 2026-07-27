import { createServer, Server } from 'node:http';
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
    claims: { sub: string; email?: string; scope?: string },
    opts?: { audience?: string; issuer?: string; expiresIn?: string },
  ): Promise<string>;
}

export async function startTestAuthServer(
  audience: string,
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

  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
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

  async function mintToken(
    claims: { sub: string; email?: string; scope?: string },
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
    mintToken,
  };
}
