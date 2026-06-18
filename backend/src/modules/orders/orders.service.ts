import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationService } from '../notifications/notification.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { CreateOrderDto, UpdateOrderDto } from './dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private paymentsService: PaymentsService,
    private notificationService: NotificationService,
    private eventBus: EventBusService,
  ) {}

  // ==========================================
  // CREATE ORDER
  // ==========================================

  async create(userId: string, dto: CreateOrderDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      include: { user: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId === userId) {
      throw new ForbiddenException('You cannot buy your own listing');
    }

    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Listing is not available');
    }

    // Calculate fees (5% platform fee)
    const fee = listing.price * 0.05;
    const total = listing.price + fee;

    const order = await this.prisma.order.create({
      data: {
        listingId: dto.listingId,
        buyerId: userId,
        sellerId: listing.userId,
        amount: listing.price,
        fee,
        total,
        paymentMethod: dto.paymentMethod,
        shippingAddress: dto.shippingAddress,
        buyerMessage: dto.message,
        status: 'PENDING',
      },
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
      },
    });

    // Update listing status
    await this.prisma.listing.update({
      where: { id: dto.listingId },
      data: { status: 'RESERVED' },
    });

    // Process payment based on method
    let paymentResult = null;
    if (dto.paymentMethod === 'CARD' && dto.paymentIntentId) {
      paymentResult = await this.paymentsService.confirmPayment(dto.paymentIntentId);
      if (paymentResult.status === 'succeeded') {
        await this.updateStatus(userId, order.id, { status: 'PAID' });
      }
    } else if (dto.paymentMethod === 'CASH') {
      // Cash on delivery - no immediate payment
      this.logger.log(`Order ${order.id} created with cash on delivery`);
    }

    // Notify seller
    await this.notificationService.create({
      userId: listing.userId,
      type: 'ORDER',
      title: '🛒 Nouvelle commande',
      body: `Vous avez reçu une commande pour "${listing.title}"`,
      icon: '🛒',
      link: `/orders/${order.id}`,
    });

    // Notify buyer
    await this.notificationService.create({
      userId,
      type: 'ORDER',
      title: '📦 Commande créée',
      body: `Votre commande pour "${listing.title}" a été créée`,
      icon: '📦',
      link: `/orders/${order.id}`,
    });

    // Emit event
    await this.eventBus.emit({
      name: 'order.created',
      payload: { orderId: order.id, listingId: dto.listingId },
      metadata: { correlationId: `order_${order.id}` },
      timestamp: new Date(),
    });

    return {
      order,
      payment: paymentResult,
    };
  }

  // ==========================================
  // READ ORDERS
  // ==========================================

  async findAll(userId: string, role: 'buyer' | 'seller') {
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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        listing: {
          include: {
            images: true,
            user: true,
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

  async updateStatus(userId: string, orderId: string, dto: UpdateOrderDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { listing: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const isBuyer = order.buyerId === userId;
    const isSeller = order.sellerId === userId;

    if (!isBuyer && !isSeller) {
      throw new ForbiddenException('You do not have permission');
    }

    // Status transitions
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

    if (!validTransitions[order.status]?.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid status transition from ${order.status} to ${dto.status}`
      );
    }

    const updateData: any = {
      status: dto.status,
    };

    // Update timeline
    switch (dto.status) {
      case 'PAID':
        updateData.paidAt = new Date();
        break;
      case 'PROCESSING':
        updateData.processedAt = new Date();
        break;
      case 'SHIPPED':
        updateData.shippedAt = new Date();
        updateData.trackingNumber = dto.trackingNumber;
        updateData.carrier = dto.carrier;
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
        // Reset listing status
        await this.prisma.listing.update({
          where: { id: order.listingId },
          data: { status: 'ACTIVE' },
        });
        break;
      case 'REFUNDED':
        updateData.refundedAt = new Date();
        break;
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: {
        listing: true,
        buyer: true,
        seller: true,
      },
    });

    // Notify other party
    const receiverId = isBuyer ? order.sellerId : order.buyerId;
    await this.notificationService.create({
      userId: receiverId,
      type: 'ORDER',
      title: `📦 Commande ${dto.status}`,
      body: `Votre commande #${orderId.slice(0, 8)} est maintenant "${dto.status}"`,
      icon: '📦',
      link: `/orders/${orderId}`,
    });

    // Emit event
    await this.eventBus.emit({
      name: `order.${dto.status.toLowerCase()}`,
      payload: { orderId, userId },
      metadata: { correlationId: `order_${orderId}` },
      timestamp: new Date(),
    });

    return updated;
  }

  async confirmDelivery(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId) {
      throw new ForbiddenException('Only the buyer can confirm delivery');
    }

    if (order.status !== 'SHIPPED') {
      throw new BadRequestException('Order must be shipped before confirming delivery');
    }

    return this.updateStatus(userId, orderId, { status: 'DELIVERED' });
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.buyerId !== userId && order.sellerId !== userId) {
      throw new ForbiddenException('You do not have permission');
    }

    if (order.status !== 'PENDING' && order.status !== 'PAID') {
      throw new BadRequestException('Order cannot be cancelled');
    }

    return this.updateStatus(userId, orderId, { status: 'CANCELLED' });
  }
}