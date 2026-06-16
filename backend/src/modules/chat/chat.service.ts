import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { QueueService } from '../../infrastructure/queue/queue.service';

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
  ) {}

  async getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        OR: [
          { buyerId: userId },
          { sellerId: userId },
        ],
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            images: {
              where: { isCover: true },
              take: 1,
            },
          },
        },
        buyer: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        seller: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            messages: {
              where: {
                readAt: null,
                senderId: { not: userId },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getConversation(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        listing: true,
        buyer: true,
        seller: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  async getMessages(conversationId: string, limit: number = 50, cursor?: string) {
    const where: any = { conversationId };
    if (cursor) {
      where.id = { lt: cursor };
    }

    return this.prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  async createConversation(buyerId: string, listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    // Check if conversation exists
    const existing = await this.prisma.conversation.findFirst({
      where: {
        listingId,
        buyerId,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.conversation.create({
      data: {
        listingId,
        buyerId,
        sellerId: listing.userId,
        lastMessageAt: new Date(),
      },
    });
  }

  async sendMessage(data: {
    conversationId: string;
    senderId: string;
    content: string;
    type?: string;
    offerPrice?: number;
  }) {
    const message = await this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: data.senderId,
        content: data.content,
        type: data.type || 'TEXT',
        offerPrice: data.offerPrice,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    await this.prisma.conversation.update({
      where: { id: data.conversationId },
      data: {
        lastMessageAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return message;
  }

  async markMessagesAsRead(conversationId: string, userId: string) {
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
  }

  async markMessageDelivered(messageId: string) {
    // Implementation for delivery confirmation
    // For now, we just log it
    console.log(`Message ${messageId} delivered`);
  }

  async getUnreadCount(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        OR: [
          { buyerId: userId },
          { sellerId: userId },
        ],
      },
    });

    const conversationIds = conversations.map(c => c.id);

    return this.prisma.message.count({
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: userId },
        readAt: null,
      },
    });
  }
}
