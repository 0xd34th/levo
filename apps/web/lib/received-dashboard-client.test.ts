import { describe, expect, it } from 'vitest';
import {
  getIncomingPaymentSenderDisplay,
  truncateAddress,
  untrackedBalanceNote,
} from './received-dashboard-client';

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
      ),
    ).toBe('Includes 0.5 SUI not yet reflected in indexed history');
  });

  it('suppresses the note when indexed totals already match on-chain balances', () => {
    expect(
      untrackedBalanceNote(
        pendingBalances,
        [
          {
            coinType: '0x2::sui::SUI',
            symbol: 'SUI',
            decimals: 9,
            amount: '1500000000',
          },
        ],
      ),
    ).toBeNull();
  });
});

describe('getIncomingPaymentSenderDisplay', () => {
  it('prefers the mapped sender username when available', () => {
    expect(
      getIncomingPaymentSenderDisplay({
        id: 'payment-1',
        txDigest: 'digest-1',
        senderAddress: '0x1234567890abcdef1234567890abcdef',
        sender: {
          username: 'alice',
          profilePicture: 'https://pbs.twimg.com/profile_images/alice.jpg',
        },
        coinType: '0x2::sui::SUI',
        symbol: 'SUI',
        decimals: 9,
        amount: '1',
        createdAt: '2026-04-07T00:00:00.000Z',
      }),
    ).toEqual({
      label: '@alice',
      subLabel: 'X sender',
      avatarUrl: 'https://pbs.twimg.com/profile_images/alice.jpg',
    });
  });

  it('falls back to the sender wallet address when no mapped sender exists', () => {
    expect(
      getIncomingPaymentSenderDisplay({
        id: 'payment-2',
        txDigest: 'digest-2',
        senderAddress: '0x1234567890abcdef1234567890abcdef',
        sender: null,
        coinType: '0x2::sui::SUI',
        symbol: 'SUI',
        decimals: 9,
        amount: '1',
        createdAt: '2026-04-07T00:00:00.000Z',
      }),
    ).toEqual({
      label: '0x1234...cdef',
      subLabel: 'Sender wallet',
      avatarUrl: null,
    });
  });
});
