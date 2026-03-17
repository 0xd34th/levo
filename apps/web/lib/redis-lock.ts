import { randomUUID } from 'node:crypto';
import { getRedis } from '@/lib/rate-limit';

const RELEASE_LOCK_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end

  return 0
`;

export type RedisLock =
  | {
      status: 'acquired';
      release: () => Promise<void>;
    }
  | {
      status: 'busy' | 'unavailable';
    };

export async function acquireRedisLock(
  key: string,
  ttlSec: number,
): Promise<RedisLock> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return { status: 'unavailable' };
  }

  const lockKey = `lock:${key}`;
  const token = randomUUID();

  try {
    const result = await redis.set(lockKey, token, 'EX', ttlSec, 'NX');
    if (result !== 'OK') {
      return { status: 'busy' };
    }
  } catch (error) {
    console.warn('Failed to acquire Redis lock', { key, error });
    return { status: 'unavailable' };
  }

  return {
    status: 'acquired',
    async release() {
      try {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
      } catch (error) {
        console.warn('Failed to release Redis lock', { key, error });
      }
    },
  };
}
