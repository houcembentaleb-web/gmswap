import {
  IsString,
  IsNumber,
  IsUUID,
  IsOptional,
  IsEnum,
  IsObject,
  Min,
} from 'class-validator';

export class CreateOrderDto {
  @IsUUID()
  listingId: string;

  @IsEnum(['CASH', 'CARD'])
  paymentMethod: 'CASH' | 'CARD';

  @IsString()
  @IsOptional()
  paymentIntentId?: string;

  @IsObject()
  @IsOptional()
  shippingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };

  @IsString()
  @IsOptional()
  message?: string;
}