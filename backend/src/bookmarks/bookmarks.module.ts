import { Module } from '@nestjs/common';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksRepository } from './bookmarks.repository';

@Module({
  controllers: [BookmarksController],
  providers: [BookmarksRepository],
  exports: [BookmarksRepository],
})
export class BookmarksModule {}