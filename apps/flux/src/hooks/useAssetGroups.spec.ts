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

  it('merges a coinKey-less symbol group into a uniquely-matching coin group', () => {
    const nativeSui = token(ChainId.SUI, '0x2::sui::SUI', 'SUI', CoinKey.SUI);
    const bridgedSuiOnSolana = {
      ...token(ChainId.SOL, 'solana-sui-mint', 'SUI'),
      coinKey: undefined,
    };

    const groups = buildAssetGroups({
      [ChainId.SUI]: [nativeSui],
      [ChainId.SOL]: [bridgedSuiOnSolana],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe(`coin:${CoinKey.SUI}`);
    const chainIds = groups[0]?.instances.map((i) => i.chainId).sort();
    expect(chainIds).toEqual([ChainId.SUI, ChainId.SOL].sort());
  });

  it('does not merge when multiple coin groups share the same symbol', () => {
    const coinA = token(ChainId.ETH, '0xeth-usdc', 'USDC', CoinKey.USDC);
    // Hypothetical second coin group also reporting symbol "USDC" but with a
    // different coinKey — ambiguous, must NOT collapse the orphan into either.
    const coinB = token(ChainId.ARB, '0xarb-usdc', 'USDC', CoinKey.USDCe);
    const orphan = {
      ...token(ChainId.SOL, 'solana-usdc', 'USDC'),
      coinKey: undefined,
    };

    const groups = buildAssetGroups({
      [ChainId.ETH]: [coinA],
      [ChainId.ARB]: [coinB],
      [ChainId.SOL]: [orphan],
    });

    expect(groups).toHaveLength(3);
    const ids = groups.map((g) => g.id).sort();
    expect(ids).toEqual(
      [`coin:${CoinKey.USDC}`, `coin:${CoinKey.USDCe}`, 'symbol:USDC'].sort(),
    );
  });

  it('keeps wrapped vs native variants separate when symbols differ', () => {
    const usdt = token(ChainId.ETH, '0xeth-usdt', 'USDT', CoinKey.USDT);
    const usdtE = token(ChainId.ARB, '0xarb-usdt-e', 'USDT.e', CoinKey.USDCe);

    const groups = buildAssetGroups({
      [ChainId.ETH]: [usdt],
      [ChainId.ARB]: [usdtE],
    });

    expect(groups).toHaveLength(2);
    const ids = groups.map((g) => g.id).sort();
    expect(ids).toEqual(
      [`coin:${CoinKey.USDT}`, `coin:${CoinKey.USDCe}`].sort(),
    );
  });
});
