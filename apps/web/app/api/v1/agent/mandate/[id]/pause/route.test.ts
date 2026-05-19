import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  findFirstMock,
  rateLimitMock,
  updateMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  rateLimitMock: vi.fn(),
  updateMock: vi.fn(),
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

vi.mock('@/lib/prisma', () => ({
  prisma: {
    agentMandate: {
      findFirst: findFirstMock,
      update: updateMock,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

import { POST } from './route';

describe('POST /api/v1/agent/mandate/[id]/pause', () => {
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
  });

  it('marks an expired active mandate as expired instead of pausing it', async () => {
    findFirstMock.mockResolvedValue({
      id: 'mandate-1',
      xUserId: '12345',
      status: 'ACTIVE',
      expiryMs: BigInt(Date.now() - 1),
    });
    updateMock.mockResolvedValue({
      id: 'mandate-1',
      xUserId: '12345',
      mandateObjectId: '0xmandate',
      name: 'Expired mandate',
      actions: 8,
      coinLimits: [],
      periodMs: 86_400_000n,
      allowedTargets: [],
      expiryMs: BigInt(Date.now() - 1),
      metadata: {},
      status: 'EXPIRED',
      nonce: 1n,
      witnessCommit: '0xabc',
      createdTxDigest: 'created-digest',
      initTxDigest: 'init-digest',
      revokedTxDigest: null,
      revokedAt: null,
      destroyedTxDigest: null,
      destroyedAt: null,
      createdAt: new Date('2026-05-17T00:00:00.000Z'),
      updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    });

    const req = new NextRequest('http://localhost/api/v1/agent/mandate/mandate-1/pause', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'mandate-1' }) });

    expect(res.status).toBe(409);
    expect(updateMock).toHaveBeenCalledWith({
      where: { id: 'mandate-1' },
      data: { status: 'EXPIRED' },
    });
    await expect(res.json()).resolves.toMatchObject({
      error: 'Mandate has expired and cannot be paused',
      mandate: { status: 'EXPIRED' },
    });
  });
});
