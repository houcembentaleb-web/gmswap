import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Headers,
  RawBody,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CreatePaymentIntentDto } from './dto/payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('intent')
  async createPaymentIntent(@Request() req, @Body() dto: CreatePaymentIntentDto) {
    return this.paymentsService.createPaymentIntent(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('confirm')
  async confirmPayment(@Body() body: { paymentIntentId: string }) {
    return this.paymentsService.confirmPayment(body.paymentIntentId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:orderId')
  async getOrderPayment(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.paymentsService.getOrderPayment(orderId);
  }

  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @RawBody() rawBody: Buffer,
  ) {
    return this.paymentsService.handleWebhook(signature, rawBody);
  }
}