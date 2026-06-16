import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { QueueService } from '../../infrastructure/queue/queue.service';

// Définition des types de notification
export type NotificationType = 
  | 'MESSAGE'
  | 'LISTING'
  | 'DEAL'
  | 'REVIEW'
  | 'SYSTEM'
  | 'RESERVATION'
  | 'PAYMENT'
  | 'MODERATION'
  | 'WISHLIST'
  | 'PRICE_DROP'
  | 'TRANSACTION'
  | 'ORDER';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private queueService: QueueService,
  ) {}

  // ==========================================
  // CREATE NOTIFICATION
  // ==========================================

  async create(data: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    icon?: string;
    link?: string;
    referenceId?: string;
    referenceType?: string;
    priority?: number;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        body: data.body,
        icon: data.icon,
        link: data.link,
        referenceId: data.referenceId,
        referenceType: data.referenceType,
        priority: data.priority || 0,
      },
    });

    // Emit real-time event via WebSocket
    this.eventEmitter.emit('notification.created', {
      userId: data.userId,
      notification,
    });

    // Queue push notification (async)
    await this.queueService.addJob('notification', {
      name: 'push',
      payload: {
        userId: data.userId,
        title: data.title,
        body: data.body,
        link: data.link,
        notificationId: notification.id,
      },
    });

    this.logger.debug(`Notification created for user ${data.userId}: ${data.title}`);

    return notification;
  }

  // ==========================================
  // TEMPLATES
  // ==========================================

  async notifyNewMessage(
    userId: string,
    conversationId: string,
    senderName: string,
    preview: string,
  ) {
    return this.create({
      userId,
      type: 'MESSAGE',
      title: `💬 ${senderName}`,
      body: preview.length > 80 ? `${preview.substring(0, 80)}...` : preview,
      icon: '💬',
      link: `/messages/${conversationId}`,
      referenceId: conversationId,
      referenceType: 'CONVERSATION',
      priority: 1,
    });
  }

  async notifyDealCompleted(
    userId: string,
    listingId: string,
    listingTitle: string,
    role: 'buyer' | 'seller',
  ) {
    const emoji = role === 'seller' ? '🎉' : '🎮';
    const title = role === 'seller' 
      ? `🎉 Votre annonce a été vendue !`
      : `🎮 Félicitations pour votre achat !`;

    return this.create({
      userId,
      type: 'DEAL',
      title,
      body: `"${listingTitle}" - ${role === 'seller' ? 'Transaction terminée' : 'Jeu reçu'}`,
      icon: emoji,
      link: `/listing/${listingId}`,
      referenceId: listingId,
      referenceType: 'LISTING',
      priority: 1,
    });
  }

  async notifyReviewReceived(
    userId: string,
    reviewerName: string,
    score: number,
    listingTitle?: string,
  ) {
    const stars = '⭐'.repeat(Math.min(score, 5));
    return this.create({
      userId,
      type: 'REVIEW',
      title: `⭐ Nouvel avis de ${reviewerName}`,
      body: `${stars} - ${listingTitle ? `Pour "${listingTitle}"` : ''}`,
      icon: '⭐',
      link: `/profile/${userId}`,
      referenceId: userId,
      referenceType: 'USER',
      priority: 0,
    });
  }

  async notifyListingBoosted(
    userId: string,
    listingId: string,
    listingTitle: string,
  ) {
    return this.create({
      userId,
      type: 'LISTING',
      title: '🚀 Annonce boostée',
      body: `"${listingTitle}" est maintenant mis en avant pour 7 jours`,
      icon: '🚀',
      link: `/listing/${listingId}`,
      referenceId: listingId,
      referenceType: 'LISTING',
      priority: 0,
    });
  }

  async notifyListingExpiring(
    userId: string,
    listingId: string,
    listingTitle: string,
    daysLeft: number,
  ) {
    return this.create({
      userId,
      type: 'LISTING',
      title: `⏰ Votre annonce expire dans ${daysLeft} jours`,
      body: `"${listingTitle}" - Renouvelez-la pour rester visible`,
      icon: '⏰',
      link: `/listing/${listingId}/edit`,
      referenceId: listingId,
      referenceType: 'LISTING',
      priority: 0,
    });
  }

  async notifyNewWishlistMatch(
    userId: string,
    listingId: string,
    listingTitle: string,
    price: number,
  ) {
    return this.create({
      userId,
      type: 'WISHLIST',
      title: `🎯 Nouvelle annonce correspond à vos critères`,
      body: `"${listingTitle}" - ${price} DT`,
      icon: '🎯',
      link: `/listing/${listingId}`,
      referenceId: listingId,
      referenceType: 'LISTING',
      priority: 1,
    });
  }

  async notifyNewReservation(
    userId: string,
    reservationId: string,
    listingTitle: string,
    buyerId: string,
  ) {
    return this.create({
      userId,
      type: 'RESERVATION',
      title: '📦 Nouvelle réservation',
      body: `Votre annonce "${listingTitle}" a été réservée`,
      icon: '📦',
      link: `/reservations/${reservationId}`,
      referenceId: reservationId,
      referenceType: 'RESERVATION',
      priority: 1,
    });
  }

  async notifyNewOrder(
    userId: string,
    orderId: string,
    listingTitle: string,
    buyerId: string,
  ) {
    return this.create({
      userId,
      type: 'ORDER',
      title: '🛒 Nouvelle commande',
      body: `Vous avez reçu une commande pour "${listingTitle}"`,
      icon: '🛒',
      link: `/orders/${orderId}`,
      referenceId: orderId,
      referenceType: 'ORDER',
      priority: 1,
    });
  }

  async notifyPriceDrop(
    userId: string,
    listingId: string,
    listingTitle: string,
    oldPrice: number,
    newPrice: number,
  ) {
    return this.create({
      userId,
      type: 'PRICE_DROP',
      title: '💰 Prix en baisse !',
      body: `"${listingTitle}" est passé de ${oldPrice} DT à ${newPrice} DT`,
      icon: '💰',
      link: `/listing/${listingId}`,
      referenceId: listingId,
      referenceType: 'LISTING',
      priority: 1,
    });
  }

  async notifyTransactionCompleted(
    userId: string,
    transactionId: string,
    listingTitle: string,
    role: 'buyer' | 'seller',
  ) {
    const emoji = role === 'buyer' ? '📦' : '🎉';
    const title = role === 'buyer' 
      ? '📦 Transaction terminée'
      : '🎉 Transaction terminée';

    return this.create({
      userId,
      type: 'TRANSACTION',
      title,
      body: `"${listingTitle}" - ${role === 'buyer' ? 'Vous avez reçu votre article' : 'Vous avez vendu votre article'}`,
      icon: emoji,
      link: `/transactions/${transactionId}`,
      referenceId: transactionId,
      referenceType: 'TRANSACTION',
      priority: 1,
    });
  }

  // ==========================================
  // GET NOTIFICATIONS
  // ==========================================

  async getNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { type?: NotificationType; isRead?: boolean },
  ) {
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (filters?.type) where.type = filters.type;
    if (filters?.isRead !== undefined) where.isRead = filters.isRead;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    const unreadCount = await this.getUnreadCount(userId);

    return {
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        unreadCount,
      },
    };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  // ==========================================
  // MARK AS READ
  // ==========================================

  async markAsRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new Error('Unauthorized');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    // Emit read event
    this.eventEmitter.emit('notification.read', {
      userId,
      notificationId,
    });

    return updated;
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    const unreadCount = await this.getUnreadCount(userId);

    this.eventEmitter.emit('notification.all_read', {
      userId,
      count: result.count,
    });

    return {
      updated: result.count,
      unreadCount,
    };
  }

  // ==========================================
  // DELETE
  // ==========================================

  async deleteNotification(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new Error('Unauthorized');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });

    return { success: true };
  }

  async deleteAllRead(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: {
        userId,
        isRead: true,
      },
    });

    return { deleted: result.count };
  }

  // ==========================================
  // CLEANUP (Scheduled job)
  // ==========================================

  async cleanupOldNotifications() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.notification.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
        isRead: true,
      },
    });

    this.logger.log(`Cleaned up ${result.count} old notifications`);

    return { deleted: result.count };
  }

  // ==========================================
  // BULK CREATE (for system notifications)
  // ==========================================

  async bulkCreate(
    notifications: Array<{
      userId: string;
      type: NotificationType;
      title: string;
      body: string;
      icon?: string;
      link?: string;
    }>,
  ) {
    const results = [];
    for (const notif of notifications) {
      const result = await this.create(notif);
      results.push(result);
    }
    return results;
  }
}
