import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';

@Module({
  controllers: [OrdersController],
  providers: [
    OrdersService,
    PaymentsService,
    PrismaService,
    NotificationService,
    EventBusService,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}