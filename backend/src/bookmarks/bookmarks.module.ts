import { Module } from '@nestjs/common';
import { BookmarksController } from './bookmarks.controller';
import { BookmarksRepository } from './bookmarks.repository';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [BookmarksController],
  providers: [BookmarksRepository],
  exports: [BookmarksRepository],
})
export class BookmarksModule {}