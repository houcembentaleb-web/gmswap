import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private eventBus: EventBusService,
  ) {}

  // ==========================================
  // TRACK INTERACTION
  // ==========================================

  async trackInteraction(data: {
    userId: string;
    listingId: string;
    type: string;
    weight?: number;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const interaction = await this.prisma.userInteraction.create({
      data: {
        userId: data.userId,
        listingId: data.listingId,
        type: data.type,
        weight: data.weight || 1,
        sessionId: data.sessionId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });

    // Mettre à jour les préférences utilisateur de manière asynchrone
    await this.updateUserPreferences(data.userId);

    // Invalider le cache de recommandations
    await this.invalidateRecommendations(data.userId);

    return interaction;
  }

  // ==========================================
  // GET PERSONALIZED RECOMMENDATIONS
  // ==========================================

  async getPersonalizedRecommendations(
    userId: string,
    limit: number = 20,
  ): Promise<any[]> {
    // Vérifier le cache
    const cacheKey = `recommendations:personalized:${userId}`;
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) {
      try {
        const listingIds = JSON.parse(cached) as string[];
        return this.getListingsByIds(listingIds);
      } catch {
        // Si le cache est corrompu, continuer
      }
    }

    // Récupérer les préférences utilisateur
    const preferences = await this.getUserPreferences(userId);

    // Récupérer les interactions (30 derniers jours)
    const interactions = await this.prisma.userInteraction.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      include: {
        listing: {
          include: {
            user: {
              select: {
                id: true,
                ratingAvg: true,
                isVerified: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Exclure les annonces déjà vues
    const viewedIds = interactions.map(i => i.listingId);

    // 1. Recommandations basées sur le contenu
    const contentBased = await this.getContentBasedRecommendations(
      userId,
      preferences,
      viewedIds,
      limit,
    );

    // 2. Recommandations collaboratives
    const collaborative = await this.getCollaborativeRecommendations(
      userId,
      viewedIds,
      limit,
    );

    // 3. Recommandations tendances
    const trending = await this.getTrendingRecommendations(
      viewedIds,
      limit,
    );

    // Combiner et classer
    const combined = this.combineRecommendations(
      contentBased,
      collaborative,
      trending,
      limit,
    );

    // Mettre en cache
    const ids = combined.map(r => r.id);
    await this.cache.set(cacheKey, JSON.stringify(ids), 300);

    return combined;
  }

  // ==========================================
  // CONTENT-BASED RECOMMENDATIONS
  // ==========================================

  private async getContentBasedRecommendations(
    userId: string,
    preferences: any,
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    const weights = preferences?.categoryWeights || {};

    const categories = Object.entries(weights)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 3)
      .map(([category]) => category);

    if (categories.length === 0) {
      return [];
    }

    const listings = await this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        category: { in: categories },
        id: { notIn: excludeIds },
        userId: { not: userId },
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
            isVerified: true,
          },
        },
      },
      orderBy: {
        searchScore: 'desc',
      },
      take: limit * 2,
    });

    return listings
      .map((listing) => {
        let score = 0;
        const categoryWeight = (weights[listing.category] as number) || 0.5;
        score += categoryWeight * 0.5;

        if (preferences?.minPrice && listing.price >= preferences.minPrice) {
          score += 0.2;
        }
        if (preferences?.maxPrice && listing.price <= preferences.maxPrice) {
          score += 0.2;
        }
        if (preferences?.preferVerified && listing.user.isVerified) {
          score += 0.1;
        }

        return { ...listing, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ==========================================
  // COLLABORATIVE FILTERING
  // ==========================================

  private async getCollaborativeRecommendations(
    userId: string,
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    const interactions = await this.prisma.userInteraction.findMany({
      where: {
        userId,
        type: { in: ['VIEW', 'SAVE', 'PURCHASE'] },
      },
      select: { listingId: true },
    });

    const userListingIds = interactions.map(i => i.listingId);

    if (userListingIds.length === 0) {
      return [];
    }

    const similarUsers = await this.prisma.userInteraction.findMany({
      where: {
        listingId: { in: userListingIds },
        userId: { not: userId },
        type: { in: ['VIEW', 'SAVE', 'PURCHASE'] },
      },
      select: {
        userId: true,
        listingId: true,
        type: true,
      },
      take: 500,
    });

    const userSimilarity: Record<string, { count: number; score: number }> = {};

    for (const interaction of similarUsers) {
      if (!userSimilarity[interaction.userId]) {
        userSimilarity[interaction.userId] = { count: 0, score: 0 };
      }
      userSimilarity[interaction.userId].count++;

      const weight = interaction.type === 'PURCHASE' ? 3 :
                     interaction.type === 'SAVE' ? 2 : 1;
      userSimilarity[interaction.userId].score += weight;
    }

    const topSimilar = Object.entries(userSimilarity)
      .sort((a, b) => (b[1] as any).score - (a[1] as any).score)
      .slice(0, 10)
      .map(([userId]) => userId);

    if (topSimilar.length === 0) {
      return [];
    }

    const similarListings = await this.prisma.userInteraction.findMany({
      where: {
        userId: { in: topSimilar },
        listingId: { notIn: [...excludeIds, ...userListingIds] },
        type: { in: ['VIEW', 'SAVE', 'PURCHASE'] },
      },
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
      take: limit * 2,
    });

    const listingScores: Record<string, { listing: any; score: number }> = {};

    for (const item of similarListings) {
      const id = item.listingId;
      if (!listingScores[id]) {
        listingScores[id] = {
          listing: item.listing,
          score: 0,
        };
      }
      const weight = item.type === 'PURCHASE' ? 3 :
                     item.type === 'SAVE' ? 2 : 1;
      listingScores[id].score += weight;
    }

    return Object.values(listingScores)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.listing);
  }

  // ==========================================
  // TRENDING RECOMMENDATIONS
  // ==========================================

  private async getTrendingRecommendations(
    excludeIds: string[],
    limit: number,
  ): Promise<any[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const listings = await this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        id: { notIn: excludeIds },
        createdAt: { gte: sevenDaysAgo },
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
            isVerified: true,
          },
        },
        _count: {
          select: {
            views: true,
            saves: true,
          },
        },
      },
      orderBy: {
        viewsCount: 'desc',
      },
      take: limit * 2,
    });

    return listings
      .map((listing) => {
        const viewsScore = (listing.viewsCount || 0) * 0.5;
        const savesScore = (listing.savesCount || 0) * 1;
        const freshnessScore = Math.max(0, 1 - (Date.now() - listing.createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000));
        const score = viewsScore + savesScore + freshnessScore * 10;
        return { ...listing, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ==========================================
  // COMBINE RECOMMENDATIONS
  // ==========================================

  private combineRecommendations(
    contentBased: any[],
    collaborative: any[],
    trending: any[],
    limit: number,
  ): any[] {
    const combined: Record<string, { listing: any; score: number; sources: string[] }> = {};

    for (const item of contentBased) {
      const id = item.id;
      combined[id] = {
        listing: item,
        score: (item.score || 0.5) * 2,
        sources: ['content'],
      };
    }

    for (const item of collaborative) {
      const id = item.id;
      if (combined[id]) {
        combined[id].score += (item.score || 0.5) * 1.5;
        combined[id].sources.push('collaborative');
      } else {
        combined[id] = {
          listing: item,
          score: (item.score || 0.5) * 1.5,
          sources: ['collaborative'],
        };
      }
    }

    for (const item of trending) {
      const id = item.id;
      if (combined[id]) {
        combined[id].score += (item.score || 0.3) * 0.8;
        combined[id].sources.push('trending');
      } else {
        combined[id] = {
          listing: item,
          score: (item.score || 0.3) * 0.8,
          sources: ['trending'],
        };
      }
    }

    return Object.values(combined)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => ({
        ...item.listing,
        recommendationScore: item.score,
        sources: item.sources,
      }));
  }

  // ==========================================
  // USER PREFERENCES
  // ==========================================

  private async getUserPreferences(userId: string) {
    const cacheKey = `preferences:${userId}`;
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Si le cache est corrompu, continuer
      }
    }

    const preferences = await this.prisma.userPreference.findUnique({
      where: { userId },
    });

    if (preferences) {
      await this.cache.set(cacheKey, JSON.stringify(preferences), 300);
    }

    return preferences;
  }

  private async updateUserPreferences(userId: string) {
    const interactions = await this.prisma.userInteraction.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      include: {
        listing: true,
      },
    });

    if (interactions.length === 0) return;

    const categoryCounts: Record<string, { count: number; weight: number }> = {};
    const platformCounts: Record<string, number> = {};
    let totalWeight = 0;

    for (const interaction of interactions) {
      const listing = interaction.listing;
      if (!listing) continue;

      const weight = interaction.weight || 1;

      if (listing.category) {
        if (!categoryCounts[listing.category]) {
          categoryCounts[listing.category] = { count: 0, weight: 0 };
        }
        categoryCounts[listing.category].count++;
        categoryCounts[listing.category].weight += weight;
        totalWeight += weight;
      }

      if (listing.platform) {
        platformCounts[listing.platform] = (platformCounts[listing.platform] || 0) + 1;
      }
    }

    const categoryWeights: Record<string, number> = {};
    for (const [category, data] of Object.entries(categoryCounts)) {
      categoryWeights[category] = totalWeight > 0 ? data.weight / totalWeight : 0.5;
    }

    const prices = interactions
      .map(i => i.listing?.price)
      .filter((p): p is number => p !== undefined && p !== null);

    const minPrice = prices.length > 0 ? Math.min(...prices) : undefined;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : undefined;

    const avgRating = await this.prisma.rating.aggregate({
      where: { toUserId: userId },
      _avg: { score: true },
    });

    await this.prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        categoryWeights,
        platformWeights: platformCounts,
        minPrice,
        maxPrice,
        minRating: avgRating._avg.score || undefined,
        preferVerified: false,
      },
      update: {
        categoryWeights,
        platformWeights: platformCounts,
        minPrice,
        maxPrice,
        minRating: avgRating._avg.score || undefined,
        updatedAt: new Date(),
      },
    });

    await this.cache.delete(`preferences:${userId}`);
  }

  // ==========================================
  // GET LISTINGS BY IDS
  // ==========================================

  private async getListingsByIds(ids: string[]): Promise<any[]> {
    if (ids.length === 0) return [];

    return this.prisma.listing.findMany({
      where: {
        id: { in: ids },
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
            isVerified: true,
          },
        },
      },
    });
  }

  // ==========================================
  // SIMILAR LISTINGS
  // ==========================================

  async getSimilarListings(
    listingId: string,
    limit: number = 6,
  ): Promise<any[]> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        category: true,
        platform: true,
        tags: true,
        price: true,
      },
    });

    if (!listing) return [];

    const where: any = {
      status: 'ACTIVE',
      moderationStatus: 'APPROVED',
      id: { not: listingId },
    };

    if (listing.category) {
      where.category = listing.category;
    }

    if (listing.platform) {
      where.platform = listing.platform;
    }

    if (listing.price) {
      where.price = {
        gte: listing.price * 0.5,
        lte: listing.price * 1.5,
      };
    }

    const similar = await this.prisma.listing.findMany({
      where,
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
      orderBy: [
        { viewsCount: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    if (similar.length < limit) {
      const fallback = await this.prisma.listing.findMany({
        where: {
          status: 'ACTIVE',
          moderationStatus: 'APPROVED',
          id: { not: listingId },
          category: listing.category || undefined,
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
              isVerified: true,
            },
          },
        },
        orderBy: { viewsCount: 'desc' },
        take: limit - similar.length,
      });

      similar.push(...fallback);
    }

    return similar;
  }

  // ==========================================
  // CACHE MANAGEMENT
  // ==========================================

  private async invalidateRecommendations(userId: string) {
    await this.cache.delete(`recommendations:personalized:${userId}`);
    await this.cache.delete(`recommendations:trending:${userId}`);
  }

  // ==========================================
  // SCHEDULED JOBS
  // ==========================================

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldInteractions() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    await this.prisma.userInteraction.deleteMany({
      where: {
        createdAt: { lt: thirtyDaysAgo },
        type: 'VIEW',
      },
    });

    this.logger.log('Cleaned up old interactions');
  }

  @Cron(CronExpression.EVERY_WEEK)
  async computeSimilarityScores() {
    this.logger.log('Computing similarity scores...');
    // Implementation simplifiée pour MVP
  }
}
