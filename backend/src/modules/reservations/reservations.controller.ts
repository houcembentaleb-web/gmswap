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
import { ReservationsService } from './reservations.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CreateReservationDto, UpdateReservationDto } from './dto';

@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationsController {
  constructor(private reservationsService: ReservationsService) {}

  @Post()
  async create(@Request() req, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(req.user.id, dto);
  }

  @Get()
  async findAll(
    @Request() req,
    @Query('role') role: 'buyer' | 'seller',
  ) {
    return this.reservationsService.findAll(req.user.id, role);
  }

  @Get(':id')
  async findOne(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.findOne(req.user.id, id);
  }

  @Put(':id/accept')
  async accept(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.accept(req.user.id, id);
  }

  @Put(':id/reject')
  async reject(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
  ) {
    return this.reservationsService.reject(req.user.id, id, body.reason);
  }

  @Put(':id/cancel')
  async cancel(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.cancel(req.user.id, id);
  }

  @Put(':id/complete')
  async complete(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.reservationsService.complete(req.user.id, id);
  }
}