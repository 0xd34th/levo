import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encodeTransactionHistoryCursor } from '@/lib/transaction-history-cursor';
import { WALLET_AUTH_CHALLENGE_COOKIE } from '@/lib/wallet-auth';

const {
  findManyMock,
  findUniqueMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
  verifyWalletAuthMock,
} = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  findUniqueMock: vi.fn(),
  rateLimitMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifyWalletAuthMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    verifyWalletAuth: verifyWalletAuthMock,
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findUnique: findUniqueMock,
    },
    paymentLedger: {
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

describe('GET /api/v1/payments/history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifyWalletAuthMock.mockResolvedValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '99999',
        username: 'sender',
        profilePictureUrl: null,
      },
    });
  });

  it('rejects invalid sender addresses before attempting authentication', async () => {
    const req = new NextRequest(
      'http://localhost/api/v1/payments/history?senderAddress=not-a-sui-address',
    );

    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(verifyPrivyXAuthMock).not.toHaveBeenCalled();
    expect(verifyWalletAuthMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
  });

  it('rejects Privy sessions that do not own the stored embedded wallet', async () => {
    findUniqueMock.mockResolvedValue({
      privyUserId: 'different-privy-user',
      suiAddress: `0x${'0'.repeat(63)}2`,
    });

    const req = new NextRequest(
      'http://localhost/api/v1/payments/history?senderAddress=0x2',
    );

    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(findManyMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: 'Wallet ownership could not be verified. Please set up your wallet first.',
    });
  });

  it('rejects Privy fallback requests when the sender address mismatches the stored wallet', async () => {
    findUniqueMock.mockResolvedValue({
      privyUserId: 'privy-user',
      suiAddress: `0x${'0'.repeat(63)}3`,
    });

    const req = new NextRequest(
      'http://localhost/api/v1/payments/history?senderAddress=0x2',
    );

    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(findManyMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: 'Sender address does not match the authenticated embedded wallet',
    });
  });

  it('allows the Privy fallback when the stored wallet owner matches', async () => {
    findUniqueMock.mockResolvedValue({
      privyUserId: 'privy-user',
      suiAddress: `0x${'0'.repeat(63)}2`,
    });
    findManyMock.mockResolvedValue([]);

    const req = new NextRequest(
      'http://localhost/api/v1/payments/history?senderAddress=0x2',
    );

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(findManyMock).toHaveBeenCalledTimes(1);
    await expect(res.json()).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('uses wallet-signature authentication when the challenge cookie is present', async () => {
    findManyMock.mockResolvedValue([]);

    const req = new NextRequest(
      'http://localhost/api/v1/payments/history?senderAddress=0x2',
      {
        headers: {
          'x-wallet-signature': 'wallet-signature',
          cookie: `${WALLET_AUTH_CHALLENGE_COOKIE}=challenge-token`,
        },
      },
    );

    const res = await GET(req);

    expect(verifyWalletAuthMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      `0x${'0'.repeat(63)}2`,
      '/api/v1/payments/history',
    );
    expect(verifyPrivyXAuthMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('passes decoded cursors into the ledger pagination query', async () => {
    findUniqueMock.mockResolvedValue({
      privyUserId: 'privy-user',
      suiAddress: `0x${'0'.repeat(63)}2`,
    });
    findManyMock.mockResolvedValue([]);
    const cursor = encodeTransactionHistoryCursor({
      createdAt: '2026-03-17T12:00:00.000Z',
      id: 'cursor-id',
    });

    const req = new NextRequest(
      `http://localhost/api/v1/payments/history?senderAddress=0x2&cursor=${cursor}&limit=10`,
    );

    await GET(req);

    expect(findManyMock).toHaveBeenCalledWith({
      where: {
        senderAddress: `0x${'0'.repeat(63)}2`,
        OR: [
          { createdAt: { lt: new Date('2026-03-17T12:00:00.000Z') } },
          {
            createdAt: new Date('2026-03-17T12:00:00.000Z'),
            id: { lt: 'cursor-id' },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 11,
      include: {
        xUser: {
          select: { username: true, profilePicture: true },
        },
      },
    });
  });
});
