'use client';

import Link from 'next/link';
import { TransactionRow } from '@/components/transaction-row';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import type { TransactionItem } from '@/lib/transaction-history';

interface TransactionListProps {
  items: TransactionItem[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  loadMoreError: string | null;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  network: string;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="h-9 w-9 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

export function TransactionList({
  items,
  loading,
  error,
  onRetry,
  loadMoreError,
  nextCursor,
  loadingMore,
  onLoadMore,
  network,
}: TransactionListProps) {
  if (loading) {
    return (
      <div className="divide-y">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">No transactions yet.</p>
        <Link href="/send" className="text-sm text-primary hover:underline mt-1 inline-block">
          Send your first payment
        </Link>
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => (
        <TransactionRow
          key={item.id}
          txDigest={item.txDigest}
          coinType={item.coinType}
          amount={item.amount}
          createdAt={item.createdAt}
          recipient={item.recipient}
          network={network}
        />
      ))}
      {nextCursor && (
        <div className="pt-3 text-center">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? 'Loading…' : 'Load More'}
          </Button>
        </div>
      )}
      {loadMoreError && (
        <p className="pt-3 text-center text-sm text-destructive">{loadMoreError}</p>
      )}
    </div>
  );
}
