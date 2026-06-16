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

  // CRÉER UNE RÉSERVATION
  async createReservation(data: { listingId: string; buyerId: string; message?: string }) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: data.listingId },
      include: { user: true },
    });

    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.userId === data.buyerId) throw new ForbiddenException('You cannot reserve your own listing');
    if (listing.status !== 'ACTIVE') throw new ForbiddenException('Listing is not available');

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

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
          include: { images: { where: { isCover: true }, take: 1 } },
        },
        buyer: { select: { id: true, username: true } },
        seller: { select: { id: true, username: true } },
      },
    });

    await this.prisma.listing.update({
      where: { id: data.listingId },
      data: { status: 'RESERVED' },
    });

    await this.notificationService.create({
      userId: listing.userId,
      type: 'RESERVATION',
      title: '📦 Nouvelle réservation',
      body: `Votre annonce "${listing.title}" a été réservée`,
      icon: '📦',
      link: `/reservations/${reservation.id}`,
    });

    return reservation;
  }

  // ACCEPTER UNE RÉSERVATION
  async acceptReservation(reservationId: string, sellerId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { listing: true, buyer: true, seller: true },
    });

    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.sellerId !== sellerId) throw new ForbiddenException('You are not the seller');
    if (reservation.status !== 'PENDING') throw new ForbiddenException('Reservation is not pending');
    if (reservation.expiresAt < new Date()) throw new ForbiddenException('Reservation has expired');

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

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

  // REFUSER UNE RÉSERVATION
  async rejectReservation(reservationId: string, sellerId: string, reason?: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { listing: true, buyer: true },
    });

    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.sellerId !== sellerId) throw new ForbiddenException('You are not the seller');
    if (reservation.status !== 'PENDING') throw new ForbiddenException('Reservation is not pending');

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: 'REJECTED', rejectedAt: new Date() },
    });

    await this.prisma.listing.update({
      where: { id: reservation.listingId },
      data: { status: 'ACTIVE' },
    });

    await this.notificationService.create({
      userId: reservation.buyerId,
      type: 'RESERVATION',
      title: '❌ Réservation refusée',
      body: `Votre réservation pour "${reservation.listing.title}" a été refusée`,
      icon: '❌',
      link: `/reservations/${reservationId}`,
    });

    return updated;
  }

  // OBTENIR LES RÉSERVATIONS
  async getReservations(userId: string, role: 'buyer' | 'seller') {
    const where = role === 'buyer' ? { buyerId: userId } : { sellerId: userId };

    return this.prisma.reservation.findMany({
      where,
      include: {
        listing: {
          include: { images: { where: { isCover: true }, take: 1 } },
        },
        buyer: { select: { id: true, username: true, avatarUrl: true } },
        seller: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // OBTENIR UNE RÉSERVATION PAR ID
  async getReservation(reservationId: string, userId: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        listing: { include: { images: true, user: true } },
        buyer: { select: { id: true, username: true, avatarUrl: true } },
        seller: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.buyerId !== userId && reservation.sellerId !== userId) {
      throw new ForbiddenException('You do not have access to this reservation');
    }

    return reservation;
  }

  // CONFIRMER UNE TRANSACTION (SUPPRIMÉ - CAR DÉPLACÉ VERS TRANSACTIONS)
  async confirmTransaction(transactionId: string, userId: string) {
    throw new Error('This method has been moved to TransactionsService');
  }
}
