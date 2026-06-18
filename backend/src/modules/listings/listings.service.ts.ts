import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { StorageService } from '../../infrastructure/storage/storage.service';
import { CreateListingDto, UpdateListingDto, ListingsQueryDto } from './dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  // ==========================================
  // CREATE
  // ==========================================

  async create(userId: string, dto: CreateListingDto) {
    const slug = this.generateSlug(dto.title);

    const listing = await this.prisma.listing.create({
      data: {
        ...dto,
        userId,
        slug,
        status: 'DRAFT',
        moderationStatus: 'PENDING',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            ratingAvg: true,
          },
        },
        images: true,
      },
    });

    return listing;
  }

  // ==========================================
  // READ
  // ==========================================

  async findAll(query: ListingsQueryDto) {
    const {
      category,
      platform,
      condition,
      minPrice,
      maxPrice,
      sort = 'newest',
      page = 1,
      limit = 20,
      search,
      status = 'ACTIVE',
      userId,
    } = query;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (status !== 'ALL') {
      where.status = status;
    }

    where.moderationStatus = 'APPROVED';

    if (category) where.category = category;
    if (platform) where.platform = platform;
    if (condition) where.condition = condition;
    if (userId) where.userId = userId;

    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined) where.price.gte = minPrice;
      if (maxPrice !== undefined) where.price.lte = maxPrice;
    }

    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    const orderBy: any = {};
    if (sort === 'newest') orderBy.createdAt = 'desc';
    else if (sort === 'oldest') orderBy.createdAt = 'asc';
    else if (sort === 'price_asc') orderBy.price = 'asc';
    else if (sort === 'price_desc') orderBy.price = 'desc';
    else if (sort === 'popular') orderBy.viewsCount = 'desc';
    else orderBy.createdAt = 'desc';

    const [listings, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              ratingAvg: true,
              isVerified: true,
            },
          },
          images: {
            where: { isCover: true },
            take: 1,
          },
          _count: {
            select: {
              views: true,
              saves: true,
            },
          },
        },
      }),
      this.prisma.listing.count({ where }),
    ]);

    return {
      data: listings,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            ratingAvg: true,
            ratingCount: true,
            isVerified: true,
          },
        },
        images: {
          orderBy: { position: 'asc' },
        },
        _count: {
          select: {
            views: true,
            saves: true,
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    // Increment view count
    await this.prisma.listing.update({
      where: { id },
      data: { viewsCount: { increment: 1 } },
    });

    return listing;
  }

  // ==========================================
  // UPDATE
  // ==========================================

  async update(userId: string, id: string, dto: UpdateListingDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId !== userId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    if (listing.status === 'SOLD' || listing.status === 'EXPIRED') {
      throw new BadRequestException(`Cannot update a ${listing.status} listing`);
    }

    const updated = await this.prisma.listing.update({
      where: { id },
      data: dto,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
        images: true,
      },
    });

    return updated;
  }

  // ==========================================
  // DELETE
  // ==========================================

  async delete(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId !== userId) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    return this.prisma.listing.update({
      where: { id },
      data: { status: 'DELETED' },
    });
  }

  // ==========================================
  // STATUS MANAGEMENT
  // ==========================================

  async publish(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId !== userId) {
      throw new ForbiddenException('You can only publish your own listings');
    }

    if (listing.status !== 'DRAFT') {
      throw new BadRequestException('Only drafts can be published');
    }

    // Check if has images
    const imageCount = await this.prisma.listingImage.count({
      where: { listingId: id },
    });

    if (imageCount === 0) {
      throw new BadRequestException('At least one image is required');
    }

    return this.prisma.listing.update({
      where: { id },
      data: {
        status: 'PENDING_REVIEW',
        publishedAt: new Date(),
      },
    });
  }

  async markAsSold(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId !== userId) {
      throw new ForbiddenException('You can only mark your own listings as sold');
    }

    if (listing.status !== 'ACTIVE') {
      throw new BadRequestException('Only active listings can be marked as sold');
    }

    return this.prisma.listing.update({
      where: { id },
      data: { status: 'SOLD' },
    });
  }

  // ==========================================
  // IMAGES
  // ==========================================

  async uploadImages(userId: string, listingId: string, files: Express.Multer.File[]) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId !== userId) {
      throw new ForbiddenException('You can only upload images for your own listings');
    }

    const currentCount = await this.prisma.listingImage.count({
      where: { listingId },
    });

    const images = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = await this.storage.uploadImage(file, `listings/${listingId}`);
      
      const image = await this.prisma.listingImage.create({
        data: {
          url,
          listingId,
          position: currentCount + i,
          isCover: currentCount + i === 0,
        },
      });
      images.push(image);
    }

    return images;
  }

  async deleteImage(userId: string, listingId: string, imageId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.userId !== userId) {
      throw new ForbiddenException('You can only delete images from your own listings');
    }

    const image = await this.prisma.listingImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException('Image not found');
    }

    if (image.listingId !== listingId) {
      throw new BadRequestException('Image does not belong to this listing');
    }

    await this.storage.deleteFile(image.url);

    return this.prisma.listingImage.delete({
      where: { id: imageId },
    });
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 60) + '-' + uuidv4().substring(0, 8);
  }
}