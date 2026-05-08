import { describe, expect, it } from 'vitest';
import { CoinKey } from '@lifi/sdk';
import { groupKeyFor } from './useAssetGroups';

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
