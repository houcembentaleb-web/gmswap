import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private notificationService: NotificationService,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });
  }

  // ... (les méthodes createPaymentIntent, confirmPayment, refundPayment restent identiques)

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

  // ==========================================
  // HANDLE PAYMENT SUCCESS
  // ==========================================

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
    const orderId = paymentIntent.metadata?.orderId;
    if (!orderId) {
      this.logger.warn('No orderId in payment intent metadata');
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true, buyer: true, seller: true },
    });

    if (!order) {
      this.logger.warn(`Order ${orderId} not found`);
      return;
    }

    // Mettre à jour la commande
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        paymentMethod: 'CARD',
        stripePaymentIntentId: paymentIntent.id,
      },
    });

    // Mettre à jour la transaction avec l'ID de la commande
    // On utilise le champ existant 'status' uniquement
    await this.prisma.transaction.updateMany({
      where: { orderId: orderId },
      data: {
        status: 'SUCCEEDED',
        // Pas de succeededAt → on utilise updatedAt automatiquement
      },
    });

    // Notifications et événements...
  }

  // ==========================================
  // HANDLE PAYMENT FAILURE
  // ==========================================

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
    const orderId = paymentIntent.metadata?.orderId;
    if (!orderId) return;

    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });

    await this.prisma.transaction.updateMany({
      where: { orderId: orderId },
      data: { status: 'FAILED' },
    });
  }

  // ==========================================
  // HANDLE REFUND
  // ==========================================

  private async handleRefund(charge: Stripe.Charge) {
    const paymentIntentId = charge.payment_intent as string;
    if (!paymentIntentId) return;

    const transaction = await this.prisma.transaction.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { order: { include: { buyer: true, seller: true, listing: true } } },
    });

    if (!transaction) return;

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
