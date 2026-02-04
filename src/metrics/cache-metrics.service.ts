import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsed: string;
}

@Injectable()
export class CacheMetricsService {
  private readonly logger = new Logger(CacheMetricsService.name);
  private hits = 0;
  private misses = 0;

  constructor(private readonly redis: RedisService) {}

  recordHit() {
    this.hits++;
  }

  recordMiss() {
    this.misses++;
  }

  async getMetrics(): Promise<CacheMetrics> {
    const client = this.redis.getClient();

    const [info, dbSize] = await Promise.all([
      client.info('stats'),
      client.dbsize(),
    ]);

    // Parse Redis stats
    const statsMatch = info.match(/keyspace_hits:(\d+)/);
    const missesMatch = info.match(/keyspace_misses:(\d+)/);

    const redisHits = parseInt(statsMatch?.[1] || '0');
    const redisMisses = parseInt(missesMatch?.[1] || '0');

    const totalRequests = redisHits + redisMisses;
    const hitRate = totalRequests > 0 ? (redisHits / totalRequests) * 100 : 0;

    return {
      hits: redisHits,
      misses: redisMisses,
      hitRate: parseFloat(hitRate.toFixed(2)),
      totalKeys: dbSize,
      memoryUsed: await this.getMemoryUsage(),
    };
  }

  private async getMemoryUsage(): Promise<string> {
    const client = this.redis.getClient();
    const info = await client.info('memory');
    const match = info.match(/used_memory_human:(.+)/);
    return match?.[1]?.trim() || 'Unknown';
  }

  async resetMetrics() {
    const client = this.redis.getClient();
    await client.config('RESETSTAT');
    this.hits = 0;
    this.misses = 0;
  }
}