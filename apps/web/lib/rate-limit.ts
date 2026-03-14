import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';

let _redis: Redis | null = null;
let lastRedisUnavailableLogAt = 0;

const SLIDING_WINDOW_SCRIPT = `
  local key = KEYS[1]
  local window_start = tonumber(ARGV[1])
  local now = tonumber(ARGV[2])
  local member = ARGV[3]
  local max_requests = tonumber(ARGV[4])
  local ttl = tonumber(ARGV[5])

  redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

  local count = redis.call('ZCARD', key)
  if count >= max_requests then
    redis.call('EXPIRE', key, ttl)
    return {0, count}
  end

  redis.call('ZADD', key, now, member)
  redis.call('EXPIRE', key, ttl)

  return {1, count + 1}
`;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    _redis.on('error', (error) => {
      logRateLimiterUnavailable(
        `Redis connection error (${_redis?.status ?? 'unknown'})`,
        error,
      );
    });
  }
  return _redis;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // unix timestamp (seconds)
}

function logRateLimiterUnavailable(message: string, error?: unknown) {
  const now = Date.now();
  if (now - lastRedisUnavailableLogAt < 60_000) {
    return;
  }

  lastRedisUnavailableLogAt = now;

  const details =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : error
        ? String(error)
        : '';

  console.warn(
    details ? `${message}; rate limiting disabled temporarily: ${details}` : message,
  );
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
  const resetAt = Math.floor((now + windowMs) / 1000);

  if (redis.status !== 'ready') {
    logRateLimiterUnavailable(
      `Redis is not ready (status=${redis.status}); allowing request`,
    );
    return {
      allowed: true,
      remaining: max,
      resetAt,
    };
  }

  try {
    const result = await redis.eval(
      SLIDING_WINDOW_SCRIPT,
      1,
      fullKey,
      windowStart,
      now,
      `${now}:${randomUUID()}`,
      max,
      windowSec + 1,
    );
    const [allowedValue, countValue] = result as [number, number];
    const allowed = Number(allowedValue) === 1;
    const count = Number(countValue);

    return {
      allowed,
      remaining: allowed ? Math.max(0, max - count) : 0,
      resetAt,
    };
  } catch (error) {
    logRateLimiterUnavailable('Rate limiter unavailable, allowing request', error);
    return {
      allowed: true,
      remaining: max,
      resetAt,
    };
  }
}
