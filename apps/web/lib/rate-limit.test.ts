import { describe, expect, it, vi } from 'vitest';

const { redisInstance } = vi.hoisted(() => ({
  redisInstance: {
    status: 'connecting',
    on: vi.fn(),
  },
}));

vi.mock('ioredis', () => ({
  default: vi.fn(function RedisMock() {
    return redisInstance;
  }),
}));

describe('rateLimit', () => {
  it('fails closed when Redis is unavailable', async () => {
    const { rateLimit } = await import('./rate-limit');

    await expect(rateLimit('agent-chat:127.0.0.1', 60, 20)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
  });
});
