// backend/src/infrastructure/queue/queue.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private isEnabled = false;

  constructor(private redis: RedisService) {}

  async onModuleInit() {
    // Vérifier si Redis est disponible
    if (this.redis.getClient()) {
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
    // Log seulement pour l'instant
    this.logger.log(`Job ${data.name} added to ${queueName}`);
    return 'queued';
  }
}
