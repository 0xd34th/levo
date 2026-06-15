import { ChainId } from '@lifi/sdk';
import { describe, expect, it } from 'vitest';
import type { AssetGroup } from '@/types/assets';
import {
  buildDestinationChainOptions,
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

  it('clears a destination override when allowed destination constraints exclude it', () => {
    expect(
      sanitizeDestinationChainOverride({
        asset: usdc,
        toChainOverride: ChainId.ARB,
        allowedToChainIds: new Set([ChainId.ETH]),
      }),
    ).toBeUndefined();
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

  it('uses the best quote per destination chain and filters disallowed destinations', () => {
    expect(
      buildDestinationChainOptions({
        asset: usdc,
        allowedToChainIds: new Set([ChainId.ARB]),
        candidates: [
          quote(ChainId.ETH, 100),
          quote(ChainId.ARB, 93),
          quote(ChainId.ARB, 97),
        ],
      }),
    ).toEqual([{ chainId: ChainId.ARB, netUSD: 97, isBest: true }]);
  });
});
