import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ListBookmarksQuery {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  q?: string;

  @IsOptional()
  @IsString()
  collectionId?: string;

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
}

export class CreateBookmarkDto {
  @IsUrl({ require_protocol: true })
  @Length(1, 2048)
  url!: string;

  @IsString()
  @Length(1, 500)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  collectionId?: string;
}

export class UpdateBookmarkDto {
  @IsUrl({ require_protocol: true })
  @Length(1, 2048)
  url!: string;

  @IsString()
  @Length(1, 500)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  collectionId?: string;
}

export class PatchBookmarkDto {
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @Length(1, 2048)
  url?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  collectionId?: string;
}