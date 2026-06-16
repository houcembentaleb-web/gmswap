import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { IsAdminGuard } from './guards/is-admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, IsAdminGuard)
export class AdminController {
  constructor(private adminService: AdminService) {}

  // ==========================================
  // DASHBOARD STATS
  // ==========================================

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  // ==========================================
  // USERS
  // ==========================================

  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      search,
    });
  }

  @Put('users/:id/ban')
  async banUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.banUser(id);
  }

  @Put('users/:id/unban')
  async unbanUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.unbanUser(id);
  }

  // ==========================================
  // LISTINGS
  // ==========================================

  @Get('listings')
  async getListings(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getListings({
      status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
  }

  @Put('listings/:id/moderate')
  async moderateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('action') action: 'approve' | 'reject' | 'delete',
  ) {
    return this.adminService.moderateListing(id, action);
  }

  // ==========================================
  // REPORTS
  // ==========================================

  @Get('reports')
  async getReports(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getReports({
      status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
  }

  @Put('reports/:id/resolve')
  async resolveReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.resolveReport(id);
  }

  @Put('reports/:id/dismiss')
  async dismissReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.dismissReport(id);
  }

  // ==========================================
  // ANALYTICS
  // ==========================================

  @Get('analytics')
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }
}