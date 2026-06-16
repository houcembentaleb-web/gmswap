import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';

// Seul le module Admin existe pour l'instant
import { AdminModule } from './modules/admin/admin.module';

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
      throttlers: [
        {
          ttl: 60,
          limit: 100,
        },
      ],
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    
    // Modules existants
    AdminModule,
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
