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

  // GÉNÉRATION DU SITEMAP
  async generateSitemap() {
    const cacheKey = 'sitemap:data';
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const listings = await this.prisma.listing.findMany({
      where: { status: 'ACTIVE', moderationStatus: 'APPROVED' },
      select: { id: true, slug: true, updatedAt: true, createdAt: true },
      take: 50000,
    });

    const sitemap = {
      listings: listings.map((l) => ({
        url: `/listing/${l.slug || l.id}`,
        lastmod: l.updatedAt || l.createdAt,
        changefreq: 'daily',
        priority: 0.8,
      })),
      static: [
        { url: '/', changefreq: 'daily', priority: 1.0 },
        { url: '/search', changefreq: 'daily', priority: 0.9 },
        { url: '/wishlist', changefreq: 'weekly', priority: 0.4 },
        { url: '/messages', changefreq: 'daily', priority: 0.3 },
      ],
    };

    await this.cache.set(cacheKey, JSON.stringify(sitemap), 3600);
    return sitemap;
  }

  // GÉNÉRATION DU XML DU SITEMAP
  async generateSitemapXml() {
    const data = await this.generateSitemap() as any;
    const baseUrl = process.env.APP_URL || 'https://gamemarket.tn';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const page of data.static || []) {
      xml += this.urlToXml(baseUrl + page.url, page.changefreq, page.priority);
    }

    for (const listing of data.listings || []) {
      xml += this.urlToXml(
        baseUrl + listing.url,
        listing.changefreq,
        listing.priority,
        listing.lastmod
      );
    }

    xml += '</urlset>';
    return xml;
  }

  private urlToXml(url: string, changefreq: string, priority: number, lastmod?: Date): string {
    let xml = '  <url>\n';
    xml += `    <loc>${this.escapeXml(url)}</loc>\n`;
    if (lastmod) xml += `    <lastmod>${lastmod.toISOString()}</lastmod>\n`;
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

  // ROBOTS.TXT
  generateRobotsTxt(): string {
    const baseUrl = process.env.APP_URL || 'https://gamemarket.tn';
    return `# Robots.txt for Gaming Marketplace
User-agent: *
Allow: /
Allow: /search
Allow: /listing/*
Disallow: /admin/
Disallow: /api/
Disallow: /auth/
Disallow: /messages/
Sitemap: ${baseUrl}/sitemap.xml
Host: ${baseUrl.replace(/^https?:\/\//, '')}
`;
  }

  // META TAGS
  async getMetaTags(path: string, params?: any): Promise<any> {
    const defaultMeta = {
      title: 'GameMarket - Marketplace de jeux vidéo en Tunisie',
      description: 'Achetez, vendez et échangez vos jeux vidéo, consoles et accessoires en Tunisie.',
      image: '/og-image.jpg',
      url: process.env.APP_URL || 'https://gamemarket.tn',
      type: 'website',
    };

    if (path.startsWith('/listing/') && params?.id) {
      return this.getListingMetaTags(params.id);
    }

    return defaultMeta;
  }

  private async getListingMetaTags(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: {
        user: { select: { username: true } },
        images: { where: { isCover: true }, take: 1 },
      },
    });

    if (!listing) {
      return {
        title: 'Annonce introuvable - GameMarket',
        description: 'Cette annonce n\'existe pas ou a été supprimée.',
        image: '/og-image.jpg',
      };
    }

    return {
      title: `${listing.title} - ${listing.price} DT - GameMarket`,
      description: listing.description ? `${listing.description.substring(0, 160)}...` : '',
      image: listing.images[0]?.url || '/og-image.jpg',
      url: `/listing/${listing.id}`,
      type: 'product',
    };
  }

  // GÉNÉRATION D'IMAGE OG (SIMPLIFIÉE)
  async generateOgImage(listingId: string): Promise<string> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { images: { where: { isCover: true }, take: 1 } },
    });
    return listing?.images[0]?.url || '/og-image.jpg';
  }
}
