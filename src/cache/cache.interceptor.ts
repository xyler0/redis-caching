import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../redis/redis.service';
import { CACHE_KEY, CacheConfig } from './cache.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const cacheConfig = this.reflector.get(
      CACHE_KEY,
      context.getHandler(),
    );

    if (!cacheConfig) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const cacheKey = cacheConfig.keyBuilder(request.params, request.query);

    // Try to get from cache
    const cachedData = await this.redis.get(cacheKey);

    if (cachedData) {
      this.logger.debug(`✅ Cache HIT: ${cacheKey}`);
      return of(JSON.parse(cachedData));
    }

    this.logger.debug(`❌ Cache MISS: ${cacheKey}`);

    // Execute handler and cache result
    return next.handle().pipe(
      tap(async (data) => {
        if (data) {
          await this.redis.set(
            cacheKey,
            JSON.stringify(data),
            cacheConfig.ttl,
          );
          this.logger.debug(`💾 Cached: ${cacheKey} (TTL: ${cacheConfig.ttl}s)`);
        }
      }),
    );
  }
}