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
    expiresAt.setHours(expiresAt.getHours() + 48);

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
    await this.notificationService.create({
      userId: listing.userId,
      type: 'RESERVATION',
      title: '📦 Nouvelle réservation',
      body: `Votre annonce "${listing.title}" a été réservée`,
      icon: '📦',
      link: `/reservations/${reservation.id}`,
    });

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

    // Notify buyer
    await this.notificationService.create({
      userId: reservation.buyerId,
      type: 'RESERVATION',
      title: '✅ Réservation acceptée',
      body: `Votre réservation pour "${reservation.listing.title}" a été acceptée`,
      icon: '✅',
      link: `/reservations/${reservationId}`,
    });

    return updated;
  }

  // ==========================================
  // REJECT RESERVATION
  // ==========================================

  async rejectReservation(reservationId: string, sellerId: string, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        listing: true,
        buyer: true,
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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ==========================================
  // GET RESERVATION BY ID
  // ==========================================

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

  // ==========================================
  // CONFIRM TRANSACTION (MOVED TO TRANSACTIONS)
  // ==========================================

  async confirmTransaction(transactionId: string, userId: string) {
    // Cette méthode est déplacée vers TransactionsService
    throw new Error('This method has been moved to TransactionsService');
  }
}
