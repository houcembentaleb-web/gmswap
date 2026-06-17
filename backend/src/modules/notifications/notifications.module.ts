import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { QueueService } from '../../infrastructure/queue/queue.service'; // ✅ AJOUT

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationGateway,
    PrismaService,
    QueueService, // ✅ AJOUT
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
