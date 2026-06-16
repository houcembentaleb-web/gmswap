import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  // RECHERCHE SIMPLE AVEC FILTRES (SANS FULL-TEXT AVANCÉ)
  async search(query: any) {
    const {
      q,
      category,
      platform,
      condition,
      minPrice,
      maxPrice,
      sort = 'newest',
      page = 1,
      limit = 20,
      location,
      city,
      userId,
      status = 'ACTIVE',
    } = query;

    const skip = (page - 1) * limit;

    const where: any = { status, moderationStatus: 'APPROVED' };

    if (category) where.category = category;
    if (platform) where.platform = platform;
    if (condition) where.condition = condition;
    if (userId) where.userId = userId;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (city) where.city = { contains: city, mode: 'insensitive' };

    // Prix
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    // Recherche textuelle
    if (q && q.trim()) {
      const searchTerm = q.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { tags: { has: searchTerm } },
      ];
    }

    const orderBy: any = {};
    if (sort === 'newest') orderBy.createdAt = 'desc';
    else if (sort === 'oldest') orderBy.createdAt = 'asc';
    else if (sort === 'price_asc') orderBy.price = 'asc';
    else if (sort === 'price_desc') orderBy.price = 'desc';
    else if (sort === 'popular') orderBy.viewsCount = 'desc';
    else orderBy.createdAt = 'desc';

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
              ratingAvg: true,
              isVerified: true,
            },
          },
          images: {
            where: { isCover: true },
            take: 1,
          },
          _count: {
            select: {
              views: true,
              saves: true,
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
        sort,
        query: q,
      },
    };
  }

  // AUTOCOMPLÉTION
  async autocomplete(query: string, limit: number = 10) {
    if (!query || query.length < 2) return [];

    return this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        title: { contains: query, mode: 'insensitive' },
      },
      select: {
        id: true,
        title: true,
        category: true,
        platform: true,
        price: true,
      },
      take: limit,
      orderBy: { viewsCount: 'desc' },
    });
  }

  // SUGGESTIONS (POUR L'AUTOCOMPLÉTION)
  async getSuggestions(query: string): Promise<string[]> {
    if (!query || query.length < 2) return [];

    const results = await this.prisma.listing.findMany({
      where: {
        status: 'ACTIVE',
        moderationStatus: 'APPROVED',
        title: { contains: query, mode: 'insensitive' },
      },
      select: { title: true },
      take: 5,
    });

    return results.map(r => r.title);
  }

  // RÉINDEXATION (SIMPLIFIÉE)
  async reindexAll(): Promise<void> {
    this.logger.log('Reindexing all listings...');
    // Dans cette version simplifiée, on ne fait rien
    this.logger.log('Reindex complete (simplified)');
  }
}
