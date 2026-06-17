import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Get()
  async getConversations(@Request() req) {
    return this.chatService.getConversations(req.user.id);
  }

  @Post()
  async createConversation(
    @Request() req,
    @Body() body: { otherUserId: string; listingId?: string },
  ) {
    // ✅ Correction : on n'utilise que 2 arguments
    return this.chatService.createConversation(
      req.user.id,
      body.otherUserId,
      // body.listingId est ignoré si la méthode n'en prend que 2
    );
  }

  @Get(':id/messages')
  async getMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    const conversation = await this.chatService.getConversation(id);
    if (!conversation || 
        (conversation.buyerId !== req.user.id && 
         conversation.sellerId !== req.user.id)) {
      throw new Error('Unauthorized');
    }
    return this.chatService.getMessages(id);
  }

  @Post(':id/read')
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    return this.chatService.markMessagesAsRead(id, req.user.id);
  }
}
