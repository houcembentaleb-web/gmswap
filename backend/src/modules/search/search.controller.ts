import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { IsAdminGuard } from '../admin/guards/is-admin.guard';

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async search(@Query() query: any) {
    return this.searchService.search(query);
  }

  @Get('autocomplete')
  @Throttle({ default: { limit: 50, ttl: 60 } })
  async autocomplete(
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.autocomplete(q, parseInt(limit) || 10);
  }

  @Get('suggestions')
  async suggestions(@Query('q') q: string) {
    return this.searchService.getSuggestions(q);
  }

  @Post('reindex')
  @UseGuards(JwtAuthGuard, IsAdminGuard)
  async reindex() {
    await this.searchService.reindexAll();
    return { message: 'Reindex completed' };
  }
}
