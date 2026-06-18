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
  // FIND ALL
  // ==========================================

  async findAll(query: ListingsQueryDto) {
    const {
      category,
      platform,
      condition,
      minPrice,
      maxPrice,
      search,
      status,
      userId,
      page = 1,
      limit = 20,
      sort,
    } = query;

    // 1. Construction sécurisée du WHERE
    const whereClause: any = {};
    whereClause.status = status || 'ACTIVE';

    // 2. Filtres simples (évite les chaînes vides)
    if (category && category.trim() !== '') whereClause.category = category;
    if (platform && platform.trim() !== '') whereClause.platform = platform;
    if (condition && condition.trim() !== '') whereClause.condition = condition;
    if (userId && userId.trim() !== '') whereClause.userId = userId;

    // 3. Filtres de prix (sécurisés)
    if (minPrice !== undefined || maxPrice !== undefined) {
      whereClause.price = {};
      if (minPrice !== undefined) whereClause.price.gte = minPrice;
      if (maxPrice !== undefined) whereClause.price.lte = maxPrice;
    }

    // 4. Recherche textuelle
    if (search && search.trim() !== '') {
      whereClause.OR = [
        { title: { contains: search.trim(), mode: 'insensitive' } },
        { description: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    // 5. Pagination
    const take = Number(limit) > 0 ? Number(limit) : 20;
    const skip = (Number(page) - 1) * take >= 0 ? (Number(page) - 1) * take : 0;

    // 6. Tri sécurisé
    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'price_asc') orderBy = { price: 'asc' };
    else if (sort === 'price_desc') orderBy = { price: 'desc' };
    else if (sort === 'popular') orderBy = { viewsCount: 'desc' };
    else if (sort === 'oldest') orderBy = { createdAt: 'asc' };

    try {
      const [listings, total] = await Promise.all([
        this.prisma.listing.findMany({
          where: whereClause,
          skip,
          take,
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
          },
        }),
        this.prisma.listing.count({ where: whereClause }),
      ]);

      return {
        data: listings,
        meta: {
          total,
          page: Number(page),
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      };
    } catch (error) {
      this.logger.error(`Prisma error in findAll: ${error.message}`, error.stack);
      throw new BadRequestException(`Database query error: ${error.message}`);
    }
  }

  // ==========================================
  // FIND ONE
  // ==========================================

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
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return listing;
  }

  // ==========================================
  // CREATE
  // ==========================================

  async create(userId: string, dto: CreateListingDto) {
    const slug = this.generateSlug(dto.title);

    const listing = await this.prisma.listing.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        platform: dto.platform,
        condition: dto.condition,
        price: dto.price,
        isNegotiable: dto.isNegotiable ?? true,
        acceptsSwap: dto.acceptsSwap ?? false,
        location: dto.location,
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
          },
        },
        images: true,
      },
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

    return this.prisma.listing.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        platform: dto.platform,
        condition: dto.condition,
        price: dto.price,
        isNegotiable: dto.isNegotiable,
        acceptsSwap: dto.acceptsSwap,
        location: dto.location,
      },
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
  // PUBLISH
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

    return this.prisma.listing.update({
      where: { id },
      data: {
        status: 'PENDING_REVIEW',
        publishedAt: new Date(),
      },
    });
  }

  // ==========================================
  // MARK AS SOLD
  // ==========================================

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

  async uploadImages(userId: string, listingId: string, files: any[]) {
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

    return this.prisma.listingImage.delete({
      where: { id: imageId },
    });
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private generateSlug(title: string): string {
    return (
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 60) +
      '-' +
      uuidv4().substring(0, 8)
    );
  }
}
