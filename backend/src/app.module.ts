// ============================================
// 3. app.module.ts (avec tous les modules corrigés)
// ============================================
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ListingsModule } from './modules/listings/listings.module';
import { SearchModule } from './modules/search/search.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { AdminModule } from './modules/admin/admin.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { ProfileModule } from './modules/profile/profile.module';
import { ReviewsModule } from './modules/reviews/reviews.module';

// Infrastructure
import { PrismaService } from './infrastructure/database/prisma.service';
import { RedisService } from './infrastructure/redis/redis.service';
import { StorageService } from './infrastructure/storage/storage.service';
import { EventBusService } from './infrastructure/event-bus/event-bus.service';
import { CacheService } from './infrastructure/cache/cache.service';
import { QueueService } from './infrastructure/queue/queue.service';

@Module({
  imports: [
    // Core
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 100,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    
    // Feature Modules
    AuthModule,
    UsersModule,
    ListingsModule,
    SearchModule,
    ChatModule,
    NotificationsModule,
    ReputationModule,
    ModerationModule,
    AdminModule,
    WishlistModule,
    ProfileModule,
    ReviewsModule,
  ],
  providers: [
    PrismaService,
    RedisService,
    StorageService,
    EventBusService,
    CacheService,
    QueueService,
  ],
})
export class AppModule {}
