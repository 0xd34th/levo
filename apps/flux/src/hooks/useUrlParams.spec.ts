import { ChainId } from '@lifi/sdk';
import { describe, expect, it } from 'vitest';
import { parseChainTokenUrlParams } from './useUrlParams';

const SUI_NATIVE =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

describe('parseChainTokenUrlParams', () => {
  it('preserves Sui native token addresses with module separators', () => {
    expect(
      parseChainTokenUrlParams(
        `?fromChain=${ChainId.SUI}&fromToken=${SUI_NATIVE}&toChain=${ChainId.SOL}&toToken=${SOLANA_USDC}`,
      ),
    ).toEqual({
      sourceChainToken: {
        chainId: ChainId.SUI,
        token: SUI_NATIVE,
      },
      destinationChainToken: {
        chainId: ChainId.SOL,
        token: SOLANA_USDC,
      },
      toAddress: undefined,
      fromAmount: undefined,
    });
  });
});
