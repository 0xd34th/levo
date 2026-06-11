import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { encodeWalletActivityCursor } from '@/lib/wallet-activity';
import { WALLET_AUTH_CHALLENGE_COOKIE } from '@/lib/wallet-auth';

const {
  fetchWalletActivityMock,
  findUniqueMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
  verifyWalletAuthMock,
} = vi.hoisted(() => ({
  fetchWalletActivityMock: vi.fn(),
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
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/wallet-activity', async () => {
  const actual = await vi.importActual<typeof import('@/lib/wallet-activity')>('@/lib/wallet-activity');

  return {
    ...actual,
    fetchWalletActivity: fetchWalletActivityMock,
  };
});

import { GET } from './route';

describe('GET /api/v1/activity', () => {
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
    findUniqueMock.mockResolvedValue({
      privyUserId: 'privy-user',
      suiAddress: `0x${'0'.repeat(63)}2`,
    });
    fetchWalletActivityMock.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
  });

  it('rejects Privy sessions that do not own the requested embedded wallet address', async () => {
    findUniqueMock.mockResolvedValue({
      privyUserId: 'privy-user',
      suiAddress: `0x${'0'.repeat(63)}3`,
    });

    const req = new NextRequest('http://localhost/api/v1/activity?address=0x2');
    const res = await GET(req);

    expect(res.status).toBe(403);
    expect(fetchWalletActivityMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: 'Address does not match the authenticated embedded wallet',
    });
  });

  it('rejects invalid combined cursors before querying chain activity', async () => {
    const req = new NextRequest('http://localhost/api/v1/activity?address=0x2&cursor=not-base64');
    const res = await GET(req);

    expect(res.status).toBe(400);
    expect(fetchWalletActivityMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
  });

  it('uses wallet-signature authentication with the activity route scope', async () => {
    const req = new NextRequest('http://localhost/api/v1/activity?address=0x2', {
      headers: {
        'x-wallet-signature': 'wallet-signature',
        cookie: `${WALLET_AUTH_CHALLENGE_COOKIE}=challenge-token`,
      },
    });

    const res = await GET(req);

    expect(verifyWalletAuthMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      `0x${'0'.repeat(63)}2`,
      '/api/v1/activity',
    );
    expect(verifyPrivyXAuthMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });

  it('passes address, decoded cursor, and limit to the wallet activity fetcher', async () => {
    const cursor = encodeWalletActivityCursor({
      from: 'from-digest',
      to: 'to-digest',
      seenDigests: ['seen-digest'],
    });

    const req = new NextRequest(`http://localhost/api/v1/activity?address=0x2&cursor=${cursor}&limit=7`);
    const res = await GET(req);

    expect(fetchWalletActivityMock).toHaveBeenCalledWith({
      address: `0x${'0'.repeat(63)}2`,
      cursor: {
        from: 'from-digest',
        to: 'to-digest',
        seenDigests: ['seen-digest'],
      },
      limit: 7,
    });
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('returns a no-store 503 when the Sui RPC activity query fails', async () => {
    fetchWalletActivityMock.mockRejectedValue(new Error('RPC unavailable'));

    const req = new NextRequest('http://localhost/api/v1/activity?address=0x2');
    const res = await GET(req);

    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(res.json()).resolves.toEqual({
      error: 'Activity is temporarily unavailable',
    });
  });
});
