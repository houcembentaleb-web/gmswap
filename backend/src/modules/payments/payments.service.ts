import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { CreatePaymentIntentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private eventBus: EventBusService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });
  }

  // ==========================================
  // CREATE PAYMENT INTENT
  // ==========================================

  async createPaymentIntent(userId: string, dto: CreatePaymentIntentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { listing: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId) {
      throw new Error('Unauthorized');
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(order.total * 1000), // TND to millimes
      currency: 'tnd',
      metadata: {
        orderId: order.id,
        listingId: order.listingId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
      },
      payment_method_types: ['card'],
    });

    // Save payment intent
    await this.prisma.transaction.create({
      data: {
        orderId: order.id,
        listingId: order.listingId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        amount: order.total,
        fee: order.fee,
        netAmount: order.amount,
        stripePaymentIntentId: paymentIntent.id,
        status: 'PENDING',
      },
    });

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };
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
  // GET ORDER PAYMENT
  // ==========================================

  async getOrderPayment(orderId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { orderId },
    });

    if (!transaction) {
      throw new NotFoundException('Payment not found');
    }

    return transaction;
  }

  // ==========================================
  // WEBHOOK HANDLER
  // ==========================================

  async handleWebhook(signature: string, rawBody: Buffer) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

    const event = this.stripe.webhooks.constructEvent(
      rawBody.toString(),
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
    if (!orderId) return;

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentMethod: 'CARD',
        stripePaymentIntentId: paymentIntent.id,
      },
    });

    await this.prisma.transaction.update({
      where: { stripePaymentIntentId: paymentIntent.id },
      data: {
        status: 'SUCCEEDED',
        succeededAt: new Date(),
        cardLast4: (paymentIntent.payment_method as any)?.card?.last4,
        cardBrand: (paymentIntent.payment_method as any)?.card?.brand,
      },
    });

    // Notify seller
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true, seller: true },
    });

    if (order) {
      await this.notificationService.create({
        userId: order.sellerId,
        type: 'PAYMENT',
        title: '💳 Paiement reçu',
        body: `Paiement de ${order.total} DT pour "${order.listing.title}"`,
        icon: '💳',
        link: `/orders/${orderId}`,
      });
    }

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
      data: { status: 'FAILED' },
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
        data: { status: 'REFUNDED' },
      });
    }
  }
}