import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { RedisService } from '../../infrastructure/redis/redis.service'; // ✅ AJOUT
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';

@Module({
  providers: [
    RecommendationService,
    PrismaService,
    CacheService,
    RedisService, // ✅ AJOUT
    EventBusService,
  ],
  exports: [RecommendationService],
})
export class RecommendationsModule {}
