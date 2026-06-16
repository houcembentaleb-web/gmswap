import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export interface DomainEvent<T = any> {
  name: string;
  payload: T;
  metadata: {
    correlationId: string;
    userId?: string;
    source?: string;
    priority?: number;
  };
  timestamp: Date;
}

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);
  private queues: Map<string, Queue> = new Map();

  constructor(private redis: RedisService) {}

  async emit<T>(event: DomainEvent<T>): Promise<void> {
    const queue = await this.getQueue(event.name);
    
    const jobId = this.generateJobId(event);

    await queue.add(event.name, event, {
      jobId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
      priority: event.metadata.priority || 1,
    });

    this.logger.debug(`Event emitted: ${event.name} (${jobId})`);
  }

  private generateJobId(event: DomainEvent): string {
    const key = `${event.name}:${event.metadata.correlationId}`;
    return `${event.name}:${this.hashString(key)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async getQueue(name: string): Promise<Queue> {
    const queueName = `event:${name}`;
    
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        connection: this.redis.getClient(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });
      this.queues.set(queueName, queue);
    }

    return this.queues.get(queueName)!;
  }
}