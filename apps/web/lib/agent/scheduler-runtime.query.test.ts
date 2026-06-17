import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionTrigger } from '@/lib/generated/prisma/client';

const {
  executeMandateNowMock,
  lockReleaseMock,
  prismaMock,
  redisPipelineMock,
} = vi.hoisted(() => {
  const redisPipeline = {
    hincrby: vi.fn(() => redisPipeline),
    hset: vi.fn(() => redisPipeline),
    exec: vi.fn(),
  };

  return {
    executeMandateNowMock: vi.fn(),
    lockReleaseMock: vi.fn(),
    prismaMock: {
      agentMandate: {
        findMany: vi.fn(),
      },
      agentAction: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    redisPipelineMock: redisPipeline,
  };
});

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('@/lib/rate-limit', () => ({
  getRedis: () => ({
    pipeline: () => redisPipelineMock,
  }),
}));
vi.mock('@/lib/redis-lock', () => ({
  acquireRedisLock: vi.fn(() =>
    Promise.resolve({ status: 'acquired', release: lockReleaseMock }),
  ),
}));
vi.mock('./executor', () => ({
  executeMandateNow: executeMandateNowMock,
}));

describe('runScheduledTick query shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisPipelineMock.exec.mockResolvedValue([]);
    executeMandateNowMock.mockResolvedValue({
      status: 'confirmed',
      txDigest: '9rL2txDigest',
      actionId: 'action-1',
    });
    lockReleaseMock.mockResolvedValue(undefined);
  });

  it('loads latest scheduled actions for scanned mandates in one batch', async () => {
    prismaMock.agentMandate.findMany.mockResolvedValue([
      { id: 'mandate-1', metadata: { schedule: '* * * * *' } },
      { id: 'mandate-2', metadata: { schedule: '* * * * *' } },
    ]);
    prismaMock.agentAction.findMany.mockResolvedValue([
      {
        mandateId: 'mandate-1',
        trigger: ActionTrigger.SCHEDULED,
        createdAt: new Date('2026-05-19T00:00:00.000Z'),
      },
      {
        mandateId: 'mandate-2',
        trigger: ActionTrigger.SCHEDULED,
        createdAt: new Date('2026-05-19T00:00:30.000Z'),
      },
    ]);

    const { runScheduledTick } = await import('./scheduler-runtime');
    const stats = await runScheduledTick({
      now: new Date('2026-05-19T00:05:00.000Z'),
    });

    expect(prismaMock.agentAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          mandateId: { in: ['mandate-1', 'mandate-2'] },
          trigger: ActionTrigger.SCHEDULED,
        },
      }),
    );
    expect(prismaMock.agentAction.findFirst).not.toHaveBeenCalled();
    expect(executeMandateNowMock).toHaveBeenCalledWith({
      mandateId: 'mandate-1',
      trigger: ActionTrigger.SCHEDULED,
    });
    expect(executeMandateNowMock).toHaveBeenCalledWith({
      mandateId: 'mandate-2',
      trigger: ActionTrigger.SCHEDULED,
    });
    expect(stats).toMatchObject({ scanned: 2, fired: 2, queued: 2 });
  });
});
