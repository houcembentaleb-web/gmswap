import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { CreateReservationDto, UpdateReservationDto } from './dto';

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private eventBus: EventBusService,
  ) {}

  // ==========================================
  // CREATE
  // ==========================================

  async create(userId: string, dto: CreateReservationDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      include: { user: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId === userId) {
      throw new ForbiddenException('You cannot reserve your own listing');
    }

    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Listing is not available');
    }

    // Check existing reservation
    const existing = await this.prisma.reservation.findFirst({
      where: {
        listingId: dto.listingId,
        status: { in: ['PENDING', 'ACCEPTED'] },
      },
    });

    if (existing) {
      throw new BadRequestException('Listing is already reserved');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const reservation = await this.prisma.reservation.create({
      data: {
        listingId: dto.listingId,
        buyerId: userId,
        sellerId: listing.userId,
        message: dto.message,
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
      payload: { reservationId: reservation.id, listingId: dto.listingId },
      metadata: { correlationId: `reservation_${reservation.id}` },
      timestamp: new Date(),
    });

    return reservation;
  }

  // ==========================================
  // READ
  // ==========================================

  async findAll(userId: string, role: 'buyer' | 'seller') {
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

  async findOne(userId: string, reservationId: string) {
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
  // UPDATE STATUS
  // ==========================================

  async accept(userId: string, reservationId: string) {
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

    if (reservation.sellerId !== userId) {
      throw new ForbiddenException('You are not the seller');
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException('Reservation is not pending');
    }

    if (reservation.expiresAt < new Date()) {
      throw new BadRequestException('Reservation has expired');
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

  async reject(userId: string, reservationId: string, reason?: string) {
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

    if (reservation.sellerId !== userId) {
      throw new ForbiddenException('You are not the seller');
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestException('Reservation is not pending');
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

  async cancel(userId: string, reservationId: string) {
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

    if (reservation.buyerId !== userId && reservation.sellerId !== userId) {
      throw new ForbiddenException('You are not part of this reservation');
    }

    if (reservation.status !== 'PENDING' && reservation.status !== 'ACCEPTED') {
      throw new BadRequestException('Reservation cannot be cancelled');
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    // Reset listing status
    await this.prisma.listing.update({
      where: { id: reservation.listingId },
      data: { status: 'ACTIVE' },
    });

    // Notify other party
    const otherUserId = reservation.buyerId === userId ? reservation.sellerId : reservation.buyerId;
    await this.notificationService.create({
      userId: otherUserId,
      type: 'RESERVATION',
      title: '❌ Réservation annulée',
      body: `La réservation pour "${reservation.listing.title}" a été annulée`,
      icon: '❌',
      link: `/reservations/${reservationId}`,
    });

    return updated;
  }

  async complete(userId: string, reservationId: string) {
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

    if (reservation.buyerId !== userId && reservation.sellerId !== userId) {
      throw new ForbiddenException('You are not part of this reservation');
    }

    if (reservation.status !== 'ACCEPTED') {
      throw new BadRequestException('Only accepted reservations can be completed');
    }

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Update listing status
    await this.prisma.listing.update({
      where: { id: reservation.listingId },
      data: { status: 'SOLD' },
    });

    // Create transaction record
    await this.prisma.transaction.create({
      data: {
        listingId: reservation.listingId,
        buyerId: reservation.buyerId,
        sellerId: reservation.sellerId,
        amount: reservation.listing.price,
        fee: reservation.listing.price * 0.05,
        netAmount: reservation.listing.price * 0.95,
        status: 'COMPLETED',
        completedAt: new Date(),
      },
    });

    // Notify both parties
    await this.notificationService.create({
      userId: reservation.buyerId,
      type: 'RESERVATION',
      title: '🎉 Transaction terminée',
      body: `La transaction pour "${reservation.listing.title}" est complète`,
      icon: '🎉',
      link: `/reservations/${reservationId}`,
    });

    await this.notificationService.create({
      userId: reservation.sellerId,
      type: 'RESERVATION',
      title: '🎉 Transaction terminée',
      body: `La transaction pour "${reservation.listing.title}" est complète`,
      icon: '🎉',
      link: `/reservations/${reservationId}`,
    });

    // Emit event
    await this.eventBus.emit({
      name: 'reservation.completed',
      payload: { reservationId, listingId: reservation.listingId },
      metadata: { correlationId: `reservation_${reservationId}` },
      timestamp: new Date(),
    });

    return updated;
  }
}