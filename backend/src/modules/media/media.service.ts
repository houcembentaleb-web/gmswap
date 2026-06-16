import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { StorageService } from '../../infrastructure/storage/storage.service';
import * as sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ];

  constructor(private storage: StorageService) {}

  async uploadImage(
    file: Express.Multer.File,
    userId: string,
    options?: {
      resize?: { width: number; height: number };
      quality?: number;
    },
  ): Promise<string> {
    this.validateFile(file);

    const processed = await this.processImage(file, options);

    const key = `listings/${userId}/${uuidv4()}.jpg`;

    const url = await this.storage.uploadImage(processed, key);

    return url;
  }

  async uploadMultiple(
    files: Express.Multer.File[],
    userId: string,
  ): Promise<string[]> {
    const urls: string[] = [];
    
    for (const file of files) {
      const url = await this.uploadImage(file, userId);
      urls.push(url);
    }

    return urls;
  }

  private validateFile(file: Express.Multer.File) {
    if (file.size > this.MAX_FILE_SIZE) {
      throw new BadRequestException(`File size exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} not allowed`);
    }
  }

  private async processImage(
    file: Express.Multer.File,
    options?: {
      resize?: { width: number; height: number };
      quality?: number;
    },
  ): Promise<Buffer> {
    let pipeline = sharp(file.buffer);

    // Resize
    if (options?.resize) {
      pipeline = pipeline.resize(options.resize.width, options.resize.height, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    } else {
      // Default resize (1200px max)
      pipeline = pipeline.resize(1200, 1200, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to JPEG
    return pipeline
      .jpeg({
        quality: options?.quality || 80,
        progressive: true,
      })
      .toBuffer();
  }

  async generateThumbnails(imageBuffer: Buffer): Promise<{
    large: Buffer;
    medium: Buffer;
    small: Buffer;
  }> {
    const large = await sharp(imageBuffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const medium = await sharp(imageBuffer)
      .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    const small = await sharp(imageBuffer)
      .resize(300, 300, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 60 })
      .toBuffer();

    return { large, medium, small };
  }

  async getPresignedUploadUrl(userId: string, filename: string, contentType: string): Promise<{
    url: string;
    key: string;
    fields: Record<string, string>;
  }> {
    const key = `listings/${userId}/${uuidv4()}-${filename}`;
    
    // Generate presigned URL using S3
    const url = await this.storage.generatePresignedUrl(key, contentType);
    
    return {
      url,
      key,
      fields: {
        'Content-Type': contentType,
        'x-amz-meta-userId': userId,
      },
    };
  }
}