import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { IsAdminGuard } from './guards/is-admin.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('admin')
@UseGuards(JwtAuthGuard, IsAdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ==========================================
  // DASHBOARD
  // ==========================================

  @Get('dashboard')
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('activity')
  async getRecentActivity(@Query('limit') limit?: string) {
    return this.adminService.getRecentActivity(parseInt(limit) || 20);
  }

  // ==========================================
  // USERS
  // ==========================================

  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sort') sort?: string,
  ) {
    return this.adminService.getUsers({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search,
      status,
      sort,
    });
  }

  @Get('users/:id')
  async getUserDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserDetails(id);
  }

  @Put('users/:id/ban')
  async banUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string; duration?: number },
    @Request() req,
  ) {
    return this.adminService.banUser(id, body.reason, body.duration, req.user.id);
  }

  @Put('users/:id/unban')
  async unbanUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req,
  ) {
    return this.adminService.unbanUser(id, req.user.id);
  }

  // ==========================================
  // LISTINGS
  // ==========================================

  @Get('listings')
  async getListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('moderation') moderationStatus?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
  ) {
    return this.adminService.getListings({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      moderationStatus,
      search,
      sort,
    });
  }

  @Get('listings/:id')
  async getListingDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getListingDetails(id);
  }

  @Put('listings/:id/moderate')
  async moderateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { action: 'approve' | 'reject' | 'flag' | 'delete'; reason?: string },
    @Request() req,
  ) {
    return this.adminService.moderateListing(
      id,
      body.action,
      body.reason,
      req.user.id,
    );
  }

  // ==========================================
  // REPORTS
  // ==========================================

  @Get('reports')
  async getReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('type') targetType?: string,
    @Query('sort') sort?: string,
  ) {
    return this.adminService.getReports({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status,
      targetType,
      sort,
    });
  }

  @Get('reports/:id')
  async getReportDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getReportDetails(id);
  }

  @Put('reports/:id/resolve')
  async resolveReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { action: string; note?: string },
    @Request() req,
  ) {
    return this.adminService.resolveReport(id, body.action, body.note, req.user.id);
  }

  @Put('reports/:id/dismiss')
  async dismissReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { note?: string },
    @Request() req,
  ) {
    return this.adminService.dismissReport(id, body.note, req.user.id);
  }

  // ==========================================
  // ANALYTICS
  // ==========================================

  @Get('analytics')
  async getAnalytics(@Query('days') days?: string) {
    return this.adminService.getAnalytics(parseInt(days) || 30);
  }

  // ==========================================
  // SYSTEM
  // ==========================================

  @Post('cache/clear')
  async clearCache(@Request() req) {
    return this.adminService.clearCache(req.user.id);
  }

  @Get('status')
  async getSystemStatus() {
    return this.adminService.getSystemStatus();
  }
}