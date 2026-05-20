import { formatAmount, getExplorerTransactionUrl } from '@/lib/coins';
import { normalizeUsernameInput } from '@/lib/send-form';
import type {
  IncomingPaymentItem,
  ReceivedBalance,
} from '@/lib/received-dashboard-types';

export type {
  IncomingPaymentItem,
  IncomingPaymentsResponse,
  PublicLookupResponse,
  ReceivedBalance,
  ReceivedDashboardUser,
  ReceivedRecipientSummary,
} from '@/lib/received-dashboard-types';

export function normalizeHandle(value: string) {
  return normalizeUsernameInput(value);
}

export function truncateAddress(address: string | null | undefined) {
  if (!address) {
    return '';
  }

  if (address.length <= 10) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function walletReadyLabel(walletReady: boolean) {
  return walletReady ? 'Ready' : 'Not ready';
}

export function formatPendingBalances(balances: ReceivedBalance[]) {
  if (balances.length === 0) return '0';
  if (balances.length === 1) {
    const [balance] = balances;
    return `${formatAmount(balance.amount, balance.coinType)} ${balance.symbol}`;
  }

  const [primary] = balances;
  return `${formatAmount(primary.amount, primary.coinType)} ${primary.symbol} +${balances.length - 1} more`;
}

export function receivedPaymentDisplay(item: IncomingPaymentItem) {
  return `${formatAmount(item.amount, item.coinType)} ${item.symbol}`;
}

export function getIncomingPaymentSenderDisplay(item: IncomingPaymentItem) {
  if (item.sender) {
    return {
      label: `@${item.sender.username}`,
      subLabel: 'X sender',
      avatarUrl: item.sender.profilePicture,
    };
  }

  return {
    label: truncateAddress(item.senderAddress),
    subLabel: 'Sender wallet',
    avatarUrl: null,
  };
}

export function explorerUrl(network: string, txDigest: string) {
  return getExplorerTransactionUrl(network, txDigest);
}

export function untrackedBalanceNote(
  pendingBalances: ReceivedBalance[],
  recordedTotals: ReceivedBalance[],
): string | null {
  const recordedMap = new Map(
    recordedTotals.map((row) => [row.coinType, BigInt(row.amount)]),
  );

  const parts: string[] = [];
  for (const balance of pendingBalances) {
    const onChain = BigInt(balance.amount);
    const recorded = recordedMap.get(balance.coinType) ?? 0n;
    if (onChain > recorded) {
      const gap = onChain - recorded;
      parts.push(
        `${formatAmount(gap.toString(), balance.coinType)} ${balance.symbol}`,
      );
    }
  }

  if (parts.length === 0) {
    return null;
  }

  return `Includes ${parts.join(', ')} not yet reflected in indexed history`;
}
