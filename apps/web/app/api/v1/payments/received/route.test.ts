import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encodeTransactionHistoryCursor } from '@/lib/transaction-history-cursor';

const {
  buildIncomingPaymentsResponseMock,
  findUniqueMock,
  persistReceivedDashboardXUserMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
} = vi.hoisted(() => ({
  buildIncomingPaymentsResponseMock: vi.fn(),
  findUniqueMock: vi.fn(),
  persistReceivedDashboardXUserMock: vi.fn(),
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
    xUser: {
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/received-dashboard', () => ({
  buildIncomingPaymentsResponse: buildIncomingPaymentsResponseMock,
  persistReceivedDashboardXUser: persistReceivedDashboardXUserMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

import { GET } from './route';

describe('GET /api/v1/payments/received', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        xUserId: '12345',
        username: 'alice',
        profilePictureUrl: 'https://pbs.twimg.com/profile_images/avatar.jpg',
      },
    });
    findUniqueMock.mockResolvedValue({
      username: 'alice',
      isBlueVerified: false,
    });
    persistReceivedDashboardXUserMock.mockResolvedValue(1);
    buildIncomingPaymentsResponseMock.mockResolvedValue({
      username: 'alice',
      xUserId: '12345',
      recipientAddress: `0x${'1'.repeat(64)}`,
      walletReady: true,
      derivationVersion: 1,
      pendingBalances: [],
      recordedTotals: [],
      items: [],
      nextCursor: null,
    });
  });

  it('rejects malformed cursors before loading received payments', async () => {
    const req = new NextRequest('http://localhost/api/v1/payments/received?cursor=not-base64');

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(buildIncomingPaymentsResponseMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
  });

  it('passes decoded pagination cursors into the received dashboard builder', async () => {
    const cursor = encodeTransactionHistoryCursor({
      createdAt: '2026-03-17T12:00:00.000Z',
      id: 'cursor-id',
    });
    const req = new NextRequest(
      `http://localhost/api/v1/payments/received?cursor=${cursor}&limit=10`,
    );

    const res = await GET(req);

    expect(buildIncomingPaymentsResponseMock).toHaveBeenCalledWith(
      {
        xUserId: '12345',
        username: 'alice',
        profilePicture: 'https://pbs.twimg.com/profile_images/avatar.jpg',
        isBlueVerified: false,
      },
      10,
      {
        createdAt: '2026-03-17T12:00:00.000Z',
        id: 'cursor-id',
      },
      1,
    );
    expect(res.status).toBe(200);
  });
});
