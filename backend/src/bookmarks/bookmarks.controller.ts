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
  CreateBookmarkDto,
  ListBookmarksQuery,
  PatchBookmarkDto,
  UpdateBookmarkDto,
} from './bookmarks.dto';
import { BookmarksRepository } from './bookmarks.repository';
import type { Bookmark } from '@prisma/client';

@Controller('bookmarks')
@UseGuards(JwtAuthGuard, EnsureUserGuard)
export class BookmarksController {
  constructor(private readonly bookmarks: BookmarksRepository) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListBookmarksQuery,
  ): Promise<Bookmark[]> {
    return this.bookmarks.listForOwner(user.sub, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Bookmark> {
    return this.bookmarks.findOwned(user.sub, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateBookmarkDto,
  ): Promise<Bookmark> {
    return this.bookmarks.createForOwner(user.sub, body);
  }

  @Put(':id')
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: UpdateBookmarkDto,
  ): Promise<Bookmark> {
    return this.bookmarks.replaceOwned(user.sub, id, body);
  }

  @Patch(':id')
  patch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: PatchBookmarkDto,
  ): Promise<Bookmark> {
    return this.bookmarks.patchOwned(user.sub, id, body);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.bookmarks.deleteOwned(user.sub, id);
  }
}