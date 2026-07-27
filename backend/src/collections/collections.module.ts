import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsRepository } from './collections.repository';
import { BookmarksModule } from '../bookmarks/bookmarks.module';

@Module({
  imports: [BookmarksModule],
  controllers: [CollectionsController],
  providers: [CollectionsRepository],
  exports: [CollectionsRepository],
})
export class CollectionsModule {}