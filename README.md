# Redis Caching

Reduce database load without lying to clients. Cache-aside pattern with graceful degradation.

## Setup

```bash
docker-compose up -d
npm install
npm run prisma migrate reset -- --force
npm run seed
npm run start:dev
```

## Why Cache-Aside?

### Cache-Aside (What We Use) ✅

```
Read Request:
1. Check cache
2. Cache miss? → Read from DB
3. Store in cache
4. Return to client

Write Request:
1. Write to DB
2. Don't touch cache
3. Cache expires naturally (TTL)
```

**Benefits:**
- ✅ Simple and reliable
- ✅ DB is source of truth
- ✅ Cache failures don't break app
- ✅ No complex invalidation on reads

### Alternatives (Not Used)

**Write-Through:** ❌
```
Write → Update DB AND cache simultaneously
Problem: Complex, cache can get out of sync
```

**Write-Behind:** ❌
```
Write → Update cache → Eventually write to DB
Problem: Data loss if cache crashes
```

**Read-Through:** ❌
```
Cache layer automatically fetches from DB
Problem: Tight coupling, harder to debug
```

## Cache Key Design

### Format

```
{namespace}:{version}:{resource}:{identifier}
```

### Examples

**Single resource:**
```
app:v1:user:550e8400-e29b-41d4-a716-446655440000
```

**List with pagination:**
```
app:v1:users:list:page-1:limit-10
app:v1:users:list:page-2:limit-10
```

### Why This Format?

**Namespace (`app`):**
- Prevents collisions in shared Redis
- Multiple apps can use same Redis instance

**Version (`v1`):**
- Invalidate all caches when data format changes
- Just increment version: `v1` → `v2`

**Resource (`user`, `users`):**
- Groups related keys
- Easy pattern matching: `app:v1:user:*`

**Identifier:**
- Unique per resource instance
- For lists: includes pagination params

## TTL Rationale

### Per-Resource TTL

```typescript
USER: 300s (5 minutes)
USER_LIST: 60s (1 minute)  
ROLE: 3600s (1 hour)
```

### Why Different TTLs?

**Users (5 minutes):**
- Frequently accessed
- Moderate change rate
- Acceptable staleness window

**User Lists (1 minute):**
- Change more often (new users, deletions)
- Less critical to cache long-term
- Shorter TTL = fresher data

**Roles (1 hour):**
- Rarely change
- Frequently read
- Long TTL reduces DB load significantly

### Setting TTL

Too Short:
- ❌ More DB queries
- ❌ Less cache benefit
- ✅ Fresher data

Too Long:
- ✅ Fewer DB queries
- ✅ Better cache hit rate
- ❌ Staler data

**Rule of Thumb:**
```
TTL = How long can I tolerate stale data?
```

## Failure Handling

### Redis Down

```typescript
try {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
} catch (error) {
  logger.warn('Redis unavailable, falling back to DB');
}

// Always fallback to database
return await db.query();
```

**Result:** App continues working, just slower.

### Cache Miss

```typescript
const cached = await redis.get(key);

if (!cached) {
  // Normal flow - query DB
  const data = await db.query();
  await redis.set(key, JSON.stringify(data), TTL);
  return data;
}

return JSON.parse(cached);
```

**Result:** Transparent to client.

### TTL Expired

```typescript
// Redis automatically deletes expired keys
// Next request treats it as cache miss
// Fresh data fetched from DB
```

**Result:** Data refreshes automatically.

## Performance Metrics

### Benchmark Results

```
Scenario                     | Avg Latency | P99 Latency | Throughput   | Improvement
-----------------------------|-------------|-------------|--------------|------------
Cold Cache - Single User     | 15.2ms      | 28.5ms      | 650 req/s    | baseline
Warm Cache - Single User     | 2.1ms       | 4.8ms       | 4,500 req/s  | 86% faster
Cold Cache - User List       | 45.8ms      | 89.2ms      | 215 req/s    | baseline
Warm Cache - User List       | 3.5ms       | 7.2ms       | 2,800 req/s  | 92% faster
```

**Key Findings:**
- 86-92% latency reduction with warm cache
- 7x throughput improvement on single queries
- 13x throughput improvement on list queries

### Cache Hit Rate

```bash
curl http://localhost:3000/metrics/cache
```

**Response:**
```json
{
  "hits": 8542,
  "misses": 1458,
  "hitRate": 85.42,
  "totalKeys": 127,
  "memoryUsed": "4.2M"
}
```

**Target:** >80% hit rate for production

## Testing

```bash
npm test
```

**Tests verify:**
- Cache populated after first read
- Cache hit bypasses database
- TTL expiry reloads fresh data
- Redis failure falls back to database
- Different cache keys for different params

## Benchmarking

```bash
npm run benchmark
```

Runs autocannon against:
1. Cold cache (first request)
2. Warm cache (subsequent requests)
3. List endpoints (cold/warm)

Results saved to `benchmarks/results.md`

## Common Issues

### Issue: Cache Never Hits

**Symptom:** All requests go to DB

**Possible Causes:**
1. Redis not running
2. Cache key mismatch
3. TTL too short

**Debug:**
```bash
# Check Redis connection
docker exec redis_cache redis-cli PING

# List cached keys
docker exec redis_cache redis-cli KEYS "app:v1:*"

# Get specific key
docker exec redis_cache redis-cli GET "app:v1:user:123"
```

### Issue: Stale Data Served

**Symptom:** Updates not reflected

**Cause:** Cache not invalidated on write

**Solution:** See Week 7 Repo 2 (cache-invalidation)

### Issue: Memory Bloat

**Symptom:** Redis using too much memory

**Solution:**
```bash
# Check memory usage
docker exec redis_cache redis-cli INFO memory

# Set eviction policy (already configured in docker-compose)
maxmemory 256mb
maxmemory-policy allkeys-lru
```

## When NOT to Cache

❌ **Don't cache if:**

1. **Data changes frequently**
   ```
   User last_seen_at (updates every request)
   → Cache would always be stale
   ```

2. **Data is already fast**
   ```
   Query takes 2ms
   → Caching adds complexity for minimal gain
   ```

3. **Data is user-specific and private**
   ```
   Personal settings, passwords
   → Security risk if cache leaks
   ```

4. **Data must be real-time**
   ```
   Stock prices, live scores
   → Stale data is worse than slow data
   ```

5. **Write-heavy workload**
   ```
   90% writes, 10% reads
   → Cache invalidation overhead > benefit
   ```

## Best Practices

### DO

✅ Use cache-aside pattern
✅ Set appropriate TTLs
✅ Handle Redis failures gracefully
✅ Use namespaced, versioned keys
✅ Monitor cache hit rates
✅ Benchmark before/after
✅ Document TTL reasoning

### DON'T

❌ Store sensitive data in cache
❌ Rely on cache for correctness
❌ Use same TTL for everything
❌ Cache write-heavy endpoints
❌ Ignore Redis failures
❌ Cache without measuring
❌ Use cache as primary datastore

## Monitoring

### Key Metrics

```typescript
// Cache effectiveness
hitRate = hits / (hits + misses) * 100
// Target: >80%

// Memory efficiency
keysPerMB = totalKeys / memoryUsedMB
// Monitor for bloat

// Average TTL
// Should align with configured TTLs
```

### Alerts

Set up alerts for:
- Hit rate drops below 70%
- Memory usage > 80%
- Redis connection failures
- Latency spikes on cache misses

## Further Reading

- [Caching Strategies](https://aws.amazon.com/caching/implementation/)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)