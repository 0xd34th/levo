import { describe, expect, it } from 'vitest';
import { MAINNET_USDC_TYPE, SUI_COIN_TYPE } from './coins';
import { buildRecentActivityItems } from './recent-activity';
import type { IncomingPaymentItem } from './received-dashboard-types';
import type { TransactionItem } from './transaction-history';

describe('buildRecentActivityItems', () => {
  it('merges sent and received payments into one reverse-chronological feed', () => {
    const sentItems: TransactionItem[] = [
      {
        id: 'sent-newest',
        txDigest: 'sent-newest-digest',
        coinType: MAINNET_USDC_TYPE,
        amount: '250000',
        createdAt: '2026-04-06T11:00:00.000Z',
        recipient: {
          username: 'alice',
          profilePicture: 'https://pbs.twimg.com/profile_images/alice.jpg',
        },
      },
      {
        id: 'sent-oldest',
        txDigest: 'sent-oldest-digest',
        coinType: SUI_COIN_TYPE,
        amount: '1000000000',
        createdAt: '2026-04-06T09:00:00.000Z',
        recipient: {
          username: 'carol',
          profilePicture: null,
        },
      },
    ];

    const receivedItems: IncomingPaymentItem[] = [
      {
        id: 'received-middle',
        txDigest: 'received-middle-digest',
        senderAddress: '0x1234567890abcdef1234567890abcdef',
        sender: {
          username: 'bob',
          profilePicture: 'https://pbs.twimg.com/profile_images/bob.jpg',
        },
        coinType: MAINNET_USDC_TYPE,
        symbol: 'USDC',
        decimals: 6,
        amount: '500000',
        createdAt: '2026-04-06T10:00:00.000Z',
      },
    ];

    expect(buildRecentActivityItems(sentItems, receivedItems, 5)).toEqual([
      {
        id: 'sent-newest',
        txDigest: 'sent-newest-digest',
        createdAt: '2026-04-06T11:00:00.000Z',
        amount: '0.25 USDC',
        direction: 'Sent',
        counterpartyLabel: '@alice',
        counterpartySubLabel: 'Recipient',
        counterpartyAvatarUrl: 'https://pbs.twimg.com/profile_images/alice.jpg',
      },
      {
        id: 'received-middle',
        txDigest: 'received-middle-digest',
        createdAt: '2026-04-06T10:00:00.000Z',
        amount: '0.5 USDC',
        direction: 'Received',
        counterpartyLabel: '@bob',
        counterpartySubLabel: 'X sender',
        counterpartyAvatarUrl: 'https://pbs.twimg.com/profile_images/bob.jpg',
      },
      {
        id: 'sent-oldest',
        txDigest: 'sent-oldest-digest',
        createdAt: '2026-04-06T09:00:00.000Z',
        amount: '1 SUI',
        direction: 'Sent',
        counterpartyLabel: '@carol',
        counterpartySubLabel: 'Recipient',
        counterpartyAvatarUrl: null,
      },
    ]);
  });

  it('enforces the requested limit after merging both streams', () => {
    const sentItems: TransactionItem[] = Array.from({ length: 4 }, (_, index) => ({
      id: `sent-${index}`,
      txDigest: `sent-digest-${index}`,
      coinType: MAINNET_USDC_TYPE,
      amount: '1000000',
      createdAt: `2026-04-06T0${index}:00:00.000Z`,
      recipient: {
        username: `sent${index}`,
        profilePicture: null,
      },
    }));
    const receivedItems: IncomingPaymentItem[] = Array.from({ length: 4 }, (_, index) => ({
      id: `received-${index}`,
      txDigest: `received-digest-${index}`,
      senderAddress: `0x1234567890abcdef1234567890abcde${index}`,
      sender: null,
      coinType: MAINNET_USDC_TYPE,
      symbol: 'USDC',
      decimals: 6,
      amount: '1000000',
      createdAt: `2026-04-06T1${index}:00:00.000Z`,
    }));

    const items = buildRecentActivityItems(sentItems, receivedItems, 5);

    expect(items).toHaveLength(5);
    expect(items.map((item) => item.id)).toEqual([
      'received-3',
      'received-2',
      'received-1',
      'received-0',
      'sent-3',
    ]);
  });
});
