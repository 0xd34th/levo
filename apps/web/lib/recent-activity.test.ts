import { describe, expect, it } from 'vitest';
import { MAINNET_USDC_TYPE } from './coins';
import { buildRecentActivityItems } from './recent-activity';
import type { WalletActivityItem } from './wallet-activity';

describe('buildRecentActivityItems', () => {
  it('converts wallet activity into one reverse-chronological recent feed', () => {
    const activityItems: WalletActivityItem[] = [
      {
        id: 'sent-newest',
        txDigest: 'sent-newest-digest',
        direction: 'outgoing',
        coinType: MAINNET_USDC_TYPE,
        amount: '250000',
        amountLabel: '0.25 USDC',
        createdAt: '2026-04-06T11:00:00.000Z',
        counterpartyLabel: '@alice',
        counterpartySubLabel: 'X recipient',
        counterpartyAvatarUrl: 'https://pbs.twimg.com/profile_images/alice.jpg',
      },
      {
        id: 'received-middle',
        txDigest: 'received-middle-digest',
        direction: 'incoming',
        coinType: MAINNET_USDC_TYPE,
        amount: '500000',
        amountLabel: '0.50 USDC',
        createdAt: '2026-04-06T10:00:00.000Z',
        counterpartyLabel: '@bob',
        counterpartySubLabel: 'X sender',
        counterpartyAvatarUrl: 'https://pbs.twimg.com/profile_images/bob.jpg',
      },
      {
        id: 'mixed-oldest',
        txDigest: 'mixed-oldest-digest',
        direction: 'mixed',
        coinType: MAINNET_USDC_TYPE,
        amount: '0',
        amountLabel: 'Mixed USDC',
        createdAt: '2026-04-06T09:00:00.000Z',
        counterpartyLabel: 'Self / contract',
        counterpartySubLabel: 'Wallet activity',
        counterpartyAvatarUrl: null,
      },
    ];

    expect(buildRecentActivityItems(activityItems, 5)).toEqual([
      {
        id: 'sent-newest',
        txDigest: 'sent-newest-digest',
        createdAt: '2026-04-06T11:00:00.000Z',
        amount: '0.25 USDC',
        direction: 'Sent',
        counterpartyLabel: '@alice',
        counterpartySubLabel: 'X recipient',
        counterpartyAvatarUrl: 'https://pbs.twimg.com/profile_images/alice.jpg',
      },
      {
        id: 'received-middle',
        txDigest: 'received-middle-digest',
        createdAt: '2026-04-06T10:00:00.000Z',
        amount: '0.50 USDC',
        direction: 'Received',
        counterpartyLabel: '@bob',
        counterpartySubLabel: 'X sender',
        counterpartyAvatarUrl: 'https://pbs.twimg.com/profile_images/bob.jpg',
      },
      {
        id: 'mixed-oldest',
        txDigest: 'mixed-oldest-digest',
        createdAt: '2026-04-06T09:00:00.000Z',
        amount: 'Mixed USDC',
        direction: 'Mixed',
        counterpartyLabel: 'Self / contract',
        counterpartySubLabel: 'Wallet activity',
        counterpartyAvatarUrl: null,
      },
    ]);
  });

  it('enforces the requested limit after merging both streams', () => {
    const activityItems: WalletActivityItem[] = Array.from({ length: 8 }, (_, index) => ({
      id: `activity-${index}`,
      txDigest: `activity-digest-${index}`,
      direction: index % 2 === 0 ? 'incoming' : 'outgoing',
      coinType: MAINNET_USDC_TYPE,
      amount: '1000000',
      amountLabel: '1.00 USDC',
      createdAt: `2026-04-06T0${index}:00:00.000Z`,
      counterpartyLabel: `counterparty-${index}`,
      counterpartySubLabel: 'Wallet activity',
      counterpartyAvatarUrl: null,
    }));

    const items = buildRecentActivityItems(activityItems, 5);

    expect(items).toHaveLength(5);
    expect(items.map((item) => item.id)).toEqual([
      'activity-7',
      'activity-6',
      'activity-5',
      'activity-4',
      'activity-3',
    ]);
  });
});
