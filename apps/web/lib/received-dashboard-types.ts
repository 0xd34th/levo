export const RECEIVED_CLAIM_STATUS_MODEL = 'vault_owner_balance_v2';

export type ReceivedClaimStatus =
  | 'UNCLAIMED'
  | 'CLAIMED'
  | 'PREVIOUSLY_CLAIMED'
  | 'REPAIR_REQUIRED';

export type ReceivedClaimAction = 'NONE' | 'CLAIM' | 'WITHDRAW' | 'REPAIR_AND_WITHDRAW';

export interface ReceivedBalance {
  coinType: string;
  symbol: string;
  decimals: number;
  amount: string;
}

export interface IncomingPaymentItem {
  id: string;
  txDigest: string;
  senderAddress: string;
  sender: IncomingPaymentSender | null;
  coinType: string;
  symbol: string;
  decimals: number;
  amount: string;
  createdAt: string;
}

export interface IncomingPaymentSender {
  username: string;
  profilePicture: string | null;
}

export interface ReceivedDashboardUser {
  xUserId: string;
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
}

export interface ReceivedVaultSummary {
  derivationVersion: number;
  vaultAddress: string;
  vaultExists: boolean;
  claimStatus: ReceivedClaimStatus;
  claimAction: ReceivedClaimAction;
  claimStatusModel: typeof RECEIVED_CLAIM_STATUS_MODEL;
  pendingBalances: ReceivedBalance[];
  recordedTotals: ReceivedBalance[];
}

export interface PublicLookupResponse
  extends ReceivedDashboardUser, ReceivedVaultSummary {
  recentIncomingPayments: IncomingPaymentItem[];
}

export interface IncomingPaymentsResponse
  extends ReceivedDashboardUser, ReceivedVaultSummary {
  items: IncomingPaymentItem[];
  nextCursor: string | null;
}
