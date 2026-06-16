import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private wishlistService: WishlistService) {}

  // ==========================================
  // GET WISHLIST
  // ==========================================

  @Get()
  async getWishlist(@Request() req) {
    return this.wishlistService.getWishlist(req.user.id);
  }

  @Get('check/:listingId')
  async isInWishlist(
    @Request() req,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    const isInWishlist = await this.wishlistService.isInWishlist(
      req.user.id,
      listingId,
    );
    return { isInWishlist };
  }

  // ==========================================
  // ADD / REMOVE
  // ==========================================

  @Post()
  async addToWishlist(
    @Request() req,
    @Body() body: { listingId: string; notes?: string },
  ) {
    return this.wishlistService.addToWishlist(
      req.user.id,
      body.listingId,
      body.notes,
    );
  }

  @Delete(':listingId')
  async removeFromWishlist(
    @Request() req,
    @Param('listingId', ParseUUIDPipe) listingId: string,
  ) {
    return this.wishlistService.removeFromWishlist(req.user.id, listingId);
  }

  // ==========================================
  // RECOMMENDATIONS
  // ==========================================

  @Get('recommendations')
  async getRecommendations(
    @Request() req,
    @Query('limit') limit?: string,
  ) {
    return this.wishlistService.getRecommendations(
      req.user.id,
      parseInt(limit) || 10,
    );
  }

  // ==========================================
  // PRICE DROP NOTIFICATIONS
  // ==========================================

  @Get('price-drops')
  async getPriceDrops(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.wishlistService.getPriceDropNotifications(
      req.user.id,
      parseInt(page) || 1,
      parseInt(limit) || 20,
    );
  }

  @Post('price-drops/:id/read')
  async markPriceDropRead(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wishlistService.markPriceDropRead(req.user.id, id);
  }
}