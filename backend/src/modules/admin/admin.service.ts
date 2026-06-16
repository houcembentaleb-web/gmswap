// ============================================
// 4. admin.service.ts (corrigé)
// ============================================
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { NotificationService } from '../notifications/notification.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private notificationService: NotificationService,
    private cache: CacheService,
  ) {}

  // ==========================================
  // DASHBOARD STATS
  // ==========================================

  async getDashboardStats() {
    const cacheKey = 'admin:dashboard:stats';
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached as string);

    const [
      totalUsers,
      newUsersToday,
      totalListings,
      activeListings,
      pendingListings,
      totalTransactions,
      completedTransactions,
      totalMessages,
      pendingReports,
      totalRevenue,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      this.prisma.listing.count(),
      this.prisma.listing.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.listing.count({
        where: { moderationStatus: 'PENDING' },
      }),
      this.prisma.transaction.count(),
      this.prisma.transaction.count({
        where: { status: 'COMPLETED' },
      }),
      this.prisma.message.count(),
      this.prisma.report.count({
        where: { status: 'PENDING' },
      }),
      this.prisma.transaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      }),
    ]);

    const stats = {
      users: {
        total: totalUsers,
        newToday: newUsersToday,
      },
      listings: {
        total: totalListings,
        active: activeListings,
        pending: pendingListings,
      },
      transactions: {
        total: totalTransactions,
        completed: completedTransactions,
      },
      messages: totalMessages,
      reports: {
        pending: pendingReports,
      },
      revenue: totalRevenue._sum.amount || 0,
      timestamp: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, JSON.stringify(stats), 60);
    return stats;
  }

  // ==========================================
  // RECENT ACTIVITY
  // ==========================================

  async getRecentActivity(limit: number = 20) {
    const [users, listings, transactions, reports] = await Promise.all([
      this.prisma.user.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          createdAt: true,
        },
      }),
      this.prisma.listing.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { username: true },
          },
        },
      }),
      this.prisma.transaction.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          buyer: { select: { username: true } },
          seller: { select: { username: true } },
        },
      }),
      this.prisma.report.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { username: true } },
        },
      }),
    ]);

    const activities = [
      ...users.map(u => ({
        id: u.id,
        type: 'user_joined',
        message: `Nouvel utilisateur: ${u.username}`,
        createdAt: u.createdAt,
      })),
      ...listings.map(l => ({
        id: l.id,
        type: 'listing_created',
        message: `Nouvelle annonce: ${l.title} par ${l.user.username}`,
        createdAt: l.createdAt,
      })),
      ...transactions.map(t => ({
        id: t.id,
        type: 'transaction',
        message: `Transaction ${t.status}: ${t.buyer.username} → ${t.seller.username}`,
        createdAt: t.createdAt,
      })),
      ...reports.map(r => ({
        id: r.id,
        type: 'report',
        message: `Signalement: ${r.reason} par ${r.reporter.username}`,
        createdAt: r.createdAt,
      })),
    ];

    return activities
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  // ==========================================
  // USERS MANAGEMENT
  // ==========================================

  async getUsers(params: {
    page: number;
    limit: number;
    search?: string;
    status?: string;
    sort?: string;
  }) {
    const { page, limit, search, status, sort = 'newest' } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      if (status === 'banned') where.isBanned = true;
      else if (status === 'active') where.isBanned = false;
      else if (status === 'verified') where.isVerified = true;
    }

    const orderBy: any = {};
    if (sort === 'newest') orderBy.createdAt = 'desc';
    else if (sort === 'oldest') orderBy.createdAt = 'asc';
    else if (sort === 'most_listings') orderBy.listings = { _count: 'desc' };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: {
            select: {
              listings: true,
              transactionsAsBuyer: true,
              transactionsAsSeller: true,
              messages: true,
              reports: true,
            },
          },
          reputation: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const sanitizedUsers = users.map(({ passwordHash, ...user }) => user);

    return {
      data: sanitizedUsers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserDetails(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        reputation: true,
        sellerStats: true,
        _count: {
          select: {
            listings: true,
            transactionsAsBuyer: true,
            transactionsAsSeller: true,
            messages: true,
            reports: true,
            ratingsReceived: true,
            ratingsGiven: true,
          },
        },
        listings: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            images: {
              where: { isCover: true },
              take: 1,
            },
          },
        },
        transactionsAsBuyer: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            listing: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        transactionsAsSeller: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            listing: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        reports: {
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            reporter: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async banUser(userId: string, reason: string, duration?: number, moderatorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true, isBanned: true },
    });

    if (!user) throw new NotFoundException('User not found');
    if (user.isAdmin) throw new ForbiddenException('Cannot ban admin users');
    if (user.isBanned) throw new ForbiddenException('User is already banned');

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: true,
        banReason: reason,
        isActive: false,
      },
    });

    // Revoke all sessions
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Log action
    await this.prisma.moderationAction.create({
      data: {
        moderatorId: moderatorId || 'system',
        targetType: 'USER',
        targetId: userId,
        action: 'BAN',
        reason,
        duration,
      },
    });

    // Invalidate cache
    await this.cache.delete(`user:${userId}`);
    await this.cache.delete(`admin:dashboard:stats`);

    // Notify user
    await this.notificationService.create({
      userId,
      type: 'MODERATION',
      title: '🚫 Compte suspendu',
      body: `Votre compte a été suspendu: ${reason}`,
      icon: '🚫',
    });

    return updatedUser;
  }

  async unbanUser(userId: string, moderatorId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isBanned: true },
    });

    if (!user) throw new NotFoundException('User not found');
    if (!user.isBanned) throw new ForbiddenException('User is not banned');

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: false,
        banReason: null,
        isActive: true,
      },
    });

    // Log action
    await this.prisma.moderationAction.create({
      data: {
        moderatorId: moderatorId || 'system',
        targetType: 'USER',
        targetId: userId,
        action: 'UNBAN',
      },
    });

    // Invalidate cache
    await this.cache.delete(`user:${userId}`);
    await this.cache.delete(`admin:dashboard:stats`);

    // Notify user
    await this.notificationService.create({
      userId,
      type: 'MODERATION',
      title: '✅ Compte réactivé',
      body: 'Votre compte a été réactivé',
      icon: '✅',
    });

    return updatedUser;
  }

  // ==========================================
  // LISTINGS MODERATION
  // ==========================================

  async getListings(params: {
    page: number;
    limit: number;
    status?: string;
    moderationStatus?: string;
    search?: string;
    sort?: string;
  }) {
    const { page, limit, status, moderationStatus, search, sort = 'newest' } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    
    if (status) where.status = status;
    if (moderationStatus) where.moderationStatus = moderationStatus;
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: any = {};
    if (sort === 'newest') orderBy.createdAt = 'desc';
    else if (sort === 'oldest') orderBy.createdAt = 'asc';
    else if (sort === 'views') orderBy.viewsCount = 'desc';

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              isBanned: true,
              isVerified: true,
            },
          },
          images: {
            where: { isCover: true },
            take: 1,
          },
          _count: {
            select: {
              reports: true,
              transactions: true,
              messages: true,
            },
          },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      data: listings,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getListingDetails(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            avatarUrl: true,
            isVerified: true,
            isBanned: true,
            ratingAvg: true,
            ratingCount: true,
          },
        },
        images: {
          orderBy: { position: 'asc' },
        },
        reports: {
          orderBy: { createdAt: 'desc' },
          include: {
            reporter: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
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
        messages: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            views: true,
            reports: true,
            messages: true,
            saves: true,
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return listing;
  }

  async moderateListing(
    listingId: string,
    action: 'approve' | 'reject' | 'flag' | 'delete',
    reason?: string,
    moderatorId?: string,
  ) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { user: true },
    });

    if (!listing) throw new NotFoundException('Listing not found');

    let status = listing.status;
    let moderationStatus = listing.moderationStatus;

    switch (action) {
      case 'approve':
        moderationStatus = 'APPROVED';
        status = 'ACTIVE';
        break;
      case 'reject':
        moderationStatus = 'REJECTED';
        status = 'DELETED';
        break;
      case 'flag':
        moderationStatus = 'FLAGGED';
        break;
      case 'delete':
        moderationStatus = 'REJECTED';
        status = 'DELETED';
        break;
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        status,
        moderationStatus,
        moderationReason: reason,
        moderatedAt: new Date(),
        moderatedBy: moderatorId,
      },
    });

    // Log action
    await this.prisma.moderationAction.create({
      data: {
        moderatorId: moderatorId || 'system',
        targetType: 'LISTING',
        targetId: listingId,
        action: action.toUpperCase(),
        reason,
      },
    });

    // Invalidate cache
    await this.cache.delete(`listing:${listingId}`);
    await this.cache.delete(`admin:dashboard:stats`);

    // Notify user
    if (action === 'approve') {
      await this.notificationService.create({
        userId: listing.userId,
        type: 'MODERATION',
        title: '✅ Annonce approuvée',
        body: `Votre annonce "${listing.title}" a été approuvée et est maintenant visible`,
        icon: '✅',
        link: `/listing/${listingId}`,
      });
    } else if (action === 'reject' || action === 'delete') {
      await this.notificationService.create({
        userId: listing.userId,
        type: 'MODERATION',
        title: '❌ Annonce refusée',
        body: `Votre annonce "${listing.title}" a été refusée: ${reason || 'Non conforme'}`,
        icon: '❌',
      });
    }

    return updated;
  }

  // ==========================================
  // REPORTS MANAGEMENT
  // ==========================================

  async getReports(params: {
    page: number;
    limit: number;
    status?: string;
    targetType?: string;
    sort?: string;
  }) {
    const { page, limit, status, targetType, sort = 'newest' } = params;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (targetType) where.targetType = targetType;

    const orderBy: any = {};
    if (sort === 'newest') orderBy.createdAt = 'desc';
    else if (sort === 'oldest') orderBy.createdAt = 'asc';
    else if (sort === 'priority') orderBy.priority = 'desc';

    const [reports, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          reporter: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
          moderator: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    return {
      data: reports,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getReportDetails(reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            email: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
        moderator: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    // Fetch target details
    let target = null;
    if (report.targetType === 'LISTING') {
      target = await this.prisma.listing.findUnique({
        where: { id: report.targetId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              isBanned: true,
            },
          },
          images: true,
        },
      });
    } else if (report.targetType === 'USER') {
      target = await this.prisma.user.findUnique({
        where: { id: report.targetId },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          isBanned: true,
          isVerified: true,
          ratingAvg: true,
          createdAt: true,
        },
      });
    }

    return {
      ...report,
      target,
    };
  }

  async resolveReport(
    reportId: string,
    action: string,
    note?: string,
    moderatorId?: string,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) throw new NotFoundException('Report not found');

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'RESOLVED',
        moderatorId,
        moderatorNote: note,
        action,
        resolvedAt: new Date(),
      },
    });

    // Execute action
    if (action === 'ban_user' && report.targetType === 'USER') {
      await this.banUser(report.targetId, 'Banned due to report', undefined, moderatorId);
    }

    if (action === 'delete_listing' && report.targetType === 'LISTING') {
      await this.moderateListing(report.targetId, 'delete', 'Deleted due to report', moderatorId);
    }

    // Log action
    await this.prisma.moderationAction.create({
      data: {
        moderatorId: moderatorId || 'system',
        targetType: report.targetType,
        targetId: report.targetId,
        action: 'RESOLVE_REPORT',
        reason: note,
        reportId,
      },
    });

    return updated;
  }

  async dismissReport(reportId: string, note?: string, moderatorId?: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) throw new NotFoundException('Report not found');

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: 'DISMISSED',
        moderatorId,
        moderatorNote: note || 'Dismissed by moderator',
        resolvedAt: new Date(),
      },
    });
  }

  // ==========================================
  // ANALYTICS
  // ==========================================

  async getAnalytics(days: number = 30) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      usersByDay,
      listingsByDay,
      transactionsByDay,
      revenueByDay,
    ] = await Promise.all([
      this.prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM users
        WHERE created_at >= ${startDate}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
      this.prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM listings
        WHERE created_at >= ${startDate}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
      this.prisma.$queryRaw`
        SELECT DATE(created_at) as date, COUNT(*) as count
        FROM transactions
        WHERE created_at >= ${startDate} AND status = 'COMPLETED'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
      this.prisma.$queryRaw`
        SELECT DATE(created_at) as date, SUM(amount) as total
        FROM transactions
        WHERE created_at >= ${startDate} AND status = 'COMPLETED'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
    ]);

    return {
      users: usersByDay,
      listings: listingsByDay,
      transactions: transactionsByDay,
      revenue: revenueByDay,
      period: `${days} days`,
    };
  }

  // ==========================================
  // SYSTEM ACTIONS
  // ==========================================

  async clearCache(moderatorId?: string) {
    await this.cache.invalidatePattern('*');
    
    await this.prisma.moderationAction.create({
      data: {
        moderatorId: moderatorId || 'system',
        targetType: 'SYSTEM',
        targetId: 'cache',
        action: 'CLEAR_CACHE',
      },
    });

    return { success: true };
  }

  async getSystemStatus() {
    const [dbStatus, redisStatus] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1 as connected` as any,
      this.cache.get('ping').catch(() => null),
    ]);

    return {
      database: !!dbStatus,
      redis: !!redisStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
