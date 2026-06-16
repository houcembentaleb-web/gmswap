import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

@Injectable()
export class SeoService {
  private readonly logger = new Logger(SeoService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  // ==========================================
  // SITEMAP GENERATION
  // ==========================================

  async generateSitemap() {
    const cacheKey = 'sitemap:data';
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const [listings, users, categories] = await Promise.all([
      this.prisma.listing.findMany({
        where: {
          status: 'ACTIVE',
          moderationStatus: 'APPROVED',
        },
        select: {
          id: true,
          slug: true,
          updatedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50000, // Limit for sitemap
      }),
      this.prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          username: true,
          updatedAt: true,
        },
        take: 10000,
      }),
      this.prisma.listing.groupBy({
        by: ['category'],
        _count: true,
      }),
    ]);

    const sitemap = {
      listings: listings.map((l) => ({
        url: `/listing/${l.slug || l.id}`,
        lastmod: l.updatedAt || l.createdAt,
        changefreq: 'daily',
        priority: 0.8,
      })),
      users: users.map((u) => ({
        url: `/profile/${u.id}`,
        lastmod: u.updatedAt,
        changefreq: 'weekly',
        priority: 0.5,
      })),
      categories: categories.map((c) => ({
        url: `/search?category=${c.category}`,
        changefreq: 'daily',
        priority: 0.7,
      })),
      static: [
        { url: '/', changefreq: 'daily', priority: 1.0 },
        { url: '/search', changefreq: 'daily', priority: 0.9 },
        { url: '/wishlist', changefreq: 'weekly', priority: 0.4 },
        { url: '/messages', changefreq: 'daily', priority: 0.3 },
      ],
    };

    await this.cache.set(cacheKey, sitemap, 3600); // Cache 1 hour
    return sitemap;
  }

  async generateSitemapXml() {
    const data = await this.generateSitemap();
    const baseUrl = process.env.APP_URL || 'https://gamemarket.tn';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Static pages
    for (const page of data.static) {
      xml += this.urlToXml(baseUrl + page.url, page.changefreq, page.priority);
    }

    // Categories
    for (const cat of data.categories) {
      xml += this.urlToXml(baseUrl + cat.url, cat.changefreq, cat.priority);
    }

    // Listings
    for (const listing of data.listings) {
      xml += this.urlToXml(
        baseUrl + listing.url,
        listing.changefreq,
        listing.priority,
        listing.lastmod,
      );
    }

    // Users
    for (const user of data.users) {
      xml += this.urlToXml(
        baseUrl + user.url,
        user.changefreq,
        user.priority,
        user.lastmod,
      );
    }

    xml += '</urlset>';
    return xml;
  }

  private urlToXml(url: string, changefreq: string, priority: number, lastmod?: Date): string {
    let xml = '  <url>\n';
    xml += `    <loc>${this.escapeXml(url)}</loc>\n`;
    if (lastmod) {
      xml += `    <lastmod>${lastmod.toISOString()}</lastmod>\n`;
    }
    xml += `    <changefreq>${changefreq}</changefreq>\n`;
    xml += `    <priority>${priority}</priority>\n`;
    xml += '  </url>\n';
    return xml;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ==========================================
  // ROBOTS.TXT
  // ==========================================

  generateRobotsTxt(): string {
    const baseUrl = process.env.APP_URL || 'https://gamemarket.tn';
    
    return `# Robots.txt for Gaming Marketplace
User-agent: *
Allow: /
Allow: /search
Allow: /listing/*
Allow: /profile/*
Disallow: /admin/
Disallow: /api/
Disallow: /auth/
Disallow: /messages/
Disallow: /wishlist/
Disallow: /settings/
Disallow: /checkout/

Sitemap: ${baseUrl}/sitemap.xml

# Crawl delay for search engines
Crawl-delay: 1

# Host
Host: ${baseUrl.replace(/^https?:\/\//, '')}
`;
  }

  // ==========================================
  // META TAGS
  // ==========================================

  async getMetaTags(path: string, params?: any): Promise<any> {
    // Default meta tags
    const defaultMeta = {
      title: 'GameMarket - Marketplace de jeux vidéo en Tunisie',
      description: 'Achetez, vendez et échangez vos jeux vidéo, consoles et accessoires en Tunisie. La plus grande communauté de gamers tunisiens.',
      image: '/og-image.jpg',
      url: process.env.APP_URL || 'https://gamemarket.tn',
      type: 'website',
      siteName: 'GameMarket',
      twitterCard: 'summary_large_image',
    };

    // Route-specific meta
    if (path.startsWith('/listing/')) {
      return this.getListingMetaTags(params?.id);
    }

    if (path.startsWith('/profile/')) {
      return this.getProfileMetaTags(params?.id);
    }

    if (path.startsWith('/search')) {
      return this.getSearchMetaTags(params?.q);
    }

    if (path === '/') {
      return {
        ...defaultMeta,
        title: 'GameMarket - Marketplace de jeux vidéo en Tunisie',
        description: 'Découvrez des milliers de jeux vidéo, consoles et accessoires en Tunisie. Achetez, vendez et échangez avec la communauté gaming tunisienne.',
      };
    }

    return defaultMeta;
  }

  private async getListingMetaTags(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        user: {
          select: { username: true },
        },
        images: {
          where: { isCover: true },
          take: 1,
        },
      },
    });

    if (!listing) {
      return {
        title: 'Annonce introuvable - GameMarket',
        description: 'Cette annonce n\'existe pas ou a été supprimée.',
        image: '/og-image.jpg',
      };
    }

    const title = `${listing.title} - ${listing.price} DT - GameMarket`;
    const description = listing.description 
      ? `${listing.description.substring(0, 160)}...` 
      : `${listing.title} en ${listing.condition} sur GameMarket. ${listing.category} - ${listing.platform || ''}`;
    
    const image = listing.images[0]?.url || '/og-image.jpg';
    const url = `${process.env.APP_URL || 'https://gamemarket.tn'}/listing/${listing.id}`;

    return {
      title,
      description,
      image,
      url,
      type: 'product',
      siteName: 'GameMarket',
      twitterCard: 'summary_large_image',
      jsonLd: this.generateProductJsonLd(listing),
    };
  }

  private async getProfileMetaTags(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        avatarUrl: true,
        bio: true,
        ratingAvg: true,
        _count: {
          select: {
            listings: true,
            ratingsReceived: true,
          },
        },
      },
    });

    if (!user) {
      return {
        title: 'Profil utilisateur - GameMarket',
        description: 'Profil d\'un membre de la communauté GameMarket.',
        image: '/og-image.jpg',
      };
    }

    return {
      title: `${user.username} - Profil GameMarket`,
      description: user.bio || `${user.username} sur GameMarket. ${user._count.listings} annonces, ${user._count.ratingsReceived} avis. Note: ${user.ratingAvg.toFixed(1)}/5.`,
      image: user.avatarUrl || '/og-image.jpg',
      type: 'profile',
    };
  }

  private async getSearchMetaTags(query?: string) {
    const title = query 
      ? `Recherche "${query}" - GameMarket` 
      : 'Recherche - GameMarket';
    const description = query 
      ? `Résultats de recherche pour "${query}" sur GameMarket. Trouvez les meilleurs jeux vidéo en Tunisie.` 
      : 'Recherchez des jeux vidéo, consoles et accessoires sur GameMarket.';

    return {
      title,
      description,
      image: '/og-image.jpg',
    };
  }

  private generateProductJsonLd(listing: any) {
    const baseUrl = process.env.APP_URL || 'https://gamemarket.tn';
    
    return {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: listing.title,
      description: listing.description || '',
      image: listing.images[0]?.url || '',
      sku: listing.id,
      offers: {
        '@type': 'Offer',
        price: listing.price,
        priceCurrency: 'TND',
        availability: listing.status === 'ACTIVE' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
        seller: {
          '@type': 'Person',
          name: listing.user.username,
        },
        url: `${baseUrl}/listing/${listing.id}`,
      },
    };
  }

  // ==========================================
  // OPEN GRAPH IMAGE GENERATION
  // ==========================================

  async generateOgImage(listingId: string): Promise<string> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        images: {
          where: { isCover: true },
          take: 1,
        },
        user: true,
      },
    });

    if (!listing) return '/og-image.jpg';

    // Return cover image or generate dynamic OG image
    return listing.images[0]?.url || '/og-image.jpg';
  }
}