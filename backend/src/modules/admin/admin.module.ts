import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { IsAdminGuard } from './guards/is-admin.guard';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';
import { NotificationService } from '../notifications/notification.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';

@Module({
  controllers: [AdminController],
  providers: [
    AdminService,
    IsAdminGuard,
    PrismaService,
    CacheService,
    NotificationService,
    EventBusService,
  ],
  exports: [AdminService],
})
export class AdminModule {}