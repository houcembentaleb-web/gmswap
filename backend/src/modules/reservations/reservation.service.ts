import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { NotificationService } from '../notifications/notification.service';

@Injectable()
export class ReservationService {
  private readonly logger = new Logger(ReservationService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private notificationService: NotificationService,
  ) {}

  // ==========================================
  // CREATE RESERVATION
  // ==========================================

  async createReservation(data: {
    listingId: string;
    buyerId: string;
    message?: string;
  }) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: data.listingId },
      include: { user: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId === data.buyerId) {
      throw new ForbiddenException('You cannot reserve your own listing');
    }

    if (listing.status !== 'ACTIVE') {
      throw new ForbiddenException('Listing is not available');
    }

    // Check existing reservation
    const existing = await this.prisma.reservation.findFirst({
      where: {
        listingId: data.listingId,
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
    });

    if (existing) {
      throw new ForbiddenException('Listing is already reserved');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48 hours reservation

    const reservation = await this.prisma.reservation.create({
      data: {
        listingId: data.listingId,
        buyerId: data.buyerId,
        sellerId: listing.userId,
        message: data.message,
        expiresAt,
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
          },
        },
        seller: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Update listing status
    await this.prisma.listing.update({
      where: { id: data.listingId },
      data: { status: 'RESERVED' },
    });

    // Notify seller
    await this.notificationService.notifyNewReservation(
      listing.userId,
      reservation.id,
      listing.title,
      data.buyerId,
    );

    // Emit event
    await this.eventBus.emit({
      name: 'reservation.created',
      payload: { reservationId: reservation.id, listingId: data.listingId },
      metadata: { correlationId: `reservation_${reservation.id}` },
      timestamp: new Date(),
    });

    return reservation;
  }

  // ==========================================
  // ACCEPT RESERVATION
  // ==========================================

  async acceptReservation(reservationId: string, sellerId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        listing: true,
        buyer: true,
        seller: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.sellerId !== sellerId) {
      throw new ForbiddenException('You are not the seller');
    }

    if (reservation.status !== 'PENDING') {
      throw new ForbiddenException('Reservation is not pending');
    }

    if (reservation.expiresAt < new Date()) {
      throw new ForbiddenException('Reservation has expired');
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    // Create transaction
    const transaction = await this.prisma.transaction.create({
      data: {
        listingId: reservation.listingId,
        buyerId: reservation.buyerId,
        sellerId: reservation.sellerId,
        amount: reservation.listing.price,
        fee: reservation.listing.price * 0.05,
        netAmount: reservation.listing.price * 0.95,
        reservationId: reservation.id,
        status: 'PENDING',
      },
    });

    // Link transaction to reservation
    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { transactionId: transaction.id },
    });

    // Notify buyer
    await this.notificationService.create({
      userId: reservation.buyerId,
      type: 'RESERVATION',
      title: '✅ Réservation acceptée',
      body: `Votre réservation pour "${reservation.listing.title}" a été acceptée`,
      icon: '✅',
      link: `/reservations/${reservationId}`,
    });

    return {
      reservation: updated,
      transaction,
    };
  }

  // ==========================================
  // REJECT RESERVATION
  // ==========================================

  async rejectReservation(reservationId: string, sellerId: string, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { listing: true, buyer: true },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.sellerId !== sellerId) {
      throw new ForbiddenException('You are not the seller');
    }

    if (reservation.status !== 'PENDING') {
      throw new ForbiddenException('Reservation is not pending');
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
      },
    });

    // Reset listing status
    await this.prisma.listing.update({
      where: { id: reservation.listingId },
      data: { status: 'ACTIVE' },
    });

    // Notify buyer
    await this.notificationService.create({
      userId: reservation.buyerId,
      type: 'RESERVATION',
      title: '❌ Réservation refusée',
      body: `Votre réservation pour "${reservation.listing.title}" a été refusée${reason ? `: ${reason}` : ''}`,
      icon: '❌',
      link: `/reservations/${reservationId}`,
    });

    return updated;
  }

  // ==========================================
  // CONFIRM TRANSACTION
  // ==========================================

  async confirmTransaction(transactionId: string, userId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        reservation: {
          include: {
            listing: true,
          },
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const isBuyer = transaction.buyerId === userId;
    const isSeller = transaction.sellerId === userId;

    if (!isBuyer && !isSeller) {
      throw new ForbiddenException('You are not part of this transaction');
    }

    if (transaction.status !== 'PENDING') {
      throw new ForbiddenException('Transaction is already completed');
    }

    const updateData: any = {};

    if (isBuyer) {
      updateData.buyerConfirmed = true;
      updateData.buyerConfirmedAt = new Date();
    }

    if (isSeller) {
      updateData.sellerConfirmed = true;
      updateData.sellerConfirmedAt = new Date();
    }

    const updated = await this.prisma.transaction.update({
      where: { id: transactionId },
      data: updateData,
    });

    // Check if both confirmed
    if (updated.buyerConfirmed && updated.sellerConfirmed) {
      await this.completeTransaction(transactionId);
    }

    return updated;
  }

  private async completeTransaction(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        reservation: {
          include: {
            listing: true,
          },
        },
      },
    });

    if (!transaction) return;

    // Update transaction
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Update reservation
    await this.prisma.reservation.update({
      where: { id: transaction.reservationId! },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Update listing
    await this.prisma.listing.update({
      where: { id: transaction.listingId },
      data: {
        status: 'SOLD',
      },
    });

    // Update seller stats
    await this.updateSellerStats(transaction.sellerId);

    // Notify both parties
    await this.notificationService.create({
      userId: transaction.buyerId,
      type: 'TRANSACTION',
      title: '🎉 Transaction terminée',
      body: `La transaction pour "${transaction.reservation?.listing.title}" est complète`,
      icon: '🎉',
      link: `/transactions/${transactionId}`,
    });

    await this.notificationService.create({
      userId: transaction.sellerId,
      type: 'TRANSACTION',
      title: '🎉 Transaction terminée',
      body: `La transaction pour "${transaction.reservation?.listing.title}" est complète`,
      icon: '🎉',
      link: `/transactions/${transactionId}`,
    });

    // Emit event
    await this.eventBus.emit({
      name: 'transaction.completed',
      payload: { transactionId },
      metadata: { correlationId: `transaction_${transactionId}` },
      timestamp: new Date(),
    });
  }

  // ==========================================
  // SELLER STATS
  // ==========================================

  private async updateSellerStats(userId: string) {
    const [listings, sales, reviews] = await Promise.all([
      this.prisma.listing.findMany({
        where: { userId },
        select: { status: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          sellerId: userId,
          status: 'COMPLETED',
        },
        select: { amount: true },
      }),
      this.prisma.review.findMany({
        where: { toUserId: userId },
        select: { score: true },
      }),
    ]);

    const totalListings = listings.length;
    const activeListings = listings.filter(l => l.status === 'ACTIVE').length;
    const soldListings = listings.filter(l => l.status === 'SOLD').length;

    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + s.amount, 0);
    const averagePrice = totalSales > 0 ? totalRevenue / totalSales : 0;

    const avgRating = reviews.reduce((sum, r) => sum + r.score, 0) / (reviews.length || 1);

    // Calculate trust score
    const trustScore = this.calculateTrustScore({
      totalSales,
      totalListings,
      averageRating: avgRating,
      totalReviews: reviews.length,
    });

    const trustLevel = this.getTrustLevel(trustScore);

    await this.prisma.sellerStats.upsert({
      where: { userId },
      create: {
        userId,
        totalListings,
        activeListings,
        soldListings,
        totalSales,
        totalRevenue,
        averagePrice,
        averageRating: avgRating || 0,
        totalReviews: reviews.length,
        trustScore,
        trustLevel,
      },
      update: {
        totalListings,
        activeListings,
        soldListings,
        totalSales,
        totalRevenue,
        averagePrice,
        averageRating: avgRating || 0,
        totalReviews: reviews.length,
        trustScore,
        trustLevel,
        updatedAt: new Date(),
      },
    });
  }

  private calculateTrustScore(metrics: {
    totalSales: number;
    totalListings: number;
    averageRating: number;
    totalReviews: number;
  }): number {
    let score = 0;

    // Sales (0-40)
    score += Math.min(metrics.totalSales * 2, 40);

    // Rating (0-30)
    score += (metrics.averageRating / 5) * 30;

    // Reviews (0-20)
    score += Math.min(metrics.totalReviews * 2, 20);

    // Listing activity (0-10)
    score += Math.min(metrics.totalListings * 0.5, 10);

    return Math.min(100, Math.round(score));
  }

  private getTrustLevel(score: number): string {
    if (score >= 80) return 'PLATINUM';
    if (score >= 60) return 'GOLD';
    if (score >= 40) return 'SILVER';
    if (score >= 20) return 'BRONZE';
    return 'NEW';
  }

  // ==========================================
  // GET RESERVATIONS
  // ==========================================

  async getReservations(userId: string, role: 'buyer' | 'seller') {
    const where = role === 'buyer'
      ? { buyerId: userId }
      : { sellerId: userId };

    return this.prisma.reservation.findMany({
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

  async getReservation(reservationId: string, userId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
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
        transaction: {
          include: {
            buyer: {
              select: {
                id: true,
                username: true,
              },
            },
            seller: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reservation not found');
    }

    if (reservation.buyerId !== userId && reservation.sellerId !== userId) {
      throw new ForbiddenException('You do not have access to this reservation');
    }

    return reservation;
  }
}