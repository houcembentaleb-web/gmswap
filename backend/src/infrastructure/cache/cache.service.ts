import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class CacheService {
  constructor(private redis: RedisService) {}

  private getVersionedKey(key: string, version: string = 'v1'): string {
    return `${key}:${version}`;
  }

  async get<T>(key: string, version: string = 'v1'): Promise<T | null> {
    const data = await this.redis.get(this.getVersionedKey(key, version));
    return data ? JSON.parse(data) : null;
  }

  async set<T>(key: string, value: T, ttl: number = 60, version: string = 'v1'): Promise<void> {
    await this.redis.set(this.getVersionedKey(key, version), JSON.stringify(value), ttl);
  }

  async delete(key: string, version: string = 'v1'): Promise<void> {
    await this.redis.delete(this.getVersionedKey(key, version));
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      for (const key of keys) {
        await this.redis.delete(key);
      }
    }
  }

  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = 60,
    version: string = 'v1',
  ): Promise<T> {
    const cached = await this.get<T>(key, version);
    if (cached !== null) {
      return cached;
    }

    const result = await fetcher();
    await this.set(key, result, ttl, version);
    return result;
  }
}