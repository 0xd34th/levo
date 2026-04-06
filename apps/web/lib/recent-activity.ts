import {
  formatAmount,
  getCoinLabel,
  isDisplaySupportedCoinType,
} from '@/lib/coins';
import {
  receivedPaymentDisplay,
  truncateAddress,
  type IncomingPaymentItem,
} from '@/lib/received-dashboard-client';
import type { TransactionItem } from '@/lib/transaction-history';

export interface RecentActivityItem {
  id: string;
  txDigest: string;
  createdAt: string;
  amount: string;
  direction: 'Sent' | 'Received';
  counterpartyLabel: string;
  counterpartySubLabel: string;
  counterpartyAvatarUrl: string | null;
}

function formatSentAmount(amount: string, coinType: string) {
  if (!isDisplaySupportedCoinType(coinType)) {
    return `${amount} raw`;
  }

  return `${formatAmount(amount, coinType)} ${getCoinLabel(coinType)}`;
}

export function buildRecentActivityItems(
  sentItems: TransactionItem[],
  receivedItems: IncomingPaymentItem[],
  limit: number,
): RecentActivityItem[] {
  const sent = sentItems.map((item) => ({
    id: item.id,
    txDigest: item.txDigest,
    createdAt: item.createdAt,
    amount: formatSentAmount(item.amount, item.coinType),
    direction: 'Sent' as const,
    counterpartyLabel: `@${item.recipient.username}`,
    counterpartySubLabel: 'Recipient',
    counterpartyAvatarUrl: item.recipient.profilePicture,
  }));

  const received = receivedItems.map((item) => ({
    id: item.id,
    txDigest: item.txDigest,
    createdAt: item.createdAt,
    amount: receivedPaymentDisplay(item),
    direction: 'Received' as const,
    counterpartyLabel: truncateAddress(item.senderAddress),
    counterpartySubLabel: 'Sender wallet',
    counterpartyAvatarUrl: null,
  }));

  return [...sent, ...received]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, limit);
}
