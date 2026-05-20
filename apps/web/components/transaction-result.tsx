'use client';

import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getCoinLabel,
  getExplorerTransactionUrl,
  isDisplaySupportedCoinType,
} from '@/lib/coins';

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
    ? data.username
    : `@${data.username}`;

  return (
    <div className="rounded-[18px] bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 flex size-10 items-center justify-center rounded-[12px] text-white"
            style={{ background: 'var(--up)' }}
          >
            <Check className="size-5" strokeWidth={2} />
          </span>
          <div>
            <p className="text-[17px] font-semibold tracking-[-0.01em]">
              Money sent
            </p>
            <p
              className="mt-1 text-[14px]"
              style={{ color: 'var(--text-soft)' }}
            >
              <span className="mono-nums font-medium text-foreground">
                {data.amount} {coinLabel}
              </span>{' '}
              sent to{' '}
              <span className="font-medium text-foreground">
                {recipientDisplay}
              </span>
              .
            </p>
          </div>
        </div>
        <span
          className="rounded-full px-3 py-1 text-[12px] font-semibold"
          style={{ background: 'var(--up-soft)', color: 'var(--up)' }}
        >
          Confirmed
        </span>
      </div>

      <div className="mt-4 rounded-[14px] bg-raise px-4 py-3">
        <p className="eyebrow">Transaction digest</p>
        <p className="mt-1.5 break-all font-mono text-[12px]">
          {data.txDigest}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {explorerUrl ? (
          <Link
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-raise px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-[color:var(--border-strong)]/20"
            href={explorerUrl}
            rel="noreferrer"
            target="_blank"
          >
            View on explorer
            <ArrowUpRight className="size-3.5" />
          </Link>
        ) : null}
        <Button
          className="h-10 rounded-full bg-foreground px-4 text-[13px] text-background hover:bg-foreground/90"
          onClick={onReset}
        >
          Send another
        </Button>
      </div>
    </div>
  );
}
