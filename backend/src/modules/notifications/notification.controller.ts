import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  @Get()
  async getNotifications(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('read') read?: string,
  ) {
    return this.notificationService.getNotifications(
      req.user.id,
      parseInt(page) || 1,
      parseInt(limit) || 20,
      {
        type,
        isRead: read === 'true' ? true : read === 'false' ? false : undefined,
      },
    );
  }

  @Get('unread')
  async getUnreadCount(@Request() req) {
    return {
      count: await this.notificationService.getUnreadCount(req.user.id),
    };
  }

  @Put(':id/read')
  async markAsRead(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.markAsRead(req.user.id, id);
  }

  @Put('read/all')
  async markAllAsRead(@Request() req) {
    return this.notificationService.markAllAsRead(req.user.id);
  }

  @Delete(':id')
  async deleteNotification(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.deleteNotification(req.user.id, id);
  }

  @Delete('read/all')
  async deleteAllRead(@Request() req) {
    return this.notificationService.deleteAllRead(req.user.id);
  }
}