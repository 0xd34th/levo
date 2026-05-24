import { beforeEach, describe, expect, it, vi } from 'vitest';
import BN from 'bn.js';

const {
  redisStore,
  redisDelMock,
  redisGetMock,
  redisSetMock,
} = vi.hoisted(() => {
  const redisStore = new Map<string, string>();
  return {
    redisStore,
    redisDelMock: vi.fn(async (key: string) => {
      redisStore.delete(key);
    }),
    redisGetMock: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    redisSetMock: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
    }),
  };
});

vi.mock('@/lib/rate-limit', () => ({
  getRedis: () => ({
    status: 'ready',
    set: redisSetMock,
    get: redisGetMock,
    del: redisDelMock,
  }),
}));

import {
  loadSwapQuote,
  stageSwapQuote,
} from './quote-store';

describe('swap quote store', () => {
  beforeEach(() => {
    redisStore.clear();
    vi.clearAllMocks();
  });

  it('preserves Map values inside staged 7K quotes stored in Redis', async () => {
    const packages = new Map([
      ['aggregator_v3', '0xpackage'],
      ['aggregator_v2', '0xlegacy'],
    ]);

    const { token } = await stageSwapQuote({
      senderAddress: '0xsender',
      coinTypeIn: '0x2::sui::SUI',
      coinTypeOut: '0xusdc::usdc::USDC',
      amountIn: '1000000000',
      amountOut: '2500000',
      minAmountOut: '2475000',
      slippageBps: 100,
      provider: 'cetus',
      quote: {
        provider: 'cetus',
        quote: {
          packages,
        },
      },
    }, 90);

    const loaded = await loadSwapQuote(token);
    const quote = loaded?.quote as { quote?: { packages?: unknown } } | undefined;

    expect(quote?.quote?.packages).toBeInstanceOf(Map);
    expect((quote?.quote?.packages as Map<string, string>).get('aggregator_v3')).toBe('0xpackage');
    expect(redisSetMock).toHaveBeenCalledWith(
      `swap-quote:${token}`,
      expect.stringContaining('__levoJsonMap'),
      'EX',
      90,
    );
  });

  it('preserves BN values inside staged 7K quotes stored in Redis', async () => {
    const amountIn = new BN('10000', 10);
    const amountOut = new BN('9715559', 10);

    const { token } = await stageSwapQuote({
      senderAddress: '0xsender',
      coinTypeIn: '0xusdc::usdc::USDC',
      coinTypeOut: '0x2::sui::SUI',
      amountIn: '10000',
      amountOut: '9715559',
      minAmountOut: '9618403',
      slippageBps: 100,
      provider: 'cetus',
      quote: {
        provider: 'cetus',
        quote: {
          amountIn,
          amountOut,
          paths: [{ amountIn, amountOut }],
        },
      },
    }, 90);

    const loaded = await loadSwapQuote(token);
    const quote = loaded?.quote as {
      quote?: {
        amountIn?: unknown;
        amountOut?: unknown;
        paths?: Array<{ amountIn?: unknown; amountOut?: unknown }>;
      };
    } | undefined;
    const loadedAmountOut = quote?.quote?.amountOut as BN | undefined;

    expect(BN.isBN(quote?.quote?.amountIn)).toBe(true);
    expect(BN.isBN(loadedAmountOut)).toBe(true);
    expect(loadedAmountOut?.mul(new BN(2)).toString(10)).toBe('19431118');
    expect(BN.isBN(quote?.quote?.paths?.[0]?.amountIn)).toBe(true);
    expect(redisSetMock).toHaveBeenCalledWith(
      `swap-quote:${token}`,
      expect.stringContaining('__levoJsonBn'),
      'EX',
      90,
    );
  });
});
