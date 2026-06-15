import { ChainId } from '@lifi/sdk';
import { describe, expect, it } from 'vitest';
import type { AssetGroup } from '@/types/assets';
import {
  buildDestinationChainOptions,
  buildQuoteAllowedToChainIds,
  resolveEffectiveDestinationChainId,
  resolveInitialAssetSelection,
  sanitizeDestinationChainOverride,
} from './selection';

const assetGroups: AssetGroup[] = [
  {
    id: 'coin:USDC',
    symbol: 'USDC',
    name: 'USD Coin',
    instances: [
      {
        type: 'base',
        chainId: ChainId.ETH,
        address: '0xeth-usdc',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
      },
      {
        type: 'base',
        chainId: ChainId.ARB,
        address: '0xarb-usdc',
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
      },
    ],
  },
  {
    id: 'coin:ETH',
    symbol: 'ETH',
    name: 'Ether',
    instances: [
      {
        type: 'base',
        chainId: ChainId.ETH,
        address: '0x0000000000000000000000000000000000000000',
        symbol: 'ETH',
        name: 'Ether',
        decimals: 18,
      },
    ],
  },
  {
    id: 'coin:SUI',
    symbol: 'SUI',
    name: 'Sui',
    instances: [
      {
        type: 'base',
        chainId: ChainId.SUI,
        address:
          '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
        symbol: 'SUI',
        name: 'Sui',
        decimals: 9,
      },
      {
        type: 'base',
        chainId: ChainId.SOL,
        address: 'solana-sui-mint',
        symbol: 'SUI',
        name: 'Sui',
        decimals: 9,
      },
    ],
  },
];

describe('resolveInitialAssetSelection', () => {
  it('hydrates from widget config defaults when the URL/store has no selection', () => {
    const selection = resolveInitialAssetSelection(
      assetGroups,
      {},
      { chainId: ChainId.ETH, tokenAddress: '0xeth-usdc' },
    );

    expect(selection?.asset.id).toBe('coin:USDC');
    expect(selection?.chainId).toBe(ChainId.ETH);
  });

  it('keeps URL/store selections ahead of widget config defaults', () => {
    const selection = resolveInitialAssetSelection(
      assetGroups,
      { chainId: ChainId.ARB, tokenAddress: '0xARB-USDC' },
      { chainId: ChainId.ETH, tokenAddress: '0xeth-usdc' },
    );

    expect(selection?.asset.id).toBe('coin:USDC');
    expect(selection?.chainId).toBe(ChainId.ARB);
  });

  it('falls back to config defaults when the URL/store selection is incomplete', () => {
    const selection = resolveInitialAssetSelection(
      assetGroups,
      { chainId: ChainId.ARB },
      { chainId: ChainId.ETH, tokenAddress: '0xeth-usdc' },
    );

    expect(selection?.asset.id).toBe('coin:USDC');
    expect(selection?.chainId).toBe(ChainId.ETH);
  });

  it('hydrates Sui native token query params containing module separators', () => {
    const selection = resolveInitialAssetSelection(
      assetGroups,
      {
        chainId: ChainId.SUI,
        tokenAddress:
          '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
      },
      {},
    );

    expect(selection?.asset.id).toBe('coin:SUI');
    expect(selection?.chainId).toBe(ChainId.SUI);
  });
});

describe('destination chain selection', () => {
  const usdc = assetGroups[0];
  const quote = (chainId: number, netUSD: number) => ({
    toToken: { chainId },
    netUSD,
  });

  it('keeps a valid user destination override ahead of the auto best route', () => {
    expect(
      resolveEffectiveDestinationChainId({
        asset: usdc,
        toChainOverride: ChainId.ARB,
        autoToChainId: ChainId.ETH,
      }),
    ).toBe(ChainId.ARB);
  });

  it('falls back to the auto best destination chain when there is no override', () => {
    expect(
      resolveEffectiveDestinationChainId({
        asset: usdc,
        autoToChainId: ChainId.ARB,
      }),
    ).toBe(ChainId.ARB);
  });

  it('clears a destination override when the selected asset no longer has that chain', () => {
    expect(
      sanitizeDestinationChainOverride({
        asset: usdc,
        toChainOverride: ChainId.SOL,
      }),
    ).toBeUndefined();
  });

  it('keeps a destination override outside receivable wallet types', () => {
    expect(
      sanitizeDestinationChainOverride({
        asset: usdc,
        toChainOverride: ChainId.ARB,
      }),
    ).toBe(ChainId.ARB);
    expect(
      resolveEffectiveDestinationChainId({
        asset: usdc,
        autoAllowedToChainIds: new Set([ChainId.ETH]),
        toChainOverride: ChainId.ARB,
        autoToChainId: ChainId.ETH,
      }),
    ).toBe(ChainId.ARB);
  });

  it('uses receivable chains for auto fallback when there is no manual override', () => {
    expect(
      resolveEffectiveDestinationChainId({
        asset: usdc,
        autoAllowedToChainIds: new Set([ChainId.ETH]),
        autoToChainId: ChainId.ARB,
      }),
    ).toBe(ChainId.ETH);
  });

  it('builds destination chain options from asset instances and route candidates', () => {
    expect(
      buildDestinationChainOptions({
        asset: usdc,
        candidates: [quote(ChainId.ETH, 100), quote(ChainId.ARB, 95)],
      }),
    ).toEqual([
      { chainId: ChainId.ETH, netUSD: 100, isBest: true },
      { chainId: ChainId.ARB, netUSD: 95, isBest: false },
    ]);
  });

  it('uses the best quote per destination chain without receivable filtering', () => {
    expect(
      buildDestinationChainOptions({
        asset: usdc,
        candidates: [
          quote(ChainId.ETH, 100),
          quote(ChainId.ARB, 93),
          quote(ChainId.ARB, 97),
        ],
      }),
    ).toEqual([
      { chainId: ChainId.ETH, netUSD: 100, isBest: true },
      { chainId: ChainId.ARB, netUSD: 97, isBest: false },
    ]);
  });

  it('shows all destination options even when only Sui is receivable', () => {
    const sui = assetGroups[2];

    expect(
      buildDestinationChainOptions({
        asset: sui,
        candidates: [quote(ChainId.SUI, 100)],
      }),
    ).toEqual([
      { chainId: ChainId.SUI, netUSD: 100, isBest: true },
      { chainId: ChainId.SOL, netUSD: undefined, isBest: false },
    ]);
  });

  it('adds the manual override to quote destination ids', () => {
    expect(
      buildQuoteAllowedToChainIds({
        receivableToChainIds: new Set([ChainId.SUI]),
        toChainOverride: ChainId.SOL,
      }),
    ).toEqual(new Set([ChainId.SUI, ChainId.SOL]));
  });

  it('quotes only the manual destination when there is no receivable set yet', () => {
    expect(
      buildQuoteAllowedToChainIds({
        toChainOverride: ChainId.SOL,
      }),
    ).toEqual(new Set([ChainId.SOL]));
  });
});
