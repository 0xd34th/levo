import { describe, expect, it } from 'vitest';
import { CoinKey } from '@lifi/sdk';
import { ChainId } from '@lifi/widget';
import { buildAssetGroups, groupKeyFor } from './useAssetGroups';

describe('groupKeyFor', () => {
  it('uses coinKey when present', () => {
    expect(groupKeyFor({ coinKey: CoinKey.USDC, symbol: 'USDC' })).toBe(
      `coin:${CoinKey.USDC}`,
    );
  });

  it('falls back to upper-cased symbol when coinKey missing', () => {
    expect(groupKeyFor({ symbol: 'usdc' } as never)).toBe('symbol:USDC');
    expect(groupKeyFor({ symbol: 'USDC' } as never)).toBe('symbol:USDC');
  });

  it('keeps wrapped vs native variants in separate groups via coinKey', () => {
    const eth = groupKeyFor({ coinKey: CoinKey.ETH, symbol: 'ETH' });
    const weth = groupKeyFor({ coinKey: CoinKey.WETH, symbol: 'WETH' });
    expect(eth).not.toBe(weth);
  });
});

const token = (
  chainId: number,
  address: string,
  symbol = 'USDC',
  coinKey = CoinKey.USDC,
) => ({
  address,
  chainId,
  coinKey,
  decimals: 6,
  logoURI: `https://example.com/${symbol}.png`,
  name: symbol,
  priceUSD: '1',
  symbol,
});

describe('buildAssetGroups', () => {
  it('applies source and destination chain allowlists independently', () => {
    const tokens = {
      [ChainId.ETH]: [token(ChainId.ETH, '0xeth-usdc')],
      [ChainId.ARB]: [token(ChainId.ARB, '0xarb-usdc')],
      [ChainId.SUI]: [token(ChainId.SUI, '0xsui-usdc')],
    };

    const sourceGroups = buildAssetGroups(tokens, {
      chains: {
        from: { allow: [ChainId.ETH] },
        to: { allow: [ChainId.SUI] },
      },
      formType: 'from',
    });
    const destinationGroups = buildAssetGroups(tokens, {
      chains: {
        from: { allow: [ChainId.ETH] },
        to: { allow: [ChainId.SUI] },
      },
      formType: 'to',
    });

    expect(sourceGroups).toHaveLength(1);
    expect(sourceGroups[0]?.instances.map((instance) => instance.chainId)).toEqual([
      ChainId.ETH,
    ]);
    expect(destinationGroups).toHaveLength(1);
    expect(
      destinationGroups[0]?.instances.map((instance) => instance.chainId),
    ).toEqual([ChainId.SUI]);
  });

  it('applies form-specific token allowlists on the matching chain', () => {
    const usdc = token(ChainId.ETH, '0xeth-usdc', 'USDC', CoinKey.USDC);
    const usdt = token(ChainId.ETH, '0xeth-usdt', 'USDT', CoinKey.USDT);

    const groups = buildAssetGroups(
      {
        [ChainId.ETH]: [usdc, usdt],
      },
      {
        formType: 'to',
        tokens: {
          to: { allow: [usdc] },
        },
      },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.symbol).toBe('USDC');
    expect(groups[0]?.instances).toHaveLength(1);
    expect(groups[0]?.instances[0]?.address).toBe('0xeth-usdc');
  });
});
