import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @Throttle({ default: { limit: 30, ttl: 60 } })
  async search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  @Get('autocomplete')
  @Throttle({ default: { limit: 50, ttl: 60 } })
  async autocomplete(@Query('q') q: string, @Query('limit') limit?: string) {
    return this.searchService.autocomplete(q, parseInt(limit) || 10);
  }

  @Get('suggestions')
  async suggestions(@Query('q') q: string) {
    return this.searchService.getSuggestions(q);
  }

  @Get('facets')
  async getFacets(@Query() query: SearchQueryDto) {
    const where = this.searchService['buildWhereClause'](query);
    return this.searchService.getFacets(where);
  }

  // Admin only - reindex
  @UseGuards(IsAdminGuard)
  @Post('reindex')
  async reindex() {
    await this.searchService.reindexAll();
    return { message: 'Reindex completed' };
  }
}