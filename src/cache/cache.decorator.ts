import { SetMetadata } from '@nestjs/common';

export const CACHE_KEY = 'cache_config';

export interface CacheConfig {
  ttl: number;
  keyBuilder: (...args: any[]) => string;
}

export const Cached = (config: CacheConfig) => SetMetadata(CACHE_KEY, config);