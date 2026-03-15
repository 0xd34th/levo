import { formatAmount, getExplorerTransactionUrl } from '@/lib/coins';
import { normalizeUsernameInput } from '@/lib/send-form';
import type {
  IncomingPaymentItem,
  ReceivedBalance,
  ReceivedClaimStatus,
} from '@/lib/received-dashboard-types';

export type {
  IncomingPaymentItem,
  IncomingPaymentsResponse,
  PublicLookupResponse,
  ReceivedBalance,
  ReceivedClaimStatus,
  ReceivedDashboardUser,
  ReceivedVaultSummary,
} from '@/lib/received-dashboard-types';

export function normalizeHandle(value: string) {
  return normalizeUsernameInput(value);
}

export function truncateAddress(address: string | null | undefined) {
  if (!address) {
    return '';
  }

  if (address.length <= 14) {
    return address;
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

export function claimStatusLabel(status: ReceivedClaimStatus) {
  if (status === 'CLAIMED') {
    return 'Claimed';
  }

  if (status === 'PREVIOUSLY_CLAIMED') {
    return 'Previously claimed';
  }

  return 'Unclaimed';
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

export function explorerUrl(network: string, txDigest: string) {
  return getExplorerTransactionUrl(network, txDigest);
}
