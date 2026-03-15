export interface TransactionRecipient {
  username: string;
  profilePicture: string | null;
}

export interface TransactionItem {
  id: string;
  txDigest: string;
  coinType: string;
  amount: string;
  createdAt: string;
  recipient: TransactionRecipient;
}

export interface TransactionHistoryResponse {
  items: TransactionItem[];
  nextCursor: string | null;
}

export function isTrustedProfilePictureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.twimg.com');
  } catch {
    return false;
  }
}
