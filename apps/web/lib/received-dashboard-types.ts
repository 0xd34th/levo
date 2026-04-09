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

export interface ReceivedRecipientSummary {
  derivationVersion: number;
  recipientAddress: string | null;
  walletReady: boolean;
  pendingBalances: ReceivedBalance[];
  recordedTotals: ReceivedBalance[];
}

export interface PublicLookupResponse
  extends ReceivedDashboardUser, ReceivedRecipientSummary {
  recentIncomingPayments: IncomingPaymentItem[];
}

export interface IncomingPaymentsResponse
  extends ReceivedDashboardUser, ReceivedRecipientSummary {
  items: IncomingPaymentItem[];
  nextCursor: string | null;
}
