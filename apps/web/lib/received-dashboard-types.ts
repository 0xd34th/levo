export const RECEIVED_CLAIM_STATUS_MODEL = 'vault_object_exists';

export type ReceivedClaimStatus = 'UNCLAIMED' | 'CLAIMED' | 'PREVIOUSLY_CLAIMED';

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
  coinType: string;
  symbol: string;
  decimals: number;
  amount: string;
  createdAt: string;
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
  claimStatusModel: typeof RECEIVED_CLAIM_STATUS_MODEL;
  pendingBalances: ReceivedBalance[];
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
