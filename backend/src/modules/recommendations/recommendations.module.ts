import { Module } from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Module({
  providers: [RecommendationService, PrismaService],
  exports: [RecommendationService],
})
export class RecommendationsModule {}
