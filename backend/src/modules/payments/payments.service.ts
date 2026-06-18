import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { CreatePaymentIntentDto } from './dto/payment.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private eventBus: EventBusService,
  ) {}

  // ==========================================
  // CREATE PAYMENT INTENT (Simulation pour MVP)
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

    // Pour le MVP, on simule un paiement
    const paymentIntentId = `pi_sim_${Date.now()}`;

    await this.prisma.transaction.create({
      data: {
        orderId: order.id,
        listingId: order.listingId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        amount: order.total,
        fee: order.fee,
        netAmount: order.amount,
        stripePaymentIntentId: paymentIntentId,
        status: 'PENDING',
      },
    });

    return {
      clientSecret: 'sim_secret_' + paymentIntentId,
      paymentIntentId,
    };
  }

  // ==========================================
  // CONFIRM PAYMENT (Simulation)
  // ==========================================

  async confirmPayment(paymentIntentId: string) {
    // Simuler une confirmation de paiement
    return {
      id: paymentIntentId,
      status: 'succeeded',
    };
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
  // WEBHOOK HANDLER (Simulation)
  // ==========================================

  async handleWebhook(signature: string, rawBody: Buffer) {
    // Pour le MVP, on simule le webhook
    this.logger.log('Webhook received (simulated)');
    return { received: true };
  }
}
