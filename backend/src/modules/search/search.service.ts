import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { SearchQueryDto, SearchFiltersDto } from './dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  // ==========================================
  // ADVANCED SEARCH
  // ==========================================

  async search(query: SearchQueryDto) {
    const {
      q,
      category,
      platform,
      condition,
      minPrice,
      maxPrice,
      sort = 'relevance',
      page = 1,
      limit = 20,
      location,
      city,
      userId,
      minRating,
      isNegotiable,
      acceptsSwap,
      status = 'ACTIVE',
      tags,
    } = query;

    const skip = (page - 1) * limit;
    const cacheKey = this.generateCacheKey(query);

    // Try cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Build search query
    const where = this.buildWhereClause({
      q,
      category,
      platform,
      condition,
      minPrice,
      maxPrice,
      location,
      city,
      userId,
      minRating,
      isNegotiable,
      acceptsSwap,
      status,
      tags,
    });

    const orderBy = this.buildOrderBy(sort);

    // Execute search with full-text
    const [listings, total] = await this.executeSearch({
      where,
      orderBy,
      skip,
      take: limit,
      q,
    });

    const result = {
      data: listings,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        sort,
        query: q,
        executionTime: 0,
        facets: await this.getFacets(where),
      },
    };

    // Cache for 60 seconds
    await this.cache.set(cacheKey, result, 60);

    return result;
  }

  // ==========================================
  // BUILD WHERE CLAUSE
  // ==========================================

  private buildWhereClause(filters: SearchFiltersDto): Prisma.ListingWhereInput {
    const where: Prisma.ListingWhereInput = {};

    // Status
    if (filters.status !== 'ALL') {
      where.status = filters.status || 'ACTIVE';
    }

    // Moderation
    where.moderationStatus = 'APPROVED';

    // Text search
    if (filters.q && filters.q.trim()) {
      const searchTerm = filters.q.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
        { tags: { has: searchTerm } },
        // Full-text search (PostgreSQL)
        {
          searchVector: {
            // This will be handled via raw SQL in executeSearch
          },
        },
      ];
    }

    // Category
    if (filters.category) {
      where.category = filters.category;
    }

    // Platform
    if (filters.platform) {
      where.platform = filters.platform;
    }

    // Condition
    if (filters.condition) {
      where.condition = filters.condition;
    }

    // Price range
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.price = {};
      if (filters.minPrice !== undefined) where.price.gte = filters.minPrice;
      if (filters.maxPrice !== undefined) where.price.lte = filters.maxPrice;
    }

    // Location
    if (filters.location) {
      where.location = { contains: filters.location, mode: 'insensitive' };
    }

    if (filters.city) {
      where.city = { contains: filters.city, mode: 'insensitive' };
    }

    // User
    if (filters.userId) {
      where.userId = filters.userId;
    }

    // Rating
    if (filters.minRating) {
      where.user = {
        ratingAvg: { gte: filters.minRating },
      };
    }

    // Options
    if (filters.isNegotiable !== undefined) {
      where.isNegotiable = filters.isNegotiable;
    }

    if (filters.acceptsSwap !== undefined) {
      where.acceptsSwap = filters.acceptsSwap;
    }

    // Tags
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    return where;
  }

  // ==========================================
  // BUILD ORDER BY
  // ==========================================

  private buildOrderBy(sort: string): any {
    switch (sort) {
      case 'relevance':
        return [
          { searchRank: 'desc' },
          { createdAt: 'desc' },
        ];
      case 'newest':
        return { createdAt: 'desc' };
      case 'oldest':
        return { createdAt: 'asc' };
      case 'price_asc':
        return { price: 'asc' };
      case 'price_desc':
        return { price: 'desc' };
      case 'popular':
        return { viewsCount: 'desc' };
      case 'trending':
        return { searchScore: 'desc' };
      case 'rating':
        return { user: { ratingAvg: 'desc' } };
      default:
        return { searchRank: 'desc' };
    }
  }

  // ==========================================
  // EXECUTE SEARCH
  // ==========================================

  private async executeSearch(params: {
    where: Prisma.ListingWhereInput;
    orderBy: any;
    skip: number;
    take: number;
    q?: string;
  }): Promise<[any[], number]> {
    const { where, orderBy, skip, take, q } = params;

    // If text search, use full-text ranking
    if (q && q.trim()) {
      const searchTerm = q.trim();

      // Use raw SQL for full-text search with ranking
      const result = await this.prisma.$transaction([
        this.prisma.$queryRaw`
          SELECT 
            l.*,
            ts_rank(search_vector, websearch_to_tsquery('french', ${searchTerm})) as rank,
            (
              ts_rank(search_vector, websearch_to_tsquery('french', ${searchTerm})) * 10 +
              (l.view_count * 0.1) +
              l.search_boost
            ) as search_rank
          FROM listings l
          WHERE 
            l.search_vector @@ websearch_to_tsquery('french', ${searchTerm})
            AND l.status = ${where.status || 'ACTIVE'}
            AND l.moderation_status = 'APPROVED'
            ${where.category ? Prisma.sql`AND l.category = ${where.category}` : Prisma.sql``}
            ${where.platform ? Prisma.sql`AND l.platform = ${where.platform}` : Prisma.sql``}
            ${where.condition ? Prisma.sql`AND l.condition = ${where.condition}` : Prisma.sql``}
            ${where.minPrice !== undefined ? Prisma.sql`AND l.price >= ${where.minPrice}` : Prisma.sql``}
            ${where.maxPrice !== undefined ? Prisma.sql`AND l.price <= ${where.maxPrice}` : Prisma.sql``}
            ${where.location ? Prisma.sql`AND l.location ILIKE ${'%' + where.location + '%'}` : Prisma.sql``}
            ${where.city ? Prisma.sql`AND l.city ILIKE ${'%' + where.city + '%'}` : Prisma.sql``}
          ORDER BY search_rank DESC
          LIMIT ${take} OFFSET ${skip}
        `,
        this.prisma.$queryRaw`
          SELECT COUNT(*) as total
          FROM listings l
          WHERE 
            l.search_vector @@ websearch_to_tsquery('french', ${searchTerm})
            AND l.status = ${where.status || 'ACTIVE'}
            AND l.moderation_status = 'APPROVED'
            ${where.category ? Prisma.sql`AND l.category = ${where.category}` : Prisma.sql``}
            ${where.platform ? Prisma.sql`AND l.platform = ${where.platform}` : Prisma.sql``}
            ${where.condition ? Prisma.sql`AND l.condition = ${where.condition}` : Prisma.sql``}
            ${where.minPrice !== undefined ? Prisma.sql`AND l.price >= ${where.minPrice}` : Prisma.sql``}
            ${where.maxPrice !== undefined ? Prisma.sql`AND l.price <= ${where.maxPrice}` : Prisma.sql``}
            ${where.location ? Prisma.sql`AND l.location ILIKE ${'%' + where.location + '%'}` : Prisma.sql``}
            ${where.city ? Prisma.sql`AND l.city ILIKE ${'%' + where.city + '%'}` : Prisma.sql``}
        `,
      ]);

      const listings = result[0] as any[];
      const total = Number((result[1] as any[])[0]?.total || 0);

      return [listings, total];
    }

    // Regular search without full-text
    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip,
        take,
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
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return [listings, total];
  }

  // ==========================================
  // FACETS
  // ==========================================

  async getFacets(where: Prisma.ListingWhereInput): Promise<any> {
    const [categories, platforms, conditions, priceRange] = await Promise.all([
      this.prisma.listing.groupBy({
        by: ['category'],
        where,
        _count: true,
      }),
      this.prisma.listing.groupBy({
        by: ['platform'],
        where,
        _count: true,
      }),
      this.prisma.listing.groupBy({
        by: ['condition'],
        where,
        _count: true,
      }),
      this.prisma.listing.aggregate({
        where,
        _min: { price: true },
        _max: { price: true },
        _avg: { price: true },
      }),
    ]);

    return {
      categories: categories.map(c => ({
        name: c.category,
        count: c._count,
      })),
      platforms: platforms.map(p => ({
        name: p.platform,
        count: p._count,
      })),
      conditions: conditions.map(c => ({
        name: c.condition,
        count: c._count,
      })),
      priceRange: {
        min: priceRange._min.price || 0,
        max: priceRange._max.price || 1000,
        avg: priceRange._avg.price || 0,
      },
    };
  }

  // ==========================================
  // AUTOCOMPLETE
  // ==========================================

  async autocomplete(query: string, limit: number = 10) {
    if (!query || query.length < 2) {
      return [];
    }

    const results = await this.prisma.$queryRaw`
      SELECT 
        title,
        category,
        platform,
        price,
        ts_rank(search_vector, websearch_to_tsquery('french', ${query})) as rank
      FROM listings
      WHERE 
        search_vector @@ websearch_to_tsquery('french', ${query})
        AND status = 'ACTIVE'
        AND moderation_status = 'APPROVED'
      ORDER BY rank DESC
      LIMIT ${limit}
    `;

    return results;
  }

  // ==========================================
  // SUGGESTIONS
  // ==========================================

  async getSuggestions(query: string): Promise<string[]> {
    if (!query || query.length < 2) {
      return [];
    }

    // Get popular searches from analytics
    // For now, return some predefined suggestions
    const suggestions = [
      'FIFA PS5',
      'Nintendo Switch',
      'PlayStation 4',
      'Xbox Series X',
      'God of War',
      'Zelda',
      'Mario',
      'Pokémon',
    ];

    return suggestions.filter(s =>
      s.toLowerCase().includes(query.toLowerCase())
    );
  }

  // ==========================================
  // GENERATE CACHE KEY
  // ==========================================

  private generateCacheKey(query: SearchQueryDto): string {
    const normalized = { ...query };
    // Remove pagination from cache key
    delete normalized.page;
    delete normalized.limit;

    return `search:${JSON.stringify(normalized)}`;
  }

  // ==========================================
  // REINDEX
  // ==========================================

  async reindexAll(): Promise<void> {
    this.logger.log('Starting full reindex...');

    // Update search vector for all listings
    await this.prisma.$executeRaw`
      UPDATE listings
      SET search_vector = 
        setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('french', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('french', coalesce(array_to_string(tags, ' '), '')), 'C')
    `;

    // Update search rank
    await this.prisma.$executeRaw`
      UPDATE listings
      SET search_rank = (
        (view_count * 0.1) +
        (search_boost * 10) +
        (EXTRACT(EPOCH FROM (NOW() - created_at)) / -86400)
      )
      WHERE status = 'ACTIVE'
    `;

    this.logger.log('Reindex complete');
  }
}