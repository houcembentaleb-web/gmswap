import { IsString, IsOptional, IsNumber, IsEnum, Min, Max, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchQueryDto {
  @IsString()
  @IsOptional()
  q?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  platform?: string;

  @IsString()
  @IsOptional()
  condition?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  minPrice?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  maxPrice?: number;

  @IsString()
  @IsOptional()
  @IsEnum(['relevance', 'newest', 'oldest', 'price_asc', 'price_desc', 'popular', 'trending', 'rating'])
  sort?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(5)
  minRating?: number;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  isNegotiable?: string;

  @IsString()
  @IsOptional()
  acceptsSwap?: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  tags?: string[];

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SearchFiltersDto extends SearchQueryDto {
  // Extended filters for internal use
}