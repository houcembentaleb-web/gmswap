import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { QueueService } from '../../infrastructure/queue/queue.service';
import { EventBusService } from '../../infrastructure/event-bus/event-bus.service'; // ✅ AJOUT

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [ChatController],
  providers: [
    ChatGateway,
    ChatService,
    AuthService,
    PrismaService,
    RedisService,
    QueueService,
    EventBusService, // ✅ AJOUT
  ],
  exports: [ChatService],
})
export class ChatModule {}
