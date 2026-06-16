import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import * as sharp from 'sharp';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      endpoint: process.env.AWS_ENDPOINT,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
      forcePathStyle: !!process.env.AWS_ENDPOINT,
    });
  }

  async uploadFile(file: Express.Multer.File, folder: string = 'uploads'): Promise<string> {
    const key = `${folder}/${uuidv4()}-${file.originalname}`;
    
    await this.s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: 'public, max-age=31536000',
    }));

    return this.getPublicUrl(key);
  }

  async uploadImage(file: Express.Multer.File, folder: string = 'images'): Promise<string> {
    const processed = await sharp(file.buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const key = `${folder}/${uuidv4()}.jpg`;
    
    await this.s3.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: processed,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000',
    }));

    return this.getPublicUrl(key);
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
    }));
  }

  private getPublicUrl(key: string): string {
    if (process.env.AWS_ENDPOINT) {
      return `${process.env.AWS_ENDPOINT}/${process.env.AWS_S3_BUCKET}/${key}`;
    }
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }
}