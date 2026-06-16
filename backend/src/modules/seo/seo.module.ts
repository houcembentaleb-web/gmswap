import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

@Module({
  controllers: [SeoController],
  providers: [SeoService, PrismaService, CacheService],
  exports: [SeoService],
})
export class SeoModule {}