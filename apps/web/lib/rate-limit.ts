import Redis from 'ioredis';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return _redis;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix timestamp (seconds)
}

/**
 * Sliding window rate limiter using Redis.
 * @param key Unique key (e.g., `resolve:${ip}`)
 * @param windowSec Window size in seconds
 * @param max Max requests per window
 */
export async function rateLimit(
  key: string,
  windowSec: number,
  max: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const windowStart = now - windowMs;

  const fullKey = `rl:${key}`;

  // Use a sorted set: score = timestamp, member = unique request id
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(fullKey, 0, windowStart);
  pipeline.zadd(fullKey, now, `${now}:${Math.random()}`);
  pipeline.zcard(fullKey);
  pipeline.expire(fullKey, windowSec + 1);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetAt: Math.floor((now + windowMs) / 1000),
  };
}
