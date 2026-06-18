import { IsString, IsOptional } from 'class-validator';

export class UpdateReservationDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  message?: string;
}