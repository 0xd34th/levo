import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  countMock,
  createMock,
  findUniqueMock,
  getPrivyClientMock,
  rateLimitMock,
  ensureRecipientWalletMock,
  resolveFreshXUserMock,
  signQuoteTokenMock,
  updateManyMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  countMock: vi.fn(),
  createMock: vi.fn(),
  findUniqueMock: vi.fn(),
  getPrivyClientMock: vi.fn(),
  rateLimitMock: vi.fn(),
  ensureRecipientWalletMock: vi.fn(),
  resolveFreshXUserMock: vi.fn(),
  signQuoteTokenMock: vi.fn(),
  updateManyMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    invalidInputResponse: () =>
      new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'application/json',
        },
      }),
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/hmac', () => ({
  signQuoteToken: signQuoteTokenMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    paymentQuote: {
      updateMany: updateManyMock,
      count: countMock,
      create: createMock,
    },
    xUser: {
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  getPrivyClient: getPrivyClientMock,
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/recipient-wallet', () => ({
  ensureRecipientWallet: ensureRecipientWalletMock,
}));

vi.mock('@/lib/x-user-lookup', () => ({
  getXLookupErrorDetails: () => ({
    status: 503,
    error: 'X lookup is temporarily unavailable',
  }),
  resolveFreshXUser: resolveFreshXUserMock,
}));

import { POST } from './route';

describe('POST /api/v1/payments/quote', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    findUniqueMock.mockReset();
    vi.stubEnv('TWITTER_API_KEY', 'test-api-key');
    vi.stubEnv('NEXT_PUBLIC_VAULT_REGISTRY_ID', 'test-registry-id');
    vi.stubEnv('HMAC_SECRET', 'x'.repeat(32));

    rateLimitMock.mockResolvedValue({ allowed: true });
    getPrivyClientMock.mockReturnValue({});
    verifySameOriginMock.mockReturnValue({ ok: true });
    updateManyMock.mockResolvedValue({ count: 0 });
    countMock.mockResolvedValue(0);
    findUniqueMock.mockResolvedValue({
      privyUserId: 'privy-user',
      suiAddress: `0x${'0'.repeat(63)}2`,
    });
    resolveFreshXUserMock.mockResolvedValue({
      xUserId: '12345',
      username: 'alice',
      profilePicture: 'https://pbs.twimg.com/profile_images/avatar.jpg',
      isBlueVerified: false,
    });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '99999',
        username: 'sender',
        profilePictureUrl: null,
      },
    });
    ensureRecipientWalletMock.mockResolvedValue({
      xUserId: '12345',
      username: 'alice',
      profilePicture: 'https://pbs.twimg.com/profile_images/avatar.jpg',
      isBlueVerified: false,
      privyUserId: 'recipient-privy-user',
      privyWalletId: 'recipient-wallet-id',
      suiAddress: `0x${'0'.repeat(63)}4`,
      suiPublicKey: 'recipient-public-key',
    });
    signQuoteTokenMock.mockReturnValue('signed-quote-token');
    createMock.mockResolvedValue({});
  });

  it('rejects cross-origin quote requests before authenticating the sender', async () => {
    verifySameOriginMock.mockReturnValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Invalid request origin' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    });

    const req = new NextRequest('http://localhost/api/v1/payments/quote', {
      method: 'POST',
      body: JSON.stringify({
        username: 'alice',
        coinType: '0x2::sui::SUI',
        amount: '1000000000',
        senderAddress: '0x2',
      }),
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(verifyPrivyXAuthMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: 'Invalid request origin' });
  });

  it('rejects rate-limited quote requests before resolving the recipient', async () => {
    rateLimitMock.mockResolvedValueOnce({ allowed: false });

    const req = new NextRequest('http://localhost/api/v1/payments/quote', {
      method: 'POST',
      body: JSON.stringify({
        username: 'alice',
        coinType: '0x2::sui::SUI',
        amount: '1000000000',
        senderAddress: '0x2',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(rateLimitMock).toHaveBeenCalledWith('quote:127.0.0.1', 60, 20);
    expect(resolveFreshXUserMock).not.toHaveBeenCalled();
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: 'Rate limit exceeded' });
  });

  it('accepts and normalizes short-form sender addresses', async () => {
    const req = new NextRequest('http://localhost/api/v1/payments/quote', {
      method: 'POST',
      body: JSON.stringify({
        username: 'alice',
        coinType: '0x2::sui::SUI',
        amount: '1000000000',
        senderAddress: '0x2',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    const normalizedAddress = `0x${'0'.repeat(63)}2`;

    expect(res.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledWith('quote:127.0.0.1', 60, 20);
    expect(rateLimitMock).toHaveBeenCalledWith('quote:user:99999', 60, 10);
    expect(countMock).toHaveBeenCalledWith({
      where: {
        senderAddress: normalizedAddress,
        status: 'PENDING',
        expiresAt: { gt: expect.any(Date) },
      },
    });
    expect(signQuoteTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAddress: normalizedAddress,
        vaultAddress: `0x${'0'.repeat(63)}4`,
      }),
      'x'.repeat(32),
    );
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderAddress: normalizedAddress,
        vaultAddress: `0x${'0'.repeat(63)}4`,
      }),
    });
  });

  it('rejects invalid sender addresses', async () => {
    const req = new NextRequest('http://localhost/api/v1/payments/quote', {
      method: 'POST',
      body: JSON.stringify({
        username: 'alice',
        coinType: '0x2::sui::SUI',
        amount: '1000000000',
        senderAddress: 'not-a-sui-address',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(resolveFreshXUserMock).not.toHaveBeenCalled();
  });

  it('rejects sender addresses that do not match the authenticated embedded wallet', async () => {
    const req = new NextRequest('http://localhost/api/v1/payments/quote', {
      method: 'POST',
      body: JSON.stringify({
        username: 'alice',
        coinType: '0x2::sui::SUI',
        amount: '1000000000',
        senderAddress: '0x3',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(resolveFreshXUserMock).not.toHaveBeenCalled();
  });

  it('rejects Privy sessions that do not own the stored embedded wallet', async () => {
    findUniqueMock.mockReset();
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'different-privy-user',
      suiAddress: `0x${'0'.repeat(63)}2`,
    });

    const req = new NextRequest('http://localhost/api/v1/payments/quote', {
      method: 'POST',
      body: JSON.stringify({
        username: 'alice',
        coinType: '0x2::sui::SUI',
        amount: '1000000000',
        senderAddress: '0x2',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(resolveFreshXUserMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: 'Wallet ownership could not be verified. Please set up your wallet first.',
    });
  });

  it('returns the canonical recipient wallet address for X handle quotes', async () => {
    const req = new NextRequest('http://localhost/api/v1/payments/quote', {
      method: 'POST',
      body: JSON.stringify({
        username: 'alice',
        coinType: '0x2::sui::SUI',
        amount: '1000000000',
        senderAddress: '0x2',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(ensureRecipientWalletMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        xUserId: '12345',
        username: 'alice',
        profilePicture: 'https://pbs.twimg.com/profile_images/avatar.jpg',
        isBlueVerified: false,
      },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      recipientType: 'X_HANDLE',
      xUserId: '12345',
      username: 'alice',
      profilePicture: 'https://pbs.twimg.com/profile_images/avatar.jpg',
      isBlueVerified: false,
      recipientAddress: `0x${'0'.repeat(63)}4`,
      quoteToken: 'signed-quote-token',
      expiresAt: expect.any(String),
    });
  });

  it('rejects self-sends after resolving the target X account', async () => {
    resolveFreshXUserMock.mockResolvedValueOnce({
      xUserId: '99999',
      username: 'sender',
      profilePicture: 'https://pbs.twimg.com/profile_images/avatar.jpg',
      isBlueVerified: false,
    });

    const req = new NextRequest('http://localhost/api/v1/payments/quote', {
      method: 'POST',
      body: JSON.stringify({
        username: 'sender',
        coinType: '0x2::sui::SUI',
        amount: '1000000000',
        senderAddress: '0x2',
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(createMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: 'Cannot send to yourself',
    });
  });
});
