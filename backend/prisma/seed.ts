/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

/**
 * Two distinct users, each with their own collections and bookmarks.
 *
 * The `sub` values are the Auth0 `sub` claim shapes. In real use these
 * come from the token; here we hard-code them so tests can deterministically
 * mint tokens for "alice" and "bob" and prove one cannot see the other.
 */

const ALICE_SUB = 'auth0|seed-alice';
const BOB_SUB = 'auth0|seed-bob';

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  // Idempotent: delete then create so re-runs are deterministic.
  await prisma.bookmark.deleteMany({
    where: { ownerId: { in: [ALICE_SUB, BOB_SUB] } },
  });
  await prisma.collection.deleteMany({
    where: { ownerId: { in: [ALICE_SUB, BOB_SUB] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [ALICE_SUB, BOB_SUB] } },
  });

  const alice = await prisma.user.create({
    data: { id: ALICE_SUB, email: 'alice@test.local' },
  });
  const bob = await prisma.user.create({
    data: { id: BOB_SUB, email: 'bob@test.local' },
  });

  const aliceReading = await prisma.collection.create({
    data: { name: 'Reading', ownerId: alice.id },
  });
  await prisma.collection.create({
    data: { name: 'Recipes', ownerId: alice.id },
  });
  await prisma.bookmark.createMany({
    data: [
      {
        url: 'https://example.com/alice-1',
        title: 'Alice note 1',
        ownerId: alice.id,
        collectionId: aliceReading.id,
      },
      {
        url: 'https://example.com/alice-2',
        title: 'Alice note 2',
        ownerId: alice.id,
        collectionId: aliceReading.id,
      },
      {
        url: 'https://example.com/alice-3',
        title: 'Alice note 3 (no collection)',
        ownerId: alice.id,
        collectionId: null,
      },
    ],
  });

  const bobWork = await prisma.collection.create({
    data: { name: 'Work', ownerId: bob.id },
  });
  await prisma.bookmark.createMany({
    data: [
      {
        url: 'https://example.com/bob-1',
        title: 'Bob note 1',
        ownerId: bob.id,
        collectionId: bobWork.id,
      },
      {
        url: 'https://example.com/bob-2',
        title: 'Bob note 2',
        ownerId: bob.id,
        collectionId: bobWork.id,
      },
    ],
  });

  console.log('Seeded:');
  console.log(`  Alice (${alice.id}) — 2 collections, 3 bookmarks`);
  console.log(`  Bob   (${bob.id}) — 1 collection, 2 bookmarks`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
