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

  @Post()
  async create(@Request() req, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.id, dto);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('role') role: 'buyer' | 'seller',
  ) {
    return this.ordersService.findAll(req.user.id, role);
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(req.user.id, id);
  }

  @Put(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDto,
  ) {
    return this.ordersService.updateStatus(req.user.id, id, dto);
  }

  @Put(':id/confirm')
  async confirmDelivery(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.confirmDelivery(req.user.id, id);
  }

  @Put(':id/cancel')
  async cancelOrder(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.cancelOrder(req.user.id, id);
  }
}