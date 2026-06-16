import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CreateOrderDto, UpdateOrderDto } from './dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  // ==========================================
  // CREATE ORDER
  // ==========================================

  @Post()
  async createOrder(@Request() req, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder({
      listingId: dto.listingId,
      buyerId: req.user.id,
      buyerMessage: dto.buyerMessage,
      shippingAddress: dto.shippingAddress,
    });
  }

  // ==========================================
  // GET ORDERS
  // ==========================================

  @Get()
  async getOrders(@Request() req, @Query('role') role: 'buyer' | 'seller') {
    return this.ordersService.getOrders(req.user.id, role || 'buyer');
  }

  @Get('stats')
  async getOrderStats(@Request() req) {
    return this.ordersService.getOrderStats(req.user.id);
  }

  @Get(':id')
  async getOrder(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getOrder(id, req.user.id);
  }

  // ==========================================
  // UPDATE ORDER
  // ==========================================

  @Put(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.updateStatus(id, req.user.id, dto.status, dto);
  }
}