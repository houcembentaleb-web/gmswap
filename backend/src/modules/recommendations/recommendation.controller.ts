import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

@Controller('recommendations')
export class RecommendationController {
  constructor(private recommendationService: RecommendationService) {}

  // ==========================================
  // PERSONALIZED RECOMMENDATIONS
  // ==========================================

  @UseGuards(JwtAuthGuard)
  @Get('personalized')
  async getPersonalizedRecommendations(
    @Request() req,
    @Query('limit') limit?: string,
  ) {
    return this.recommendationService.getPersonalizedRecommendations(
      req.user.id,
      parseInt(limit) || 20,
    );
  }

  // ==========================================
  // SIMILAR LISTINGS
  // ==========================================

  @Get('similar/:listingId')
  async getSimilarListings(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Query('limit') limit?: string,
  ) {
    return this.recommendationService.getSimilarListings(
      listingId,
      parseInt(limit) || 6,
    );
  }

  // ==========================================
  // TRACK INTERACTION
  // ==========================================

  @UseGuards(JwtAuthGuard)
  @Post('track')
  async trackInteraction(
    @Request() req,
    @Body() body: {
      listingId: string;
      type: string;
      weight?: number;
    },
  ) {
    return this.recommendationService.trackInteraction({
      userId: req.user.id,
      listingId: body.listingId,
      type: body.type,
      weight: body.weight,
    });
  }
}