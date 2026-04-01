import { describe, expect, it } from 'vitest';
import { truncateAddress, untrackedBalanceNote } from './received-dashboard-client';

describe('truncateAddress', () => {
  it('returns an empty string for missing addresses', () => {
    expect(truncateAddress(null)).toBe('');
    expect(truncateAddress(undefined)).toBe('');
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('0x12345678')).toBe('0x12345678');
  });

  it('truncates long addresses to the expected prefix and suffix', () => {
    expect(truncateAddress('0x1234567890abcdef1234567890abcdef')).toBe('0x1234...cdef');
  });
});

describe('untrackedBalanceNote', () => {
  const pendingBalances = [
    {
      coinType: '0x2::sui::SUI',
      symbol: 'SUI',
      decimals: 9,
      amount: '1500000000',
    },
  ];

  it('reports the delta for unclaimed vaults', () => {
    expect(
      untrackedBalanceNote(
        pendingBalances,
        [
          {
            coinType: '0x2::sui::SUI',
            symbol: 'SUI',
            decimals: 9,
            amount: '1000000000',
          },
        ],
        'UNCLAIMED',
      ),
    ).toBe('Includes 0.5 SUI from direct transfers');
  });

  it('suppresses the note once the vault has been claimed', () => {
    expect(
      untrackedBalanceNote(
        pendingBalances,
        [
          {
            coinType: '0x2::sui::SUI',
            symbol: 'SUI',
            decimals: 9,
            amount: '1000000000',
          },
        ],
        'CLAIMED',
      ),
    ).toBeNull();
  });
});
