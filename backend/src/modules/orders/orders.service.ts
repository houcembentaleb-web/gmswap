import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PaymentService } from '../payment/payment.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private paymentService: PaymentService,
    private eventBus: EventBusService,
    private notificationService: NotificationService,
  ) {}

  // ==========================================
  // CREATE ORDER
  // ==========================================

  async createOrder(data: {
    listingId: string;
    buyerId: string;
    buyerMessage?: string;
    shippingAddress?: any;
  }) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: data.listingId },
      include: { user: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId === data.buyerId) {
      throw new ForbiddenException('Cannot buy your own listing');
    }

    if (listing.status !== 'ACTIVE') {
      throw new ForbiddenException('Listing is not available');
    }

    // Calculate fees (example: 5% platform fee)
    const fee = listing.price * 0.05;
    const total = listing.price + fee;

    const order = await this.prisma.order.create({
      data: {
        listingId: data.listingId,
        buyerId: data.buyerId,
        sellerId: listing.userId,
        amount: listing.price,
        fee,
        total,
        buyerMessage: data.buyerMessage,
        shippingAddress: data.shippingAddress,
        status: 'PENDING',
      },
    });

    // Create Stripe Payment Intent
    const paymentIntent = await this.paymentService.createPaymentIntent({
      amount: total,
      currency: 'TND',
      orderId: order.id,
      metadata: {
        orderId: order.id,
        listingId: listing.id,
        buyerId: data.buyerId,
        sellerId: listing.userId,
      },
    });

    // Update order with payment intent
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        stripeSessionId: paymentIntent.client_secret,
      },
    });

    // Create transaction record
    await this.prisma.transaction.create({
      data: {
        orderId: order.id,
        amount: total,
        fee,
        netAmount: listing.price,
        stripePaymentIntentId: paymentIntent.id,
        status: 'PENDING',
      },
    });

    // Notify seller
    await this.notificationService.notifyNewOrder(
      listing.userId,
      order.id,
      listing.title,
      data.buyerId,
    );

    // Emit event
    await this.eventBus.emit({
      name: 'order.created',
      payload: { orderId: order.id, listingId: listing.id },
      metadata: { correlationId: `order_${order.id}` },
      timestamp: new Date(),
    });

    return {
      order,
      clientSecret: paymentIntent.client_secret,
    };
  }

  // ==========================================
  // GET ORDERS
  // ==========================================

  async getOrders(userId: string, role: 'buyer' | 'seller') {
    const where = role === 'buyer'
      ? { buyerId: userId }
      : { sellerId: userId };

    return this.prisma.order.findMany({
      where,
      include: {
        listing: {
          include: {
            images: {
              where: { isCover: true },
              take: 1,
            },
          },
        },
        buyer: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        transaction: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: {
          include: {
            images: true,
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
        buyer: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        transaction: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('You do not have access to this order');
    }

    return order;
  }

  // ==========================================
  // UPDATE ORDER STATUS
  // ==========================================

  async updateStatus(orderId: string, userId: string, status: string, data?: any) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Permission check
    const isBuyer = order.buyerId === userId;
    const isSeller = order.sellerId === userId;

    if (!isBuyer && !isSeller) {
      throw new ForbiddenException('You do not have permission');
    }

    const validTransitions: Record<string, string[]> = {
      PENDING: ['PAID', 'CANCELLED'],
      PAID: ['PROCESSING', 'REFUNDED'],
      PROCESSING: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED', 'REFUNDED'],
      DELIVERED: ['COMPLETED', 'REFUNDED'],
      COMPLETED: [],
      CANCELLED: [],
      REFUNDED: [],
    };

    if (!validTransitions[order.status]?.includes(status)) {
      throw new ForbiddenException(`Invalid status transition from ${order.status} to ${status}`);
    }

    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    // Update timeline
    switch (status) {
      case 'PAID':
        updateData.paidAt = new Date();
        break;
      case 'PROCESSING':
        updateData.processedAt = new Date();
        break;
      case 'SHIPPED':
        updateData.shippedAt = new Date();
        updateData.trackingNumber = data?.trackingNumber;
        updateData.carrier = data?.carrier;
        break;
      case 'DELIVERED':
        updateData.deliveredAt = new Date();
        break;
      case 'COMPLETED':
        updateData.completedAt = new Date();
        // Mark listing as sold
        await this.prisma.listing.update({
          where: { id: order.listingId },
          data: { status: 'SOLD' },
        });
        break;
      case 'CANCELLED':
        updateData.cancelledAt = new Date();
        break;
      case 'REFUNDED':
        updateData.refundedAt = new Date();
        break;
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    // Emit event for notifications
    await this.eventBus.emit({
      name: `order.${status.toLowerCase()}`,
      payload: { orderId, userId, order: updatedOrder },
      metadata: { correlationId: `order_${orderId}` },
      timestamp: new Date(),
    });

    // Notify other party
    const receiverId = isBuyer ? order.sellerId : order.buyerId;
    await this.notificationService.create({
      userId: receiverId,
      type: 'ORDER',
      title: `Commande #${orderId.slice(0, 8)} ${status}`,
      body: `Votre commande est maintenant "${status}"`,
      icon: '📦',
      link: `/orders/${orderId}`,
    });

    return updatedOrder;
  }

  // ==========================================
  // GET ORDER STATS
  // ==========================================

  async getOrderStats(userId: string) {
    const [total, pending, paid, shipped, completed] = await Promise.all([
      this.prisma.order.count({
        where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      }),
      this.prisma.order.count({
        where: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
          status: 'PENDING',
        },
      }),
      this.prisma.order.count({
        where: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
          status: 'PAID',
        },
      }),
      this.prisma.order.count({
        where: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
          status: 'SHIPPED',
        },
      }),
      this.prisma.order.count({
        where: {
          OR: [{ buyerId: userId }, { sellerId: userId }],
          status: 'COMPLETED',
        },
      }),
    ]);

    return {
      total,
      pending,
      paid,
      shipped,
      completed,
    };
  }
}