'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  formatAmount,
  getCoinLabel,
  getExplorerTransactionUrl,
  isDisplaySupportedCoinType,
} from '@/lib/coins';
import { isTrustedProfilePictureUrl, type TransactionRecipient } from '@/lib/transaction-history';

interface TransactionRowProps {
  txDigest: string;
  coinType: string;
  amount: string;
  createdAt: string;
  recipient: TransactionRecipient;
  network: string;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function TransactionRow({
  txDigest,
  coinType,
  amount,
  createdAt,
  recipient,
  network,
}: TransactionRowProps) {
  const profilePicture =
    recipient.profilePicture && isTrustedProfilePictureUrl(recipient.profilePicture)
      ? recipient.profilePicture
      : null;
  const coinDisplay = isDisplaySupportedCoinType(coinType)
    ? `${formatAmount(amount, coinType)} ${getCoinLabel(coinType)}`
    : 'Unsupported asset';

  const explorerUrl = getExplorerTransactionUrl(network, txDigest);

  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-b-0">
      <Avatar className="size-9">
        {profilePicture ? (
          <AvatarImage
            alt={`@${recipient.username}`}
            sizes="36px"
            src={profilePicture}
          />
        ) : null}
        <AvatarFallback className="text-sm text-muted-foreground">
          {recipient.username[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">@{recipient.username}</p>
        <p className="text-xs text-muted-foreground">
          {dateFormatter.format(new Date(createdAt))}
        </p>
      </div>
      <div className="flex items-center gap-2 text-right">
        <span className="text-sm font-medium">{coinDisplay}</span>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View on explorer"
            className="text-muted-foreground hover:text-foreground"
            title="View on explorer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}
