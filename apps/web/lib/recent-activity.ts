import type { WalletActivityItem } from '@/lib/wallet-activity';

export interface RecentActivityItem {
  id: string;
  txDigest: string;
  createdAt: string;
  amount: string;
  direction: 'Sent' | 'Received' | 'Mixed';
  counterpartyLabel: string;
  counterpartySubLabel: string;
  counterpartyAvatarUrl: string | null;
}

export function buildRecentActivityItems(
  activityItems: WalletActivityItem[],
  limit: number,
): RecentActivityItem[] {
  return [...activityItems]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      txDigest: item.txDigest,
      createdAt: item.createdAt,
      amount: item.amountLabel,
      direction:
        item.direction === 'incoming'
          ? 'Received'
          : item.direction === 'outgoing'
            ? 'Sent'
            : 'Mixed',
      counterpartyLabel: item.counterpartyLabel,
      counterpartySubLabel: item.counterpartySubLabel,
      counterpartyAvatarUrl: item.counterpartyAvatarUrl,
    }));
}
