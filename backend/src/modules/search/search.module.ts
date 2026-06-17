import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service'; // ✅ AJOUT
import { RedisService } from '../../infrastructure/redis/redis.service'; // ✅ AJOUT

@Module({
  controllers: [SearchController],
  providers: [
    SearchService,
    PrismaService,
    CacheService, // ✅ AJOUT
    RedisService, // ✅ AJOUT
  ],
  exports: [SearchService],
})
export class SearchModule {}
