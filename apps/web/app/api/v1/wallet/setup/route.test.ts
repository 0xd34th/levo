import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  acquireRedisLockMock,
  findUniqueMock,
  getOrCreateSuiWalletMock,
  rateLimitMock,
  updateMock,
  upsertMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  acquireRedisLockMock: vi.fn(),
  findUniqueMock: vi.fn(),
  getOrCreateSuiWalletMock: vi.fn(),
  rateLimitMock: vi.fn(),
  updateMock: vi.fn(),
  upsertMock: vi.fn(),
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

vi.mock('@/lib/privy-auth', () => ({
  getPrivyClient: vi.fn(() => ({ wallets: vi.fn() })),
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/privy-wallet', () => ({
  getOrCreateSuiWallet: getOrCreateSuiWalletMock,
  isWalletBindingConflictError: (error: unknown) =>
    error instanceof Error && error.name === 'WalletBindingConflictError',
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findUnique: findUniqueMock,
      update: updateMock,
      upsert: upsertMock,
    },
  },
}));

vi.mock('@/lib/redis-lock', () => ({
  acquireRedisLock: acquireRedisLockMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

import { POST } from './route';

describe('POST /api/v1/wallet/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '12345',
        username: 'alice',
        profilePictureUrl: 'https://pbs.twimg.com/profile_images/avatar.jpg',
      },
    });
    acquireRedisLockMock.mockResolvedValue({
      status: 'acquired',
      release: vi.fn().mockResolvedValue(undefined),
    });
    findUniqueMock.mockResolvedValue(null);
    updateMock.mockResolvedValue({});
    upsertMock.mockResolvedValue({});
    getOrCreateSuiWalletMock.mockResolvedValue({
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
  });

  it('provisions an embedded wallet for a verified Privy owner', async () => {
    const req = new NextRequest('http://localhost/api/v1/wallet/setup', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(rateLimitMock).toHaveBeenCalledWith('wallet-setup:127.0.0.1', 60, 10);
    expect(upsertMock).toHaveBeenCalledWith({
      where: { xUserId: '12345' },
      update: {
        username: 'alice',
        profilePicture: 'https://pbs.twimg.com/profile_images/avatar.jpg',
        privyUserId: 'privy-user',
      },
      create: {
        xUserId: '12345',
        username: 'alice',
        profilePicture: 'https://pbs.twimg.com/profile_images/avatar.jpg',
        privyUserId: 'privy-user',
      },
    });
    expect(getOrCreateSuiWalletMock).toHaveBeenCalledWith(
      expect.anything(),
      'privy-user',
      '12345',
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      suiAddress: '0xwallet',
      walletReady: true,
    });
  });

  it('rejects mismatched Privy owners for an existing X account', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'other-privy-user',
    });

    const req = new NextRequest('http://localhost/api/v1/wallet/setup', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(upsertMock).not.toHaveBeenCalled();
    expect(getOrCreateSuiWalletMock).not.toHaveBeenCalled();
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'This X account is already linked to a different embedded wallet owner.',
    });
  });

  it('surfaces canonical wallet binding conflicts instead of silently overwriting them', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: null,
    });
    getOrCreateSuiWalletMock.mockRejectedValueOnce(
      Object.assign(new Error('Stored wallet binding conflicts with Privy wallet data.'), {
        name: 'WalletBindingConflictError',
      }),
    );

    const req = new NextRequest('http://localhost/api/v1/wallet/setup', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    expect(updateMock).toHaveBeenCalledWith({
      where: { xUserId: '12345' },
      data: { privyUserId: null },
    });
    await expect(res.json()).resolves.toEqual({
      error: 'Stored wallet binding conflicts with Privy wallet data.',
    });
  });
});
