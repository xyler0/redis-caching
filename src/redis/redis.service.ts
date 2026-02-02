import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private isConnected = false;

  async onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('✅ Connected to Redis');
      this.isConnected = true;
    });

    this.client.on('error', (err) => {
      this.logger.error('❌ Redis connection error', err);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      this.logger.warn('⚠️  Redis connection closed');
      this.isConnected = false;
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  isHealthy(): boolean {
    return this.isConnected;
  }

  async get(key: string): Promise {
    if (!this.isHealthy()) {
      this.logger.warn(`Redis unavailable, skipping GET for key: ${key}`);
      return null;
    }

    try {
      return await this.client.get(key);
    } catch (error) {
      this.logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise {
    if (!this.isHealthy()) {
      this.logger.warn(`Redis unavailable, skipping SET for key: ${key}`);
      return;
    }

    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Redis SET error for key ${key}:`, error);
    }
  }

  async del(key: string | string[]): Promise {
    if (!this.isHealthy()) {
      return;
    }

    try {
      if (Array.isArray(key)) {
        await this.client.del(...key);
      } else {
        await this.client.del(key);
      }
    } catch (error) {
      this.logger.error(`Redis DEL error:`, error);
    }
  }

  async keys(pattern: string): Promise {
    if (!this.isHealthy()) {
      return [];
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this.logger.error(`Redis KEYS error:`, error);
      return [];
    }
  }
}