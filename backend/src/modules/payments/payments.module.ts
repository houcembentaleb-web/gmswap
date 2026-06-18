import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { QueueService } from '../../infrastructure/queue/queue.service'; // ✅ AJOUT
import { RedisService } from '../../infrastructure/redis/redis.service'; // ✅ AJOUT

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PrismaService,
    NotificationService,
    EventBusService,
    QueueService, // ✅ AJOUT
    RedisService, // ✅ AJOUT
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
