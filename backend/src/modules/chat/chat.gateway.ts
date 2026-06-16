import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../../infrastructure/redis/redis.service';
import { QueueService } from '../../infrastructure/queue/queue.service';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3001'],
    credentials: true,
  },
  namespace: 'chat',
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private connectedUsers = new Map<string, string[]>(); // userId -> socketIds

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private jwtService: JwtService,
    private redis: RedisService,
    private queueService: QueueService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });

      if (!payload?.sub) {
        client.disconnect();
        return;
      }

      const user = await this.authService.validateUser(payload.sub);
      if (!user) {
        client.disconnect();
        return;
      }

      client.data.userId = user.id;

      // Track connection
      if (!this.connectedUsers.has(user.id)) {
        this.connectedUsers.set(user.id, []);
      }
      this.connectedUsers.get(user.id)!.push(client.id);

      // Join user's conversations
      const conversations = await this.chatService.getConversations(user.id);
      for (const conv of conversations) {
        client.join(`conversation:${conv.id}`);
      }

      // Send unread count
      const unreadCount = await this.chatService.getUnreadCount(user.id);
      client.emit('unread_count', unreadCount);

      // Broadcast online status
      this.server.emit('user_online', {
        userId: user.id,
        username: user.username,
      });

      this.logger.log(`🔌 User ${user.username} connected`);

    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      const sockets = this.connectedUsers.get(userId);
      if (sockets) {
        const index = sockets.indexOf(client.id);
        if (index > -1) {
          sockets.splice(index, 1);
        }
        if (sockets.length === 0) {
          this.connectedUsers.delete(userId);
          this.server.emit('user_offline', { userId });
        }
      }
    }
    this.logger.log(`🔌 User ${userId} disconnected`);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      conversationId: string;
      content: string;
      type?: string;
      offerPrice?: number;
    },
  ) {
    const userId = client.data.userId;

    try {
      // Validate conversation access
      const conversation = await this.chatService.getConversation(data.conversationId);
      if (!conversation) {
        client.emit('error', { message: 'Conversation not found' });
        return;
      }

      if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
        client.emit('error', { message: 'Unauthorized' });
        return;
      }

      // Save message
      const message = await this.chatService.sendMessage({
        conversationId: data.conversationId,
        senderId: userId,
        content: data.content,
        type: data.type || 'TEXT',
        offerPrice: data.offerPrice,
      });

      // Emit to conversation room
      this.server.to(`conversation:${data.conversationId}`).emit('new_message', message);

      // Find receiver
      const receiverId = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;

      // Send notification via queue
      await this.queueService.addJob('notification', {
        name: 'new_message',
        payload: {
          userId: receiverId,
          conversationId: data.conversationId,
          senderId: userId,
          content: data.content.substring(0, 100),
        },
      });

      // Update unread count
      const unreadCount = await this.chatService.getUnreadCount(receiverId);
      const receiverSockets = this.connectedUsers.get(receiverId);
      if (receiverSockets) {
        for (const socketId of receiverSockets) {
          this.server.to(socketId).emit('unread_count', unreadCount);
        }
      }

      // Mark as delivered
      await this.chatService.markMessageDelivered(message.id);

      return message;

    } catch (error) {
      this.logger.error(`Send message error: ${error.message}`);
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.data.userId;
    
    try {
      await this.chatService.markMessagesAsRead(data.conversationId, userId);
      
      this.server
        .to(`conversation:${data.conversationId}`)
        .emit('messages_read', { conversationId: data.conversationId, userId });

      // Update unread count
      const unreadCount = await this.chatService.getUnreadCount(userId);
      client.emit('unread_count', unreadCount);

    } catch (error) {
      this.logger.error(`Mark read error: ${error.message}`);
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    const userId = client.data.userId;
    
    try {
      const conversation = await this.chatService.getConversation(data.conversationId);
      if (!conversation) return;
      
      const otherUserId = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
      const otherSockets = this.connectedUsers.get(otherUserId);
      
      if (otherSockets) {
        for (const socketId of otherSockets) {
          this.server.to(socketId).emit('user_typing', {
            conversationId: data.conversationId,
            userId,
            isTyping: data.isTyping,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Typing error: ${error.message}`);
    }
  }
}