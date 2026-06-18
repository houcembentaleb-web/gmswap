import { Module } from '@nestjs/common';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';

@Module({
  controllers: [ListingsController],
  providers: [ListingsService, PrismaService, StorageService],
  exports: [ListingsService],
})
export class ListingsModule {}