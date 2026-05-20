import { describe, expect, it } from 'vitest';
import type { Route } from '@lifi/sdk';
import { ChainId } from '@lifi/sdk';
import type { AssetGroup } from '@/types/assets';
import {
  buildBestRouteRequestOptions,
  buildCandidatePairs,
  scoreRoute,
  shouldEnableBestRouteFanout,
  toRawFromAmount,
} from './useBestRoute';

const baseToken = (chainId: number, address: string, symbol = 'USDC') => ({
  type: 'base' as const,
  address,
  symbol,
  name: symbol,
  decimals: 6,
  chainId,
});

describe('buildCandidatePairs', () => {
  it('builds the cartesian of allowed-chain instances and sorts same-chain first', () => {
    const usdc: AssetGroup = {
      id: 'coin:USDC',
      symbol: 'USDC',
      name: 'USD Coin',
      instances: [
        baseToken(ChainId.ETH, '0xeth-usdc'),
        baseToken(ChainId.ARB, '0xarb-usdc'),
      ],
    };
    const eth: AssetGroup = {
      id: 'coin:ETH',
      symbol: 'ETH',
      name: 'Ether',
      instances: [
        baseToken(ChainId.ETH, '0x0', 'ETH'),
        baseToken(ChainId.ARB, '0x0', 'ETH'),
      ],
    };

    const pairs = buildCandidatePairs(usdc, eth);

    // 2x2 = 4
    expect(pairs).toHaveLength(4);
    // Same-chain pairs come first.
    expect(pairs[0].fromToken.chainId).toBe(pairs[0].toToken.chainId);
    expect(pairs[1].fromToken.chainId).toBe(pairs[1].toToken.chainId);
  });

  it('drops disallowed chains', () => {
    const usdc: AssetGroup = {
      id: 'coin:USDC',
      symbol: 'USDC',
      name: 'USD Coin',
      instances: [
        baseToken(ChainId.ETH, '0xeth-usdc'),
        baseToken(999_999_999, '0xunsupported-usdc'),
      ],
    };
    const pairs = buildCandidatePairs(usdc, usdc);
    for (const p of pairs) {
      expect(p.fromToken.chainId).not.toBe(999_999_999);
      expect(p.toToken.chainId).not.toBe(999_999_999);
    }
  });
});

describe('scoreRoute', () => {
  it('netUSD = toAmountUSD - gas - fees with no impact penalty when below threshold', () => {
    const route: Partial<Route> = {
      fromAmount: '1000000000', // 1000 USDC (6 decimals)
      fromAmountUSD: '1000',
      toAmount: '999000000',
      toAmountUSD: '999',
      gasCostUSD: '2',
      fromToken: { decimals: 6, priceUSD: '1' } as never,
      toToken: { decimals: 6, priceUSD: '1' } as never,
      steps: [
        {
          estimate: {
            feeCosts: [{ amountUSD: '0.5' }],
          },
        } as never,
      ],
    };
    const { netUSD, priceImpact } = scoreRoute(route as Route);
    // 999 - 2 - 0.5 = 996.5; price impact = (999-1000)/1000 ~ -0.001 (abs 0.001 < 0.005 threshold)
    expect(netUSD).toBeCloseTo(996.5, 2);
    expect(priceImpact).toBeLessThan(0.005);
  });

  it('penalizes high price-impact routes', () => {
    const lowImpact: Partial<Route> = {
      fromAmount: '1000000000',
      fromAmountUSD: '1000',
      toAmount: '998000000',
      toAmountUSD: '998',
      gasCostUSD: '0',
      fromToken: { decimals: 6, priceUSD: '1' } as never,
      toToken: { decimals: 6, priceUSD: '1' } as never,
      steps: [],
    };
    const highImpact: Partial<Route> = {
      fromAmount: '1000000000',
      fromAmountUSD: '1000',
      toAmount: '950000000',
      toAmountUSD: '950',
      gasCostUSD: '0',
      fromToken: { decimals: 6, priceUSD: '1' } as never,
      toToken: { decimals: 6, priceUSD: '1' } as never,
      steps: [],
    };
    const lowScore = scoreRoute(lowImpact as Route);
    const highScore = scoreRoute(highImpact as Route);
    expect(lowScore.netUSD).toBeGreaterThan(highScore.netUSD);
    expect(highScore.priceImpact).toBeGreaterThan(0.005);
  });
});

describe('toRawFromAmount', () => {
  // Regression for the bug where useBestRoute treated the widget's display
  // amount as raw token units, which (a) disabled the fanout entirely for
  // decimal inputs (BigInt('1.5') threw) and (b) caused whole-number inputs
  // like "1" USDC to quote 1 base unit instead of 1_000_000.
  it('converts a decimal USDC display amount to raw 6-decimal units', () => {
    expect(toRawFromAmount('1.5', 6)).toBe('1500000');
  });

  it('converts a whole-number USDC display amount to raw 6-decimal units', () => {
    expect(toRawFromAmount('1', 6)).toBe('1000000');
  });

  it('respects per-pair decimals (e.g. 18-decimal USDT on BSC)', () => {
    expect(toRawFromAmount('1.5', 18)).toBe('1500000000000000000');
  });
});

describe('shouldEnableBestRouteFanout', () => {
  it('keeps the fanout disabled when the executable widget path uses relayer routes', () => {
    expect(
      shouldEnableBestRouteFanout({
        enabled: true,
        useRelayerRoutes: true,
      }),
    ).toBe(false);
  });

  it('keeps explicit disabled state authoritative', () => {
    expect(
      shouldEnableBestRouteFanout({
        enabled: false,
        useRelayerRoutes: false,
      }),
    ).toBe(false);
  });

  it('allows the fanout for ordinary getRoutes mode', () => {
    expect(
      shouldEnableBestRouteFanout({
        enabled: undefined,
        useRelayerRoutes: false,
      }),
    ).toBe(true);
  });
});

describe('buildBestRouteRequestOptions', () => {
  it('mirrors widget constraints and applies the Sui exchange guard per candidate', () => {
    expect(
      buildBestRouteRequestOptions(
        {
          bridges: { allow: ['stargate'] },
          exchanges: { allow: ['hop', 'aftermath'] },
          routeOptions: {
            allowSwitchChain: false,
            maxPriceImpact: 0.4,
          },
          fee: 0.01,
          slippage: 0.005,
          routePriority: 'RECOMMENDED',
        },
        baseToken(ChainId.SUI, '0xsui-usdc'),
        baseToken(ChainId.ETH, '0xeth-usdc'),
      ),
    ).toEqual({
      allowSwitchChain: false,
      maxPriceImpact: 0.4,
      bridges: { allow: ['stargate'] },
      exchanges: {
        allow: ['hop'],
        deny: ['aftermath'],
      },
      fee: 0.01,
      slippage: 0.005,
      order: 'RECOMMENDED',
    });
  });
});
