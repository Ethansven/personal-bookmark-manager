import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnsureUserGuard } from '../auth/ensure-user.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateCollectionDto,
  ListCollectionsQuery,
  PatchCollectionDto,
  UpdateCollectionDto,
} from './collections.dto';
import { CollectionsRepository } from './collections.repository';
import { BookmarksRepository } from '../bookmarks/bookmarks.repository';
import type { Collection, Bookmark } from '@prisma/client';

@Controller('collections')
@UseGuards(JwtAuthGuard, EnsureUserGuard)
export class CollectionsController {
  constructor(
    private readonly collections: CollectionsRepository,
    private readonly bookmarks: BookmarksRepository,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListCollectionsQuery,
  ): Promise<Collection[]> {
    return this.collections.listForOwner(user.sub, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Collection> {
    return this.collections.findOwned(user.sub, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateCollectionDto,
  ): Promise<Collection> {
    return this.collections.createForOwner(user.sub, body.name);
  }

  @Put(':id')
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateCollectionDto,
  ): Promise<Collection> {
    return this.collections.replaceOwned(user.sub, id, body.name);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: PatchCollectionDto,
  ): Promise<Collection> {
    return this.collections.patchOwned(user.sub, id, { name: body.name });
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.collections.deleteOwned(user.sub, id);
  }

  /**
   * GET /collections/:id/bookmarks
   * Returns only the bookmarks in this collection that belong to the
   * caller. If the collection is not the caller's, returns 404 (not 403)
   * to avoid leaking that it exists.
   */
  @Get(':id/bookmarks')
  async listBookmarks(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Bookmark[]> {
    // Throws 404 if the collection isn't owned by the caller.
    await this.collections.findOwned(user.sub, id);
    return this.bookmarks.listForOwnerInCollection(user.sub, id);
  }
}