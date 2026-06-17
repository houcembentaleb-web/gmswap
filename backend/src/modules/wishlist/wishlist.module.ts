import { Module } from '@nestjs/common';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service'; // ✅ AJOUT

@Module({
  controllers: [WishlistController],
  providers: [
    WishlistService,
    PrismaService,
    NotificationService,
    CacheService,
    EventBusService, // ✅ AJOUT
  ],
  exports: [WishlistService],
})
export class WishlistModule {}
