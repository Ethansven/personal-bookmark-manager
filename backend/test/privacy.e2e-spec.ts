import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { startTestAuthServer, TestAuth } from './test-jwks';

/**
 * The privacy invariant in code.
 *
 * Two distinct users (alice, bob), each with their own collections and
 * bookmarks. Every scenario proves that one user cannot read, edit,
 * delete, or even learn of the existence of the other's data.
 *
 * All requests carry a real signed JWT access token validated by the
 * production JwtStrategy via a local JWKS server. Nothing about the
 * auth path is stubbed. The strategy enforces iss, aud, signature,
 * and exp exactly as in production.
 */

const API_AUDIENCE = 'https://bbl-candidate-test-api';

describe('Privacy (e2e)', () => {
  let app: INestApplication;
  let auth: TestAuth;
  let aliceToken: string;
  let bobToken: string;
  let aliceCollectionId: string;
  let aliceBookmarkId: string;
  let bobCollectionId: string;
  let bobBookmarkId: string;

  beforeAll(async () => {
    auth = await startTestAuthServer(API_AUDIENCE);

    process.env.AUTH0_ISSUER = auth.issuer;
    process.env.AUTH0_AUDIENCE = API_AUDIENCE;
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ?? 'file:./prisma/test.db';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    aliceToken = await auth.mintToken({
      sub: 'auth0|e2e-alice',
      email: 'alice-e2e@test.local',
    });
    bobToken = await auth.mintToken({
      sub: 'auth0|e2e-bob',
      email: 'bob-e2e@test.local',
    });

    // Bootstrap deterministic data per user.
    const seeded = await seedData(app, aliceToken, bobToken);
    aliceCollectionId = seeded.aliceCollectionId;
    aliceBookmarkId = seeded.aliceBookmarkId;
    bobCollectionId = seeded.bobCollectionId;
    bobBookmarkId = seeded.bobBookmarkId;
  });

  afterAll(async () => {
    await app?.close();
    await auth?.stop();
  });

  describe('collections', () => {
    it('alice cannot list bob collections', async () => {
      const res = await request(app.getHttpServer())
        .get('/collections')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);
      const ids = (res.body as { id: string }[]).map((c) => c.id);
      expect(ids).not.toContain(bobCollectionId);
    });

    it('bob cannot list alice collections', async () => {
      const res = await request(app.getHttpServer())
        .get('/collections')
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);
      const ids = (res.body as { id: string }[]).map((c) => c.id);
      expect(ids).not.toContain(aliceCollectionId);
    });

    it('alice GET on bob collection returns 404 (no existence leak)', async () => {
      await request(app.getHttpServer())
        .get(`/collections/${bobCollectionId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    });

    it('alice PUT on bob collection returns 404', async () => {
      await request(app.getHttpServer())
        .put(`/collections/${bobCollectionId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'hijack' })
        .expect(404);
    });

    it('alice PATCH on bob collection returns 404', async () => {
      await request(app.getHttpServer())
        .patch(`/collections/${bobCollectionId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ name: 'hijack' })
        .expect(404);
    });

    it('alice DELETE on bob collection returns 404', async () => {
      await request(app.getHttpServer())
        .delete(`/collections/${bobCollectionId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    });
  });

  describe('bookmarks', () => {
    it('alice cannot list bob bookmarks', async () => {
      const res = await request(app.getHttpServer())
        .get('/bookmarks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);
      const ids = (res.body as { id: string }[]).map((b) => b.id);
      expect(ids).not.toContain(bobBookmarkId);
    });

    it('alice GET on bob bookmark returns 404', async () => {
      await request(app.getHttpServer())
        .get(`/bookmarks/${bobBookmarkId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    });

    it('alice PUT on bob bookmark returns 404', async () => {
      await request(app.getHttpServer())
        .put(`/bookmarks/${bobBookmarkId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          url: 'https://attacker.example/x',
          title: 'hijack',
        })
        .expect(404);
    });

    it('alice PATCH on bob bookmark returns 404', async () => {
      await request(app.getHttpServer())
        .patch(`/bookmarks/${bobBookmarkId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ title: 'hijack' })
        .expect(404);
    });

    it('alice DELETE on bob bookmark returns 404', async () => {
      await request(app.getHttpServer())
        .delete(`/bookmarks/${bobBookmarkId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    });

    it('alice cannot attach a bookmark to bob collection', async () => {
      await request(app.getHttpServer())
        .post('/bookmarks')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          url: 'https://example.com/cross',
          title: 'cross',
          collectionId: bobCollectionId,
        })
        .expect(400);
    });

    it('GET /collections/:bobId/bookmarks as alice returns 404 (no leak)', async () => {
      await request(app.getHttpServer())
        .get(`/collections/${bobCollectionId}/bookmarks`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(404);
    });
  });

  describe('auth envelope', () => {
    it('no token returns 401 with our error shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .expect(401);
      expect(res.body).toEqual({
        error: expect.objectContaining({
          code: 'UNAUTHENTICATED',
        }),
      });
    });

    it('expired token returns 401', async () => {
      const expired = await auth.mintToken(
        { sub: 'auth0|e2e-alice' },
        { expiresIn: '-1m' },
      );
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });

    it('wrong audience returns 401', async () => {
      const wrongAud = await auth.mintToken(
        { sub: 'auth0|e2e-alice' },
        { audience: 'https://other-api.example/api' },
      );
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${wrongAud}`)
        .expect(401);
    });

    it('wrong issuer returns 401', async () => {
      const wrongIss = await auth.mintToken(
        { sub: 'auth0|e2e-alice' },
        { issuer: 'https://other-issuer.example/' },
      );
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${wrongIss}`)
        .expect(401);
    });
  });
});

async function seedData(
  app: INestApplication,
  aliceToken: string,
  bobToken: string,
): Promise<{
  aliceCollectionId: string;
  aliceBookmarkId: string;
  bobCollectionId: string;
  bobBookmarkId: string;
}> {
  const server = app.getHttpServer();
  const logIfFail = (label: string, res: { status: number; body: unknown; text?: string }) => {
    if (res.status >= 400) {
      // eslint-disable-next-line no-console
      console.error(`[seedData] ${label} -> ${res.status}:`, res.body ?? res.text);
    }
  };

  const aliceColl = await request(server)
    .post('/collections')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ name: 'alice-collection' });
  logIfFail('aliceColl', aliceColl);
  expect(aliceColl.status).toBe(201);

  const aliceBk = await request(server)
    .post('/bookmarks')
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({
      url: 'https://alice.example/a',
      title: 'alice bookmark',
      collectionId: aliceColl.body.id,
    });
  logIfFail('aliceBk', aliceBk);
  expect(aliceBk.status).toBe(201);

  const bobColl = await request(server)
    .post('/collections')
    .set('Authorization', `Bearer ${bobToken}`)
    .send({ name: 'bob-collection' });
  logIfFail('bobColl', bobColl);
  expect(bobColl.status).toBe(201);

  const bobBk = await request(server)
    .post('/bookmarks')
    .set('Authorization', `Bearer ${bobToken}`)
    .send({
      url: 'https://bob.example/b',
      title: 'bob bookmark',
      collectionId: bobColl.body.id,
    });
  logIfFail('bobBk', bobBk);
  expect(bobBk.status).toBe(201);

  return {
    aliceCollectionId: aliceColl.body.id,
    aliceBookmarkId: aliceBk.body.id,
    bobCollectionId: bobColl.body.id,
    bobBookmarkId: bobBk.body.id,
  };
}
