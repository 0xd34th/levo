import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  findManyMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
} = vi.hoisted(() => ({
  findManyMock: vi.fn(),
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
      findMany: findManyMock,
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

describe('GET /api/v1/agent/mandate/list', () => {
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
    findManyMock.mockResolvedValue([]);
  });

  it('allows authenticated same-site browser GET requests without an Origin header', async () => {
    const req = new NextRequest('https://levo.krilly.ai/api/v1/agent/mandate/list');

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { xUserId: '12345' },
      orderBy: { createdAt: 'desc' },
    });
    await expect(res.json()).resolves.toEqual({ mandates: [] });
  });
});
