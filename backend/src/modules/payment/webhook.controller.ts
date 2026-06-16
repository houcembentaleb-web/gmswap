import { Controller, Post, Headers, RawBody } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('webhooks/stripe')
export class WebhookController {
  constructor(private paymentService: PaymentService) {}

  @Post()
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @RawBody() rawBody: Buffer,
  ) {
    return this.paymentService.handleWebhook(signature, rawBody);
  }
}