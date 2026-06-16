import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { NotificationService } from '../notifications/notification.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private notificationService: NotificationService,
    private cache: CacheService,
  ) {}

  // ==========================================
  // GET WISHLIST
  // ==========================================

  async getWishlist(userId: string) {
    const cacheKey = `wishlist:${userId}`;
    
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const wishlist = await this.prisma.wishlist.findFirst({
      where: {
        userId,
        isDefault: true,
      },
      include: {
        items: {
          include: {
            listing: {
              include: {
                images: {
                  where: { isCover: true },
                  take: 1,
                },
                user: {
                  select: {
                    id: true,
                    username: true,
                    avatarUrl: true,
                    ratingAvg: true,
                    isVerified: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!wishlist) {
      // Create default wishlist
      return this.createDefaultWishlist(userId);
    }

    // Check for price drops
    await this.checkPriceDrops(userId, wishlist.items);

    const result = {
      ...wishlist,
      items: wishlist.items.map((item) => ({
        ...item,
        hasPriceDrop: item.listing.price < item.addedPrice * 0.9,
        priceDropPercent: ((item.addedPrice - item.listing.price) / item.addedPrice) * 100,
      })),
    };

    await this.cache.set(cacheKey, result, 60);

    return result;
  }

  // ==========================================
  // ADD TO WISHLIST
  // ==========================================

  async addToWishlist(userId: string, listingId: string, notes?: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId === userId) {
      throw new ForbiddenException('You cannot add your own listing to wishlist');
    }

    // Get or create default wishlist
    let wishlist = await this.prisma.wishlist.findFirst({
      where: {
        userId,
        isDefault: true,
      },
    });

    if (!wishlist) {
      wishlist = await this.createDefaultWishlist(userId);
    }

    // Check if already exists
    const existing = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        listingId,
      },
    });

    if (existing) {
      return existing;
    }

    const item = await this.prisma.wishlistItem.create({
      data: {
        wishlistId: wishlist.id,
        listingId,
        notes,
        addedPrice: listing.price,
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
      },
    });

    // Update wishlist count
    await this.prisma.wishlist.update({
      where: { id: wishlist.id },
      data: {
        itemCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    // Invalidate cache
    await this.cache.delete(`wishlist:${userId}`);

    // Emit event
    await this.eventBus.emit({
      name: 'wishlist.added',
      payload: { userId, listingId, wishlistId: wishlist.id },
      metadata: { correlationId: `wishlist_${userId}_${listingId}` },
      timestamp: new Date(),
    });

    return item;
  }

  // ==========================================
  // REMOVE FROM WISHLIST
  // ==========================================

  async removeFromWishlist(userId: string, listingId: string) {
    const wishlist = await this.prisma.wishlist.findFirst({
      where: {
        userId,
        isDefault: true,
      },
    });

    if (!wishlist) {
      throw new NotFoundException('Wishlist not found');
    }

    const item = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        listingId,
      },
    });

    if (!item) {
      throw new NotFoundException('Item not found in wishlist');
    }

    await this.prisma.wishlistItem.delete({
      where: { id: item.id },
    });

    // Update wishlist count
    await this.prisma.wishlist.update({
      where: { id: wishlist.id },
      data: {
        itemCount: { decrement: 1 },
        updatedAt: new Date(),
      },
    });

    // Invalidate cache
    await this.cache.delete(`wishlist:${userId}`);

    // Emit event
    await this.eventBus.emit({
      name: 'wishlist.removed',
      payload: { userId, listingId },
      metadata: { correlationId: `wishlist_${userId}_${listingId}` },
      timestamp: new Date(),
    });

    return { success: true };
  }

  // ==========================================
  // CHECK WISHLIST STATUS
  // ==========================================

  async isInWishlist(userId: string, listingId: string): Promise<boolean> {
    const wishlist = await this.prisma.wishlist.findFirst({
      where: {
        userId,
        isDefault: true,
      },
    });

    if (!wishlist) return false;

    const item = await this.prisma.wishlistItem.findFirst({
      where: {
        wishlistId: wishlist.id,
        listingId,
      },
    });

    return !!item;
  }

  // ==========================================
  // PRICE DROP DETECTION
  // ==========================================

  async checkPriceDrops(userId: string, items: any[]) {
    const priceDrops: any[] = [];

    for (const item of items) {
      const listing = await this.prisma.listing.findUnique({
        where: { id: item.listingId },
        select: { price: true, title: true },
      });

      if (!listing) continue;

      const priceDrop = item.addedPrice - listing.price;
      const dropPercent = (priceDrop / item.addedPrice) * 100;

      if (dropPercent > 10 && !item.priceDropNotified) {
        priceDrops.push({
          listingId: item.listingId,
          oldPrice: item.addedPrice,
          newPrice: listing.price,
          dropAmount: priceDrop,
          dropPercent,
          title: listing.title,
        });

        // Update notification flag
        await this.prisma.wishlistItem.update({
          where: { id: item.id },
          data: {
            priceDropNotified: true,
            lastNotifiedPrice: listing.price,
          },
        });

        // Create price drop notification
        await this.prisma.priceDropNotification.create({
          data: {
            userId,
            listingId: item.listingId,
            oldPrice: item.addedPrice,
            newPrice: listing.price,
            dropAmount: priceDrop,
            dropPercent,
          },
        });

        // Send notification
        await this.notificationService.create({
          userId,
          type: 'PRICE_DROP',
          title: `💰 Prix en baisse !`,
          body: `"${listing.title}" est passé de ${item.addedPrice} DT à ${listing.price} DT`,
          icon: '💰',
          link: `/listing/${item.listingId}`,
        });
      }
    }

    return priceDrops;
  }

  // ==========================================
  // CREATE DEFAULT WISHLIST
  // ==========================================

  private async createDefaultWishlist(userId: string) {
    return this.prisma.wishlist.create({
      data: {
        userId,
        name: 'Mes favoris',
        isDefault: true,
      },
    });
  }

  // ==========================================
  // GET RECOMMENDATIONS
  // ==========================================

  async getRecommendations(userId: string, limit: number = 10) {
    // Get user's wishlist items
    const wishlist = await this.prisma.wishlist.findFirst({
      where: {
        userId,
        isDefault: true,
      },
      include: {
        items: {
          include: {
            listing: true,
          },
        },
      },
    });

    if (!wishlist || wishlist.items.length === 0) {
      // Return trending listings
      return this.getTrendingListings(limit);
    }

    // Extract categories and platforms from wishlist
    const categories = wishlist.items.map((item) => item.listing.category);
    const platforms = wishlist.items.map((item) => item.listing.platform).filter(Boolean);

    // Find similar listings
    const recommendations = await this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        userId: { not: userId },
        OR: [
          { category: { in: categories } },
          { platform: { in: platforms } },
        ],
        NOT: {
          id: { in: wishlist.items.map((item) => item.listingId) },
        },
      },
      include: {
        images: {
          where: { isCover: true },
          take: 1,
        },
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            ratingAvg: true,
          },
        },
      },
      orderBy: {
        viewsCount: 'desc',
      },
      take: limit,
    });

    return recommendations;
  }

  private async getTrendingListings(limit: number) {
    return this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
      },
      include: {
        images: {
          where: { isCover: true },
          take: 1,
        },
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            ratingAvg: true,
          },
        },
      },
      orderBy: {
        viewsCount: 'desc',
      },
      take: limit,
    });
  }

  // ==========================================
  // GET PRICE DROP NOTIFICATIONS
  // ==========================================

  async getPriceDropNotifications(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      this.prisma.priceDropNotification.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          listing: {
            include: {
              images: {
                where: { isCover: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.priceDropNotification.count({ where: { userId } }),
    ]);

    return {
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async markPriceDropRead(userId: string, notificationId: string) {
    const notification = await this.prisma.priceDropNotification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.priceDropNotification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }
}