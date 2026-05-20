import { ChainId } from '@lifi/sdk';
import { describe, expect, it } from 'vitest';
import type { AssetGroup } from '@/types/assets';
import { resolveInitialAssetSelection } from './selection';

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
