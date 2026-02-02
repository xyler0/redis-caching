export class CacheKeyBuilder {
  private static readonly NAMESPACE = 'app';
  private static readonly VERSION = 'v1';

  /**
   * Build a cache key with namespace and version
   * Format: app:v1:{resource}:{identifier}
   */
  static build(resource: string, identifier: string | number): string {
    return `${this.NAMESPACE}:${this.VERSION}:${resource}:${identifier}`;
  }

  /**
   * Build a pattern for matching keys
   * Example: app:v1:users:* matches all user keys
   */
  static pattern(resource: string, wildcard = '*'): string {
    return `${this.NAMESPACE}:${this.VERSION}:${resource}:${wildcard}`;
  }

  /**
   * Build a list cache key with pagination params
   * Format: app:v1:users:list:page-1:limit-10
   */
  static buildList(
    resource: string,
    params: { page?: number; limit?: number } = {},
  ): string {
    const { page = 1, limit = 10 } = params;
    return `${this.NAMESPACE}:${this.VERSION}:${resource}:list:page-${page}:limit-${limit}`;
  }
}

/**
 * TTL (Time To Live) configuration per resource
 * Measured in seconds
 */
export const CacheTTL = {
  USER: 300, // 5 minutes - frequently accessed, moderate change rate
  USER_LIST: 60, // 1 minute - lists change more often
  ROLE: 3600, // 1 hour - rarely changes
} as const;