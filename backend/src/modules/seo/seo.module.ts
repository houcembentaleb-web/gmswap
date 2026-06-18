import { Module } from '@nestjs/common';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Module({
  controllers: [SeoController],
  providers: [SeoService, PrismaService, CacheService, RedisService],
  exports: [SeoService],
})
export class SeoModule {}