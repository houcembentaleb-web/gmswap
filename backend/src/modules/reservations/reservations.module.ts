import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Module({
  controllers: [ReservationsController],
  providers: [
    ReservationsService,
    PrismaService,
    NotificationService,
    EventBusService,
    QueueService,
    RedisService,
  ],
  exports: [ReservationsService],
})
export class ReservationsModule {}