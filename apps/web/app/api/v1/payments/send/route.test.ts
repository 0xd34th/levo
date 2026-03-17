import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  findFirstMock,
  findUniqueMock,
  rateLimitMock,
  verifyQuoteTokenMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  findUniqueMock: vi.fn(),
  rateLimitMock: vi.fn(),
  verifyQuoteTokenMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
}));

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn(),
  TransactionDataBuilder: {
    getDigestFromBytes: vi.fn(),
  },
  coinWithBalance: vi.fn(),
}));

vi.mock('@/app/api/v1/payments/confirm/route', () => ({
  POST: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/gas-station', () => ({
  getGasStationKeypair: vi.fn(),
}));

vi.mock('@/lib/hmac', () => ({
  verifyQuoteToken: verifyQuoteTokenMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findUnique: findUniqueMock,
    },
    paymentQuote: {
      findFirst: findFirstMock,
      updateMany: vi.fn(),
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
  getRedis: vi.fn(() => ({ status: 'ready', get: vi.fn(), set: vi.fn(), del: vi.fn() })),
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/sui', () => ({
  getSuiClient: vi.fn(),
}));

import { POST } from './route';

describe('POST /api/v1/payments/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HMAC_SECRET = 'x'.repeat(64);
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
    findFirstMock.mockResolvedValue(null);
    verifyQuoteTokenMock.mockReturnValue({
      xUserId: '99999',
      derivationVersion: 1,
      vaultAddress: '0xvault',
      coinType: '0x2::sui::SUI',
      amount: '1000000',
      senderAddress: '0xwallet',
      nonce: 'nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
  });

  it('rejects sends when no embedded wallet has been provisioned', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({ quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'No embedded wallet found. Please set up your wallet first.',
    });
  });

  it('rejects sends from Privy sessions that do not own the stored embedded wallet', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'different-privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({ quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'Wallet ownership could not be verified. Please set up your wallet first.',
    });
  });

  it('hides the specific quote status when the quote is no longer pending', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    findFirstMock.mockResolvedValueOnce({
      status: 'FAILED',
      confirmedTxDigest: null,
    });

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({ quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Quote is no longer available',
    });
  });
});
