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
import { ReservationService } from './reservation.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CreateReservationDto, ConfirmTransactionDto } from './dto';

@Controller('reservations')
@UseGuards(JwtAuthGuard)
export class ReservationController {
  constructor(private reservationService: ReservationService) {}

  @Post()
  async createReservation(@Request() req, @Body() dto: CreateReservationDto) {
    return this.reservationService.createReservation({
      listingId: dto.listingId,
      buyerId: req.user.id,
      message: dto.message,
    });
  }

  @Get()
  async getReservations(
    @Request() req,
    @Query('role') role: 'buyer' | 'seller',
  ) {
    return this.reservationService.getReservations(req.user.id, role || 'buyer');
  }

  @Get(':id')
  async getReservation(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reservationService.getReservation(id, req.user.id);
  }

  @Put(':id/accept')
  async acceptReservation(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reservationService.acceptReservation(id, req.user.id);
  }

  @Put(':id/reject')
  async rejectReservation(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
  ) {
    return this.reservationService.rejectReservation(id, req.user.id, body.reason);
  }

  @Put('transactions/:id/confirm')
  async confirmTransaction(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reservationService.confirmTransaction(id, req.user.id);
  }
}