import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, Bookmark } from '@prisma/client';
import type {
  CreateBookmarkDto,
  ListBookmarksQuery,
  PatchBookmarkDto,
  UpdateBookmarkDto,
} from './bookmarks.dto';

/**
 * All Prisma access for bookmarks. Same discipline as CollectionsRepository:
 * every read is owner-scoped; mutations verify ownership first and return
 * 404 (never 403) if the row isn't yours.
 */
@Injectable()
export class BookmarksRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForOwner(
    ownerId: string,
    query: ListBookmarksQuery,
  ): Promise<Bookmark[]> {
    return this.prisma.bookmark.findMany({
      where: {
        ownerId,
        ...(query.collectionId !== undefined
          ? { collectionId: query.collectionId }
          : {}),
        ...(query.q
          ? {
              OR: [
                { title: { contains: query.q } },
                { notes: { contains: query.q } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }],
      skip: query.offset ?? 0,
      take: query.limit ?? 50,
    });
  }

  async listForOwnerInCollection(
    ownerId: string,
    collectionId: string,
  ): Promise<Bookmark[]> {
    return this.prisma.bookmark.findMany({
      where: { ownerId, collectionId },
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async findOwned(ownerId: string, id: string): Promise<Bookmark> {
    const row = await this.prisma.bookmark.findFirst({
      where: { id, ownerId },
    });
    if (!row) {
      throw new NotFoundException('Bookmark not found');
    }
    return row;
  }

  async createForOwner(
    ownerId: string,
    dto: CreateBookmarkDto,
  ): Promise<Bookmark> {
    if (dto.collectionId !== undefined) {
      await this.assertCollectionOwned(ownerId, dto.collectionId);
    }
    return this.prisma.bookmark.create({
      data: {
        ownerId,
        url: dto.url,
        title: dto.title,
        notes: dto.notes ?? null,
        collectionId: dto.collectionId ?? null,
      },
    });
  }

  async replaceOwned(
    ownerId: string,
    id: string,
    dto: UpdateBookmarkDto,
  ): Promise<Bookmark> {
    await this.findOwned(ownerId, id);
    if (dto.collectionId !== undefined) {
      await this.assertCollectionOwned(ownerId, dto.collectionId);
    }
    return this.prisma.bookmark.update({
      where: { id },
      data: {
        url: dto.url,
        title: dto.title,
        notes: dto.notes ?? null,
        collectionId: dto.collectionId ?? null,
      },
    });
  }

  async patchOwned(
    ownerId: string,
    id: string,
    dto: PatchBookmarkDto,
  ): Promise<Bookmark> {
    await this.findOwned(ownerId, id);
    if (dto.collectionId !== undefined) {
      await this.assertCollectionOwned(ownerId, dto.collectionId);
    }
    const data: { url?: string; title?: string; notes?: string | null; collectionId?: string | null } = {};
    if (dto.url !== undefined) data.url = dto.url;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;
    if (dto.collectionId !== undefined) data.collectionId = dto.collectionId ?? null;
    return this.prisma.bookmark.update({ where: { id }, data });
  }

  async deleteOwned(ownerId: string, id: string): Promise<void> {
    const result = await this.prisma.bookmark.deleteMany({
      where: { id, ownerId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Bookmark not found');
    }
  }

  /**
   * Cross-checks that the collection referenced by a bookmark belongs to
   * the same owner. Prevents one user attaching their bookmark to another
   * user's collection (which would leak the bookmark into that other
   * user's read scope).
   */
  private async assertCollectionOwned(
    ownerId: string,
    collectionId: string,
  ): Promise<void> {
    const found = await this.prisma.collection.findFirst({
      where: { id: collectionId, ownerId },
      select: { id: true },
    });
    if (!found) {
      // Same shape as "not found" elsewhere — no existence leak.
      throw new BadRequestException({
        code: 'COLLECTION_NOT_FOUND',
        message: 'Collection not found',
      });
    }
  }
}