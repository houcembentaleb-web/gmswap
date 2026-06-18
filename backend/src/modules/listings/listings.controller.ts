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
  UploadedFiles,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ListingsService } from './listings.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { CreateListingDto, UpdateListingDto, ListingsQueryDto } from './dto';

@Controller('listings')
export class ListingsController {
  constructor(private listingsService: ListingsService) {}

  // ==========================================
  // PUBLIC ENDPOINTS
  // ==========================================

  @Get()
  async findAll(@Query() query: ListingsQueryDto) {
    return this.listingsService.findAll(query);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.listingsService.findOne(id);
  }

  // ==========================================
  // PROTECTED ENDPOINTS
  // ==========================================

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Request() req, @Body() dto: CreateListingDto) {
    return this.listingsService.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.listingsService.update(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.listingsService.delete(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  async publish(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.listingsService.publish(req.user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/sold')
  async markAsSold(@Request() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.listingsService.markAsSold(req.user.id, id);
  }

  // ==========================================
  // IMAGES
  // ==========================================

  @UseGuards(JwtAuthGuard)
  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('images', 10))
  async uploadImages(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.listingsService.uploadImages(req.user.id, id, files);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/images/:imageId')
  async deleteImage(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.listingsService.deleteImage(req.user.id, id, imageId);
  }
}
