import { ChainId } from '@lifi/widget';
import { describe, expect, it } from 'vitest';
import { applySuiExchangeGuards, isSuiRoute } from './exchangeGuards';

describe('exchangeGuards', () => {
  it('detects when a widget form targets Sui', () => {
    expect(
      isSuiRoute({
        sourceChain: { chainId: String(ChainId.SUI), chainKey: 'SUI' },
      }),
    ).toBe(true);
    expect(
      isSuiRoute({
        destinationChain: { chainId: String(ChainId.SUI), chainKey: 'SUI' },
      }),
    ).toBe(true);
    expect(
      isSuiRoute({
        sourceChain: { chainId: '1', chainKey: 'ETH' },
        destinationChain: { chainId: '10', chainKey: 'OPT' },
      }),
    ).toBe(false);
  });

  it('adds an aftermath deny guard for Sui routes without other exchange config', () => {
    expect(
      applySuiExchangeGuards(undefined, {
        sourceChain: { chainId: String(ChainId.SUI), chainKey: 'SUI' },
      }),
    ).toEqual({
      deny: ['aftermath'],
    });
  });

  it('removes aftermath from allow lists while preserving other exchange guards', () => {
    expect(
      applySuiExchangeGuards(
        {
          allow: ['aftermath', 'cetus', 'bluefin7k'],
          deny: ['foo'],
        },
        {
          destinationChain: { chainId: String(ChainId.SUI), chainKey: 'SUI' },
        },
      ),
    ).toEqual({
      allow: ['cetus', 'bluefin7k'],
      deny: ['foo', 'aftermath'],
    });
  });

  it('leaves non-Sui exchange config unchanged', () => {
    const exchanges = {
      allow: ['cetus'],
      deny: ['foo'],
    };

    expect(
      applySuiExchangeGuards(exchanges, {
        sourceChain: { chainId: '1', chainKey: 'ETH' },
        destinationChain: { chainId: '10', chainKey: 'OPT' },
      }),
    ).toBe(exchanges);
  });
});
