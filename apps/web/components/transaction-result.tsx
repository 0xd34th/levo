'use client';

import Link from 'next/link';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCoinLabel, getExplorerTransactionUrl, isDisplaySupportedCoinType } from '@/lib/coins';

export interface TransactionResultData {
  // The send form passes a display-ready amount string, not raw base units.
  amount: string;
  coinType: string;
  username: string;
  txDigest: string;
  recipientType?: 'X_HANDLE' | 'SUI_ADDRESS';
}

interface TransactionResultProps {
  data: TransactionResultData | null;
  network: string;
  onReset: () => void;
}

export function TransactionResult({ data, network, onReset }: TransactionResultProps) {
  if (!data) return null;

  const explorerUrl = getExplorerTransactionUrl(network, data.txDigest);
  const coinLabel = isDisplaySupportedCoinType(data.coinType)
    ? getCoinLabel(data.coinType)
    : 'unsupported asset';

  const isAddressSend = data.recipientType === 'SUI_ADDRESS';
  const recipientDisplay = isAddressSend
    ? `sent to ${data.username}`
    : `is now waiting for @${data.username}`;

  return (
    <div className="rounded-[28px] border border-accent/20 bg-accent/8 p-5 shadow-[0_20px_44px_rgba(0,200,150,0.12)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-11 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <CheckCircle2 className="size-5" />
          </span>
          <div>
            <p className="text-lg font-semibold tracking-[-0.03em]">Money sent</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.amount} {coinLabel} {recipientDisplay}.
            </p>
          </div>
        </div>
        <Badge className="rounded-full bg-secondary text-secondary-foreground dark:bg-white/8 dark:text-foreground">Confirmed</Badge>
      </div>

      <div className="mt-4 rounded-[20px] border border-border/60 bg-secondary/70 p-4 dark:border-white/8 dark:bg-black/20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Transaction digest
        </p>
        <p className="mt-2 break-all font-mono text-xs text-foreground">
          {data.txDigest}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {explorerUrl ? (
          <Link
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 text-sm font-medium transition-colors hover:bg-secondary/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"
            href={explorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            View on explorer
            <ExternalLink className="size-4" />
          </Link>
        ) : null}
        <Button
          className="rounded-full bg-foreground text-background hover:bg-foreground/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
          onClick={onReset}
        >
          Send another
        </Button>
      </div>
    </div>
  );
}
