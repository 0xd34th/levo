import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  countMock,
  createMock,
  deriveVaultAddressMock,
  findUniqueMock,
  rateLimitMock,
  resolveFreshXUserMock,
  signQuoteTokenMock,
  updateManyMock,
  upsertMock,
} = vi.hoisted(() => ({
  countMock: vi.fn(),
  createMock: vi.fn(),
  deriveVaultAddressMock: vi.fn(),
  findUniqueMock: vi.fn(),
  rateLimitMock: vi.fn(),
  resolveFreshXUserMock: vi.fn(),
  signQuoteTokenMock: vi.fn(),
  updateManyMock: vi.fn(),
  upsertMock: vi.fn(),
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
  };
});

vi.mock('@/lib/sui', () => ({
  deriveVaultAddress: deriveVaultAddressMock,
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
    vi.stubEnv('TWITTER_API_KEY', 'test-api-key');
    vi.stubEnv('NEXT_PUBLIC_VAULT_REGISTRY_ID', 'test-registry-id');
    vi.stubEnv('HMAC_SECRET', 'x'.repeat(32));

    rateLimitMock.mockResolvedValue({ allowed: true });
    updateManyMock.mockResolvedValue({ count: 0 });
    countMock.mockResolvedValue(0);
    findUniqueMock.mockResolvedValue(null);
    resolveFreshXUserMock.mockResolvedValue({
      xUserId: '12345',
      username: 'alice',
      profilePicture: 'https://pbs.twimg.com/profile_images/avatar.jpg',
      isBlueVerified: false,
    });
    deriveVaultAddressMock.mockReturnValue('0xvault');
    signQuoteTokenMock.mockReturnValue('signed-quote-token');
    upsertMock.mockResolvedValue({});
    createMock.mockResolvedValue({});
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
    expect(rateLimitMock).toHaveBeenCalledWith(`quote:127.0.0.1:${normalizedAddress}`, 60, 10);
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
});
