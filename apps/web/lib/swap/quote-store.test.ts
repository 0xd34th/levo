import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
