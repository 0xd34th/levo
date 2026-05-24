import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MAINNET_USDC_TYPE, SUI_COIN_TYPE, normalizeCoinType } from '@/lib/coins';

const {
  findUniqueMock,
  getBestSevenKQuoteMock,
  rateLimitMock,
  stageSwapQuoteMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  getBestSevenKQuoteMock: vi.fn(),
  rateLimitMock: vi.fn(),
  stageSwapQuoteMock: vi.fn(),
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

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/swap/seven-k', () => ({
  getBestSevenKQuote: getBestSevenKQuoteMock,
}));

vi.mock('@/lib/swap/quote-store', () => ({
  stageSwapQuote: stageSwapQuoteMock,
}));

import { POST } from './route';

describe('POST /api/v1/swap/quote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '12345',
      },
    });
    findUniqueMock.mockResolvedValue({
      privyUserId: 'privy-user',
      suiAddress: `0x${'0'.repeat(63)}2`,
    });
    getBestSevenKQuoteMock.mockResolvedValue({
      quote: {
        id: 'quote-id',
        provider: 'bluefin7k',
        amountIn: '1000000000',
        amountOut: '2500000',
        simulatedAmountOut: '2600000',
      },
      provider: 'bluefin7k',
      coinTypeIn: normalizeCoinType(SUI_COIN_TYPE),
      coinTypeOut: MAINNET_USDC_TYPE,
      amountIn: '1000000000',
      amountOut: '2600000',
      minAmountOut: '2574000',
      slippageBps: 100,
    });
    stageSwapQuoteMock.mockResolvedValue({
      token: 'swap-token',
      expiresAt: new Date('2026-01-01T00:05:00.000Z'),
    });
  });

  it('rejects swap quotes outside mainnet', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'testnet';

    const res = await POST(new NextRequest('http://localhost/api/v1/swap/quote', {
      method: 'POST',
      body: JSON.stringify({
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        amount: '1000000000',
        senderAddress: '0x2',
      }),
    }));

    expect(res.status).toBe(400);
    expect(getBestSevenKQuoteMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: 'Swap is available on Sui mainnet only.' });
  });

  it('rejects unsupported swap coins and same-token pairs', async () => {
    const unsupported = await POST(new NextRequest('http://localhost/api/v1/swap/quote', {
      method: 'POST',
      body: JSON.stringify({
        coinTypeIn: '0x123::bad::BAD',
        coinTypeOut: MAINNET_USDC_TYPE,
        amount: '1000000000',
        senderAddress: '0x2',
      }),
    }));
    expect(unsupported.status).toBe(400);
    await expect(unsupported.json()).resolves.toEqual({ error: 'Unsupported coin type' });

    const samePair = await POST(new NextRequest('http://localhost/api/v1/swap/quote', {
      method: 'POST',
      body: JSON.stringify({
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: SUI_COIN_TYPE,
        amount: '1000000000',
        senderAddress: '0x2',
      }),
    }));
    expect(samePair.status).toBe(400);
    await expect(samePair.json()).resolves.toEqual({ error: 'Choose two different coins.' });
  });

  it('stores the selected 7K quote and returns normalized review fields', async () => {
    const res = await POST(new NextRequest('http://localhost/api/v1/swap/quote', {
      method: 'POST',
      body: JSON.stringify({
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        amount: '1000000000',
        senderAddress: '0x2',
      }),
    }));

    expect(getBestSevenKQuoteMock).toHaveBeenCalledWith({
      coinTypeIn: normalizeCoinType(SUI_COIN_TYPE),
      coinTypeOut: MAINNET_USDC_TYPE,
      amount: '1000000000',
      senderAddress: `0x${'0'.repeat(63)}2`,
    });
    expect(stageSwapQuoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAddress: `0x${'0'.repeat(63)}2`,
        quote: expect.objectContaining({ id: 'quote-id' }),
      }),
      expect.any(Number),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      swapQuoteToken: 'swap-token',
      provider: 'bluefin7k',
      coinTypeIn: normalizeCoinType(SUI_COIN_TYPE),
      coinTypeOut: MAINNET_USDC_TYPE,
      amountIn: '1000000000',
      amountOut: '2600000',
      minAmountOut: '2574000',
      slippageBps: 100,
      expiresAt: '2026-01-01T00:05:00.000Z',
    });
  });
});
