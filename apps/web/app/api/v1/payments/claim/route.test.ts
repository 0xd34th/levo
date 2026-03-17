import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  acquireRedisLockMock,
  findUniqueMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_PACKAGE_ID = 'package-id';
  process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID = 'registry-id';
  process.env.ENCLAVE_REGISTRY_ID = 'enclave-id';

  return {
  acquireRedisLockMock: vi.fn(),
  findUniqueMock: vi.fn(),
  rateLimitMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
  };
});

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/nautilus', () => ({
  requestAttestation: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock('@/lib/privy-auth', () => ({
  getPrivyClient: vi.fn(),
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/privy-wallet', () => ({
  signSuiTransaction: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/redis-lock', () => ({
  acquireRedisLock: acquireRedisLockMock,
}));

vi.mock('@/lib/sui', () => ({
  deriveVaultAddress: vi.fn(),
  getSuiClient: vi.fn(),
}));

import { POST } from './route';

describe('POST /api/v1/payments/claim', () => {
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
        profilePictureUrl: null,
      },
    });
    acquireRedisLockMock.mockResolvedValue({
      status: 'acquired',
      release: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('rejects claims when the embedded wallet has not been provisioned', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'No embedded wallet found. Please set up your wallet first.',
    });
  });

  it('rejects claims from Privy sessions that do not own the stored embedded wallet', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'different-privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'Wallet ownership could not be verified. Please set up your wallet first.',
    });
  });
});
