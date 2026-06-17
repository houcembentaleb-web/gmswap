import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationGateway } from './notification.gateway';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { RedisService } from '../../infrastructure/redis/redis.service'; // ✅ AJOUT

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationGateway,
    PrismaService,
    QueueService,
    RedisService, // ✅ AJOUT
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
