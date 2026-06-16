import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  actionFindManyMock,
  mandateFindFirstMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
} = vi.hoisted(() => ({
  actionFindManyMock: vi.fn(),
  mandateFindFirstMock: vi.fn(),
  rateLimitMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    agentMandate: {
      findFirst: mandateFindFirstMock,
    },
    agentAction: {
      findMany: actionFindManyMock,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

import { GET } from './route';

describe('GET /api/v1/agent/mandate/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '12345',
        username: 'sender',
        profilePictureUrl: null,
      },
    });
    mandateFindFirstMock.mockResolvedValue({
      id: 'mandate-1',
      xUserId: '12345',
      mandateObjectId: '0xmandate',
      name: 'Daily harvest',
      actions: 1,
      coinLimits: [],
      periodMs: 86_400_000n,
      allowedTargets: [],
      expiryMs: 1_797_955_200_000n,
      metadata: {},
      status: 'ACTIVE',
      nonce: 0n,
      witnessCommit: null,
      createdTxDigest: 'created-digest',
      initTxDigest: null,
      revokedTxDigest: null,
      revokedAt: null,
      destroyedTxDigest: null,
      destroyedAt: null,
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    });
    actionFindManyMock.mockResolvedValue([]);
  });

  it('allows authenticated same-site browser GET requests without an Origin header', async () => {
    const req = new NextRequest('https://levo.finance/api/v1/agent/mandate/mandate-1');

    const res = await GET(req, { params: Promise.resolve({ id: 'mandate-1' }) });

    expect(res.status).toBe(200);
    expect(mandateFindFirstMock).toHaveBeenCalledWith({
      where: { id: 'mandate-1', xUserId: '12345' },
    });
    expect(actionFindManyMock).toHaveBeenCalledWith({
      where: { mandateId: 'mandate-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    await expect(res.json()).resolves.toMatchObject({
      mandate: {
        id: 'mandate-1',
        xUserId: '12345',
        periodMs: '86400000',
      },
      actions: [],
    });
  });
});
