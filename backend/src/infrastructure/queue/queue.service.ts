import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { RedisService } from '../redis/redis.service';

export interface JobData {
  name: string;
  payload: any;
  options?: {
    delay?: number;
    attempts?: number;
    priority?: number;
  };
}

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();

  constructor(private redis: RedisService) {}

  async onModuleInit() {
    // Register default workers
    await this.registerWorker('email', this.handleEmailJob.bind(this));
    await this.registerWorker('notification', this.handleNotificationJob.bind(this));
    await this.registerWorker('trust-scoring', this.handleTrustScoringJob.bind(this));
    await this.registerWorker('moderation', this.handleModerationJob.bind(this));
    await this.registerWorker('analytics', this.handleAnalyticsJob.bind(this));
  }

  // ==========================================
  // QUEUE MANAGEMENT
  // ==========================================

  async addJob(queueName: string, data: JobData): Promise<string> {
    const queue = await this.getQueue(queueName);
    
    const job = await queue.add(data.name, data.payload, {
      attempts: data.options?.attempts || 3,
      delay: data.options?.delay || 0,
      priority: data.options?.priority || 1,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    });

    this.logger.debug(`Job ${job.id} added to ${queueName}`);
    return job.id;
  }

  async getQueue(name: string): Promise<Queue> {
    if (!this.queues.has(name)) {
      const queue = new Queue(name, {
        connection: this.redis.getClient(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });
      this.queues.set(name, queue);
    }
    return this.queues.get(name)!;
  }

  // ==========================================
  // WORKERS
  // ==========================================

  async registerWorker(queueName: string, handler: (job: Job) => Promise<any>) {
    if (this.workers.has(queueName)) {
      return;
    }

    const worker = new Worker(queueName, handler, {
      connection: this.redis.getClient(),
      concurrency: 5,
    });

    worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id} completed in ${queueName}`);
    });

    worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed in ${queueName}: ${err.message}`);
    });

    this.workers.set(queueName, worker);
  }

  // ==========================================
  // JOB HANDLERS
  // ==========================================

  private async handleEmailJob(job: Job) {
    const { to, subject, html, userId } = job.data;
    // Implementation with email provider
    this.logger.log(`Sending email to ${to}: ${subject}`);
    // Add your email service logic here
  }

  private async handleNotificationJob(job: Job) {
    const { userId, type, title, body } = job.data;
    this.logger.log(`Processing notification for user ${userId}: ${title}`);
    // Add notification logic here
  }

  private async handleTrustScoringJob(job: Job) {
    const { userId } = job.data;
    this.logger.log(`Computing trust score for user ${userId}`);
    // Add trust scoring logic here
  }

  private async handleModerationJob(job: Job) {
    const { contentId, contentType } = job.data;
    this.logger.log(`Moderating content ${contentId} (${contentType})`);
    // Add moderation logic here
  }

  private async handleAnalyticsJob(job: Job) {
    const { eventType, data } = job.data;
    this.logger.log(`Analytics event: ${eventType}`);
    // Add analytics logic here
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  async onModuleDestroy() {
    for (const [, queue] of this.queues) {
      await queue.close();
    }
    for (const [, worker] of this.workers) {
      await worker.close();
    }
  }
}