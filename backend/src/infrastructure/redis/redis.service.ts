// backend/src/infrastructure/redis/redis.service.ts

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isEnabled = false;

  async onModuleInit() {
    // Vérifier si Redis est disponible
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    
    try {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Pas de retry
        lazyConnect: true,
      });

      await this.client.ping();
      this.isEnabled = true;
      this.logger.log('Redis connected successfully');
    } catch (error) {
      this.logger.warn('Redis not available, running without Redis');
      this.isEnabled = false;
      this.client = null;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isEnabled || !this.client) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.isEnabled || !this.client) return;
    try {
      if (ttl) {
        await this.client.set(key, value, 'EX', ttl);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      // Ignorer
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isEnabled || !this.client) return;
    try {
      await this.client.del(key);
    } catch {
      // Ignorer
    }
  }

  async incr(key: string): Promise<number> {
    if (!this.isEnabled || !this.client) return 0;
    try {
      return await this.client.incr(key);
    } catch {
      return 0;
    }
  }

  getClient(): Redis | null {
    return this.client;
  }
}
