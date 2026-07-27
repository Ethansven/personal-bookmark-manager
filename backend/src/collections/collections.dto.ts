import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * List query. Pagination is simple offset/limit — fine for a personal
 * bookmark app. `cursor` is reserved for future cursor pagination.
 */
export class ListCollectionsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  /** Free-text match against name. Exact-substring on SQLite. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  q?: string;
}

export class CreateCollectionDto {
  @IsString()
  @Length(1, 200)
  name!: string;
}

export class UpdateCollectionDto {
  @IsString()
  @Length(1, 200)
  name!: string;
}

export class PatchCollectionDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;
}