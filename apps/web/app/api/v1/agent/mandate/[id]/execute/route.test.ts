import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ActionTrigger } from '@/lib/generated/prisma/client';

const {
  acquireRedisLockMock,
  executeMandateNowMock,
  lockReleaseMock,
  prismaMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  acquireRedisLockMock: vi.fn(),
  executeMandateNowMock: vi.fn(),
  lockReleaseMock: vi.fn(),
  prismaMock: {
    agentMandate: {
      findFirst: vi.fn(),
    },
  },
  rateLimitMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/agent/executor', () => ({
  executeMandateNow: executeMandateNowMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/redis-lock', () => ({
  acquireRedisLock: acquireRedisLockMock,
}));

import { POST } from './route';

function postExecute(id = 'mandate-1') {
  const req = new NextRequest(`http://localhost/api/v1/agent/mandate/${id}/execute`, {
    method: 'POST',
    headers: { origin: 'http://localhost' },
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

describe('POST /api/v1/agent/mandate/[id]/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '12345',
        username: 'sender',
        profilePictureUrl: null,
      },
    });
    prismaMock.agentMandate.findFirst.mockResolvedValue({
      id: 'mandate-1',
      xUserId: '12345',
    });
    acquireRedisLockMock.mockResolvedValue({
      status: 'acquired',
      release: lockReleaseMock,
    });
    lockReleaseMock.mockResolvedValue(undefined);
    executeMandateNowMock.mockResolvedValue({
      status: 'confirmed',
      txDigest: '9rL2txDigest',
      actionId: 'action-1',
    });
  });

  it('runs the mandate execution internally and returns the outcome', async () => {
    const res = await postExecute();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'confirmed',
      txDigest: '9rL2txDigest',
      actionId: 'action-1',
    });
    expect(executeMandateNowMock).toHaveBeenCalledWith({
      mandateId: 'mandate-1',
      trigger: ActionTrigger.CHAT,
    });
    expect(lockReleaseMock).toHaveBeenCalled();
  });
});
