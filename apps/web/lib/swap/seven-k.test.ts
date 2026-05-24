import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAINNET_USDC_TYPE, SUI_COIN_TYPE } from '@/lib/coins';

const { quoteMock } = vi.hoisted(() => ({
  quoteMock: vi.fn(),
}));

vi.mock('@7kprotocol/sdk-ts', () => ({
  MetaAg: vi.fn(function MetaAg() {
    return {
      quote: quoteMock,
    };
  }),
}));

import { getBestSevenKQuote } from './seven-k';

describe('getBestSevenKQuote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    quoteMock.mockReset();
  });

  it('requests a non-simulated quote so simulation failures do not hide valid routes', async () => {
    quoteMock.mockResolvedValueOnce([
      {
        id: 'quote-1',
        provider: 'flowx',
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        amountIn: '1000000000',
        amountOut: '2500000',
      },
    ]);

    await expect(getBestSevenKQuote({
      coinTypeIn: SUI_COIN_TYPE,
      coinTypeOut: MAINNET_USDC_TYPE,
      amount: '1000000000',
      senderAddress: '0xsender',
    })).resolves.toMatchObject({
      provider: 'flowx',
      amountOut: '2500000',
      minAmountOut: '2475000',
    });

    expect(quoteMock).toHaveBeenCalledOnce();
    expect(quoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amountIn: '1000000000',
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        signer: '0xsender',
        timeout: 7_000,
      }),
    );
  });

  it('selects the best quote by simulated output when simulation succeeds', async () => {
    quoteMock.mockResolvedValueOnce([
      {
        id: 'quote-1',
        provider: 'flowx',
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        amountIn: '1000000000',
        amountOut: '2600000',
        simulatedAmountOut: '2400000',
      },
      {
        id: 'quote-2',
        provider: 'cetus',
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        amountIn: '1000000000',
        amountOut: '2500000',
        simulatedAmountOut: '2700000',
      },
    ]);

    await expect(getBestSevenKQuote({
      coinTypeIn: SUI_COIN_TYPE,
      coinTypeOut: MAINNET_USDC_TYPE,
      amount: '1000000000',
      senderAddress: '0xsender',
    })).resolves.toMatchObject({
      provider: 'cetus',
      amountOut: '2700000',
      minAmountOut: '2673000',
    });

    expect(quoteMock).toHaveBeenCalledOnce();
  });
});
