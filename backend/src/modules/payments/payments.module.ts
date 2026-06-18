import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaService, NotificationService, EventBusService],
  exports: [PaymentsService],
})
export class PaymentsModule {}