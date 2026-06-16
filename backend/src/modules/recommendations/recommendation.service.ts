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

    // Update user preferences asynchronously
    await this.updateUserPreferences(data.userId);

    // Invalidate recommendation cache
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
    // Check cache
    const cacheKey = `recommendations:personalized:${userId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      const listingIds = JSON.parse(cached);
      return this.getListingsByIds(listingIds);
    }

    // Get user preferences
    const preferences = await this.getUserPreferences(userId);

    // Get interactions (last 30 days)
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

    // Get viewed listings (to exclude)
    const viewedIds = interactions.map(i => i.listingId);

    // 1. Content-based recommendations
    const contentBased = await this.getContentBasedRecommendations(
      userId,
      preferences,
      viewedIds,
      limit,
    );

    // 2. Collaborative filtering recommendations
    const collaborative = await this.getCollaborativeRecommendations(
      userId,
      viewedIds,
      limit,
    );

    // 3. Trending recommendations (fallback)
    const trending = await this.getTrendingRecommendations(
      viewedIds,
      limit,
    );

    // Combine and rank
    const combined = this.combineRecommendations(
      contentBased,
      collaborative,
      trending,
      limit,
    );

    // Cache results
    const ids = combined.map(r => r.id);
    await this.cache.set(cacheKey, JSON.stringify(ids), 300); // 5 minutes

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
    const preferencesData = preferences || await this.getUserPreferences(userId);
    const weights = preferencesData?.categoryWeights || {};

    // Get top categories from preferences
    const categories = Object.entries(weights)
      .sort((a, b) => b[1] - a[1])
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

    // Score based on category match and price preference
    return listings
      .map((listing) => {
        let score = 0;
        const categoryWeight = weights[listing.category] || 0.5;
        score += categoryWeight * 0.5;

        // Price preference
        if (preferencesData?.minPrice && listing.price >= preferencesData.minPrice) {
          score += 0.2;
        }
        if (preferencesData?.maxPrice && listing.price <= preferencesData.maxPrice) {
          score += 0.2;
        }

        // Trust preference
        if (preferencesData?.preferVerified && listing.user.isVerified) {
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
    // Find similar users based on interactions
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

    // Find users who interacted with same listings
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

    // Count similarities
    const userSimilarity: Record<string, { count: number; score: number }> = {};

    for (const interaction of similarUsers) {
      if (!userSimilarity[interaction.userId]) {
        userSimilarity[interaction.userId] = { count: 0, score: 0 };
      }
      userSimilarity[interaction.userId].count++;

      // Weight by interaction type
      const weight = interaction.type === 'PURCHASE' ? 3 :
                     interaction.type === 'SAVE' ? 2 : 1;
      userSimilarity[interaction.userId].score += weight;
    }

    // Get top similar users
    const topSimilar = Object.entries(userSimilarity)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 10)
      .map(([userId]) => userId);

    if (topSimilar.length === 0) {
      return [];
    }

    // Get listings from similar users
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

    // Group by listing and score
    const listingScores: Record<string, { listing: any; score: number }> = {};

    for (const item of similarListings) {
      const id = item.listingId;
      if (!listingScores[id]) {
        listingScores[id] = {
          listing: item.listing,
          score: 0,
        };
      }
      // Score based on interaction type from similar users
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
    // Get trending listings (views + saves + freshness)
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

    // Score: views * 0.5 + saves * 1 + freshness bonus
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

    // Add content-based with weight
    for (const item of contentBased) {
      const id = item.id;
      combined[id] = {
        listing: item,
        score: (item.score || 0.5) * 2,
        sources: ['content'],
      };
    }

    // Add collaborative with weight
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

    // Add trending with weight
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

    // Sort by score and return
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
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const preferences = await this.prisma.userPreference.findUnique({
      where: { userId },
    });

    await this.cache.set(cacheKey, JSON.stringify(preferences), 300);
    return preferences;
  }

  private async updateUserPreferences(userId: string) {
    // Get user interactions (last 30 days)
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

    // Calculate category preferences
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

    // Normalize category weights
    const categoryWeights: Record<string, number> = {};
    for (const [category, data] of Object.entries(categoryCounts)) {
      categoryWeights[category] = totalWeight > 0 ? data.weight / totalWeight : 0.5;
    }

    // Get price range
    const prices = interactions
      .map(i => i.listing?.price)
      .filter((p): p is number => p !== undefined && p !== null);

    const minPrice = prices.length > 0 ? Math.min(...prices) : undefined;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : undefined;

    // Get rating preference
    const avgRating = await this.prisma.rating.aggregate({
      where: { toUserId: userId },
      _avg: { score: true },
    });

    // Upsert preferences
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

    // Invalidate cache
    await this.cache.delete(`preferences:${userId}`);
  }

  // ==========================================
  // CACHE MANAGEMENT
  // ==========================================

  private async invalidateRecommendations(userId: string) {
    await this.cache.delete(`recommendations:personalized:${userId}`);
    await this.cache.delete(`recommendations:trending:${userId}`);
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

    // Match by category (primary)
    if (listing.category) {
      where.category = listing.category;
    }

    // Match by platform (secondary)
    if (listing.platform) {
      where.platform = listing.platform;
    }

    // Price range (within +/- 50%)
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

    // If not enough, get trending in same category
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
    // This would compute similarity between users
    // For large scale, this should be done incrementally
    this.logger.log('Computing similarity scores...');
    // Implementation would be heavy - skipped for MVP
  }
}