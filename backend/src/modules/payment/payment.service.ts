import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe: Stripe;

  constructor(private eventBus: EventBusService) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });
  }

  // ==========================================
  // CREATE PAYMENT INTENT
  // ==========================================

  async createPaymentIntent(data: {
    amount: number;
    currency: string;
    orderId: string;
    metadata?: Record<string, string>;
  }) {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(data.amount * 1000), // TND to millimes
        currency: data.currency.toLowerCase(),
        metadata: {
          orderId: data.orderId,
          ...data.metadata,
        },
        payment_method_types: ['card'],
      });

      this.logger.log(`PaymentIntent created: ${paymentIntent.id}`);

      return {
        id: paymentIntent.id,
        client_secret: paymentIntent.client_secret,
        status: paymentIntent.status,
      };
    } catch (error) {
      this.logger.error(`Stripe error: ${error.message}`);
      throw error;
    }
  }

  // ==========================================
  // CONFIRM PAYMENT
  // ==========================================

  async confirmPayment(paymentIntentId: string) {
    const paymentIntent = await this.stripe.paymentIntents.confirm(
      paymentIntentId,
    );

    return paymentIntent;
  }

  // ==========================================
  // REFUND PAYMENT
  // ==========================================

  async refundPayment(paymentIntentId: string, amount?: number) {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amount ? Math.round(amount * 1000) : undefined,
    });

    return refund;
  }

  // ==========================================
  // WEBHOOK HANDLER
  // ==========================================

  async handleWebhook(signature: string, rawBody: string | Buffer) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    const event = this.stripe.webhooks.constructEvent(
      typeof rawBody === 'string' ? rawBody : rawBody.toString(),
      signature,
      webhookSecret,
    );

    this.logger.log(`Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.handlePaymentSuccess(paymentIntent);
        break;
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.handlePaymentFailure(paymentIntent);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await this.handleRefund(charge);
        break;
      }
    }

    return { received: true };
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
    const orderId = paymentIntent.metadata?.orderId;
    if (!orderId) {
      this.logger.warn('No orderId in payment intent metadata');
      return;
    }

    // Update order status
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentMethod: 'CARD',
      },
    });

    // Update transaction
    await this.prisma.transaction.update({
      where: { stripePaymentIntentId: paymentIntent.id },
      data: {
        status: 'SUCCEEDED',
        succeededAt: new Date(),
        cardLast4: paymentIntent.payment_method?.card?.last4,
        cardBrand: paymentIntent.payment_method?.card?.brand,
      },
    });

    // Emit event
    await this.eventBus.emit({
      name: 'payment.succeeded',
      payload: { orderId, paymentIntentId: paymentIntent.id },
      metadata: { correlationId: `payment_${paymentIntent.id}` },
      timestamp: new Date(),
    });
  }

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
    const orderId = paymentIntent.metadata?.orderId;
    if (!orderId) return;

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });

    await this.prisma.transaction.update({
      where: { stripePaymentIntentId: paymentIntent.id },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
      },
    });
  }

  private async handleRefund(charge: Stripe.Charge) {
    const paymentIntentId = charge.payment_intent as string;
    if (!paymentIntentId) return;

    const transaction = await this.prisma.transaction.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { order: true },
    });

    if (transaction) {
      await this.prisma.order.update({
        where: { id: transaction.orderId },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });

      await this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'REFUNDED',
          refundedAt: new Date(),
        },
      });
    }
  }
}