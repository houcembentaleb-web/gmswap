import { IsUUID, IsNumber, IsOptional, Min } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  orderId: string;
}