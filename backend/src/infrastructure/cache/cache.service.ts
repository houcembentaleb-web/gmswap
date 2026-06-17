// backend/src/infrastructure/cache/cache.service.ts

import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CacheService {
  private isEnabled = false;

  constructor(private redis: RedisService) {
    this.isEnabled = !!redis.getClient();
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isEnabled) return null;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.isEnabled) return;
    await this.redis.set(key, JSON.stringify(value), ttl);
  }

  async delete(key: string): Promise<void> {
    if (!this.isEnabled) return;
    await this.redis.delete(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (!this.isEnabled) return;
    // Implémentation simplifiée
  }
}
