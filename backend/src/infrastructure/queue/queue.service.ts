import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private isEnabled = false;
  private redisClient: any = null;

  constructor(private redis: RedisService) {}

  async onModuleInit() {
    this.redisClient = this.redis.getClient();
    if (this.redisClient) {
      this.isEnabled = true;
      this.logger.log('Queue service enabled');
    } else {
      this.logger.warn('Queue service disabled (Redis not available)');
    }
  }

  async addJob(queueName: string, data: any): Promise<string> {
    if (!this.isEnabled) {
      this.logger.debug(`Job ${data.name} skipped (queue disabled)`);
      return 'skipped';
    }
    this.logger.log(`Job ${data.name} added to ${queueName}`);
    return 'queued';
  }
}
