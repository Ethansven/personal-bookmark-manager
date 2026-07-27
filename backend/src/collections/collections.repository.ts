import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Collection } from '@prisma/client';
import type { ListCollectionsQuery } from './collections.dto';

/**
 * All Prisma access for collections goes through this class.
 *
 * Every method takes `ownerId` (the caller's Auth0 sub). There is no
 * method that loads a collection without scoping by ownerId — that
 * makes it structurally impossible for a handler to leak another
 * user's data. If a caller asks for a collection that doesn't exist
 * OR isn't theirs, they get the same `NotFoundException` response
 * (404). Never 403, to avoid leaking existence.
 */
@Injectable()
export class CollectionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForOwner(
    ownerId: string,
    query: ListCollectionsQuery,
  ): Promise<Collection[]> {
    return this.prisma.collection.findMany({
      where: {
        ownerId,
        ...(query.q ? { name: { contains: query.q } } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      skip: query.offset ?? 0,
      take: query.limit ?? 50,
    });
  }

  async findOwned(ownerId: string, id: string): Promise<Collection> {
    const row = await this.prisma.collection.findFirst({
      where: { id, ownerId },
    });
    if (!row) {
      throw new NotFoundException('Collection not found');
    }
    return row;
  }

  async createForOwner(
    ownerId: string,
    name: string,
  ): Promise<Collection> {
    return this.prisma.collection.create({
      data: { ownerId, name },
    });
  }

  async replaceOwned(
    ownerId: string,
    id: string,
    name: string,
  ): Promise<Collection> {
    // Confirm ownership first — findUnique + update would let us PUT
    // a row we don't own if we relied on the where-clause alone.
    await this.findOwned(ownerId, id);
    return this.prisma.collection.update({
      where: { id },
      data: { name },
    });
  }

  async patchOwned(
    ownerId: string,
    id: string,
    patch: { name?: string },
  ): Promise<Collection> {
    await this.findOwned(ownerId, id);
    return this.prisma.collection.update({
      where: { id },
      data: patch,
    });
  }

  async deleteOwned(ownerId: string, id: string): Promise<void> {
    // deleteMany returns count; if zero, surface 404.
    const result = await this.prisma.collection.deleteMany({
      where: { id, ownerId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Collection not found');
    }
  }
}