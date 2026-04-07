import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  countMock,
  createMock,
  deriveVaultAddressMock,
  findUniqueMock,
  getObjectMock,
  getSuiClientMock,
  rateLimitMock,
  resolveFreshXUserMock,
  signQuoteTokenMock,
  updateManyMock,
  upsertMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  countMock: vi.fn(),
  createMock: vi.fn(),
  deriveVaultAddressMock: vi.fn(),
  findUniqueMock: vi.fn(),
  getObjectMock: vi.fn(),
  getSuiClientMock: vi.fn(),
  rateLimitMock: vi.fn(),
  resolveFreshXUserMock: vi.fn(),
  signQuoteTokenMock: vi.fn(),
  updateManyMock: vi.fn(),
  upsertMock: vi.fn(),
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

vi.mock('@/lib/sui', () => ({
  deriveVaultAddress: deriveVaultAddressMock,
  getSuiClient: getSuiClientMock,
}));

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
      upsert: upsertMock,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
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
    getObjectMock.mockReset();
    vi.stubEnv('TWITTER_API_KEY', 'test-api-key');
    vi.stubEnv('NEXT_PUBLIC_VAULT_REGISTRY_ID', 'test-registry-id');
    vi.stubEnv('HMAC_SECRET', 'x'.repeat(32));

    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    updateManyMock.mockResolvedValue({ count: 0 });
    countMock.mockResolvedValue(0);
    findUniqueMock
      .mockResolvedValueOnce({
        privyUserId: 'privy-user',
        suiAddress: `0x${'0'.repeat(63)}2`,
      })
      .mockResolvedValueOnce({
        accountStatus: null,
        privyUserId: 'recipient-privy-user',
        suiAddress: `0x${'0'.repeat(63)}4`,
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
    deriveVaultAddressMock.mockReturnValue('0xvault');
    getSuiClientMock.mockReturnValue({
      getObject: getObjectMock,
    });
    getObjectMock.mockResolvedValue({ error: { code: 'notExists' } });
    signQuoteTokenMock.mockReturnValue('signed-quote-token');
    upsertMock.mockResolvedValue({});
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
      expect.objectContaining({ senderAddress: normalizedAddress }),
      'x'.repeat(32),
    );
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        senderAddress: normalizedAddress,
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

  it('rejects recipient vaults with any owner mismatch before creating a quote', async () => {
    findUniqueMock.mockReset();
    findUniqueMock
      .mockResolvedValueOnce({
        privyUserId: 'privy-user',
        suiAddress: `0x${'0'.repeat(63)}2`,
      })
      .mockResolvedValueOnce({
        accountStatus: null,
        privyUserId: 'recipient-privy-user',
        suiAddress: `0x${'0'.repeat(63)}4`,
      });
    getObjectMock.mockResolvedValueOnce({
      data: {
        objectId: '0xvault',
        content: {
          dataType: 'moveObject',
          fields: {
            owner: `0x${'0'.repeat(63)}9`,
            recovery_counter: '1',
          },
        },
      },
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

    expect(res.status).toBe(409);
    expect(createMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: 'Recipient vault is controlled by a different wallet and cannot safely receive new funds.',
    });
  });

  it('rejects recipient vaults when the recipient has a Privy owner but no canonical wallet binding yet', async () => {
    findUniqueMock.mockReset();
    findUniqueMock
      .mockResolvedValueOnce({
        privyUserId: 'privy-user',
        suiAddress: `0x${'0'.repeat(63)}2`,
      })
      .mockResolvedValueOnce({
        accountStatus: null,
        privyUserId: 'recipient-privy-user',
        suiAddress: null,
      });
    getObjectMock.mockResolvedValueOnce({
      data: {
        objectId: '0xvault',
        content: {
          dataType: 'moveObject',
          fields: {
            owner: `0x${'0'.repeat(63)}9`,
            recovery_counter: '1',
          },
        },
      },
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

    expect(res.status).toBe(409);
    expect(createMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: 'Recipient wallet binding is incomplete and cannot safely receive new funds.',
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
