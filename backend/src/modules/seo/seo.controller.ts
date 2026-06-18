import { Controller, Get, Res, Param, Query } from '@nestjs/common';
import { Response } from 'express';
import { SeoService } from './seo.service';

@Controller()
export class SeoController {
  constructor(private seoService: SeoService) {}

  // ==========================================
  // SITEMAP
  // ==========================================

  @Get('sitemap.xml')
  async getSitemap(@Res() res: Response) {
    const xml = await this.seoService.generateSitemapXml();
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  }

  @Get('sitemap.json')
  async getSitemapJson() {
    return this.seoService.generateSitemap();
  }

  // ==========================================
  // ROBOTS.TXT
  // ==========================================

  @Get('robots.txt')
  getRobotsTxt(@Res() res: Response) {
    const txt = this.seoService.generateRobotsTxt();
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(txt);
  }

  // ==========================================
  // META TAGS (API)
  // ==========================================

  @Get('api/seo/meta')
  async getMetaTags(
    @Query('path') path: string,
    @Query('id') id?: string,
  ) {
    return this.seoService.getMetaTags(path, { id });
  }

  @Get('api/seo/og-image/:id')
  async getOgImage(@Param('id') id: string) {
    return this.seoService.generateOgImage(id);
  }
}