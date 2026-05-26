/**
 * Cache store with Upstash Redis backend and in-memory fallback.
 * Free-tier BlockVision is 30 calls/day —— this layer is non-negotiable.
 */
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

interface KVAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  incrBy(key: string, by: number, ttlSeconds?: number): Promise<number>;
  del(key: string): Promise<void>;
}

class MemoryAdapter implements KVAdapter {
  private map = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.map.set(key, { value, expiresAt });
  }

  async incrBy(key: string, by: number, ttlSeconds?: number): Promise<number> {
    const cur = (await this.get<number>(key)) ?? 0;
    const next = cur + by;
    await this.set(key, next, ttlSeconds);
    return next;
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }
}

class RedisAdapter implements KVAdapter {
  constructor(private redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    return (await this.redis.get<T>(key)) ?? null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.set(key, value, { ex: ttlSeconds });
    } else {
      await this.redis.set(key, value);
    }
  }

  async incrBy(key: string, by: number, ttlSeconds?: number): Promise<number> {
    const next = await this.redis.incrby(key, by);
    if (ttlSeconds && next === by) {
      await this.redis.expire(key, ttlSeconds);
    }
    return next;
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

let cached: KVAdapter | null = null;

export function getStore(): KVAdapter {
  if (cached) return cached;
  const url = env.upstashUrl();
  const token = env.upstashToken();
  if (url && token) {
    cached = new RedisAdapter(new Redis({ url, token }));
  } else {
    cached = new MemoryAdapter();
  }
  return cached;
}

/**
 * SWR-style cache wrapper.
 * - Returns fresh value if within TTL.
 * - Returns stale value within stale-while-revalidate window and refreshes in background.
 * - Otherwise calls fetcher and stores.
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { ttl: number; swr?: number },
): Promise<T> {
  const store = getStore();
  const meta = await store.get<{ value: T; freshUntil: number; staleUntil: number }>(key);
  const now = Math.floor(Date.now() / 1000);
  if (meta && meta.freshUntil > now) {
    return meta.value;
  }
  if (meta && meta.staleUntil > now) {
    // background refresh, swallow errors
    void (async () => {
      try {
        const value = await fetcher();
        const swr = opts.swr ?? 0;
        await store.set(
          key,
          { value, freshUntil: now + opts.ttl, staleUntil: now + opts.ttl + swr },
          opts.ttl + swr,
        );
      } catch {
        /* ignore */
      }
    })();
    return meta.value;
  }
  const value = await fetcher();
  const swr = opts.swr ?? 0;
  await store.set(
    key,
    { value, freshUntil: now + opts.ttl, staleUntil: now + opts.ttl + swr },
    opts.ttl + swr,
  );
  return value;
}

export async function getStale<T>(key: string): Promise<T | null> {
  const meta = await getStore().get<{ value: T }>(key);
  return meta?.value ?? null;
}

export function hashKey(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((p) => (p === undefined || p === null ? "_" : String(p))).join(":");
}
