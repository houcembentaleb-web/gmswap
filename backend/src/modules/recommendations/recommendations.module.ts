import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service'; // ✅ AJOUT
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service'; // ✅ AJOUT

@Module({
  providers: [
    RecommendationService,
    PrismaService,
    CacheService, // ✅ AJOUT
    EventBusService, // ✅ AJOUT
  ],
  exports: [RecommendationService],
})
export class RecommendationsModule {}
