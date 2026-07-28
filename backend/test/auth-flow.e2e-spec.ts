// Auth-flow e2e — backend-mediated PKCE round-trip.
//
// Proves the contract from ADR-005 end to end against the production
// CallbackController + AuthController. The only thing faked is Auth0 itself:
// a tiny in-process mock that serves JWKS + /oauth/token, returns real signed
// JWTs that the existing JwtStrategy (wired in via the test module's
// AUTH0_ISSUER env override) can verify.

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import type { RequestHandler } from 'express';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { AuthService } from '../src/auth/auth.service';
import { startTestAuthServer, type TestAuth } from './test-jwks';

const API_AUDIENCE = 'https://bbl-candidate-test-api';

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let auth: TestAuth;
  let authService: AuthService;

  beforeAll(async () => {
    auth = await startTestAuthServer(API_AUDIENCE, {
      validatePkce: false,
      idTokenAudience: 'test-client',
    });

    process.env.AUTH0_ISSUER = auth.issuer;
    process.env.AUTH0_AUDIENCE = API_AUDIENCE;
    process.env.AUTH0_CLIENT_ID = 'test-client';
    process.env.AUTH0_CALLBACK_URL = 'http://localhost:3000/callback';
    process.env.SESSION_SECRET = 'test-session-secret';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'file:./prisma/test.db';
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    const sessionMw: RequestHandler = session({
      name: 'connect.sid',
      secret: 'test-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 600_000 },
    });
    app.use(cookieParser(), sessionMw);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await app?.close();
    await auth?.stop();
  });

  it('GET /auth/login redirects to Auth0 with PKCE params', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/login?returnTo=/collections')
      .expect(302);

    const loc = res.headers['location'] ?? '';
    expect(loc).toContain('/authorize');
    expect(loc).toContain('response_type=code');
    expect(loc).toContain('code_challenge_method=S256');
    expect(loc).toContain(`audience=${encodeURIComponent(API_AUDIENCE)}`);
    expect(loc).toContain('redirect_uri=' + encodeURIComponent('http://localhost:3000/callback'));
    expect(loc).toMatch(/code_challenge=[A-Za-z0-9_-]+/);
    expect(loc).toMatch(/state=[a-f0-9]+/);
    expect(loc).toMatch(/nonce=[a-f0-9]+/);

    // Set-Cookie should have created a session.
    expect(res.headers['set-cookie']?.[0] ?? '').toContain('connect.sid=');
  });

  it('GET /callback?error=access_denied returns 400 HTML', async () => {
    const res = await request(app.getHttpServer())
      .get('/callback?error=access_denied&error_description=user+said+no')
      .expect(400);
    expect(res.text).toContain('Sign-in failed');
    expect(res.text).toContain('user said no');
  });

  it('GET /callback without code returns 400 HTML', async () => {
    const res = await request(app.getHttpServer())
      .get('/callback')
      .expect(400);
    expect(res.text).toContain('Sign-in failed');
  });

  it('GET /callback without a PKCE session returns 400 (state mismatch)', async () => {
    const res = await request(app.getHttpServer())
      .get('/callback?code=fake&state=does-not-exist')
      .expect(400);
    expect(res.text).toContain('Sign-in failed');
  });

  it('full PKCE round-trip: /login → /callback returns redirect HTML with tokens', async () => {
    const agent = request.agent(app.getHttpServer());

    // 1. Start the flow — backend stashes PKCE on session.
    const login = await agent
      .get('/auth/login?returnTo=/collections')
      .expect(302);
    const auth0Url = new URL(login.headers['location']);
    const state = auth0Url.searchParams.get('state')!;

    // 2. Tell the mock Auth0 server to stamp the matching nonce into the
    //    id_token, then simulate Auth0 calling back with an auth code.
    const pkce = authService.peekPkceSession(state);
    expect(pkce).not.toBeNull();
    auth.setIdTokenNonce(pkce!.nonce);

    const cb = await agent
      .get(`/callback?code=mock-auth-code&state=${state}`)
      .expect(200);

    // The response should be an HTML page that stores tokens in localStorage
    // and redirects the SPA to /auth/callback?p=<encoded JSON>.
    expect(cb.text).toMatch(/<script/i);
    expect(cb.text).toMatch(/localStorage\.setItem\(\s*['"]bbl_tokens['"]/);
    expect(cb.text).toMatch(/window\.location\.replace/);
    expect(cb.text).toContain('/auth/callback?p=');

    // The JSON payload embedded in the script should contain a real JWT.
    const m = cb.text.match(/localStorage\.setItem\(\s*['"]bbl_tokens['"],\s*JSON\.stringify\((.+?)\)\s*\)/);
    expect(m).not.toBeNull();
    const payload = JSON.parse(m![1]) as {
      access_token: string;
      id_token: string;
      refresh_token: string | null;
      expires_in: number;
      returnTo: string;
    };
    expect(payload.access_token.length).toBeGreaterThan(20);
    expect(payload.id_token.length).toBeGreaterThan(20);
    expect(payload.expires_in).toBeGreaterThan(0);
    expect(payload.returnTo).toBe('/collections');
  });

  it('GET /auth/config returns public client config', async () => {
    const res = await request(app.getHttpServer()).get('/auth/config').expect(200);
    expect(res.body.audience).toBe(API_AUDIENCE);
    expect(res.body.clientId).toBe('test-client');
    expect(res.body.callbackUrl).toBe('http://localhost:3000/callback');
  });

  it('POST /auth/logout clears the session cookie', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent.get('/auth/login?returnTo=/collections').expect(302);
    const logout = await agent.post('/auth/logout').send({}).expect(204);
    const setCookieRaw = logout.headers['set-cookie'];
    const setCookie = Array.isArray(setCookieRaw)
      ? setCookieRaw
      : setCookieRaw
        ? [setCookieRaw]
        : [];
    const cleared = setCookie.some(
      (c: string) => /connect\.sid=;/.test(c),
    );
    expect(cleared).toBe(true);
  });
});