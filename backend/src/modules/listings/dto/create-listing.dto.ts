import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateListingDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsIn(['GAME', 'CONSOLE', 'ACCESSORY', 'COLLECTIBLE', 'MERCH'])
  category: string;

  @IsString()
  @IsOptional()
  @IsIn(['PS5', 'PS4', 'SWITCH', 'XBOX', 'PC', 'MOBILE', 'RETRO'])
  platform?: string;

  @IsString()
  @IsIn(['NEW', 'LIKE_NEW', 'GOOD', 'USED', 'FAIR', 'REFURBISHED'])
  condition: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsBoolean()
  @IsOptional()
  isNegotiable?: boolean;

  @IsBoolean()
  @IsOptional()
  acceptsSwap?: boolean;

  @IsString()
  @IsOptional()
  location?: string;
}
