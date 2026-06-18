import { IsString, IsUUID, IsOptional } from 'class-validator';

export class CreateReservationDto {
  @IsUUID()
  listingId: string;

  @IsString()
  @IsOptional()
  message?: string;
}