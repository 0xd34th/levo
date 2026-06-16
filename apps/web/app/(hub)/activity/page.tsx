'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { ArrowUpRight } from 'lucide-react';
import { PaymentTable } from '@/components/payment-table';
import { Button } from '@/components/ui/button';
import { getExplorerTransactionUrl } from '@/lib/coins';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';
import { useXSignIn } from '@/lib/use-x-sign-in';
import { cn } from '@/lib/utils';
import type {
  WalletActivityDirection,
  WalletActivityItem,
  WalletActivityResponse,
} from '@/lib/wallet-activity';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

type SubTab = 'all' | 'sent' | 'received';

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function groupKey(isoDate: string) {
  return dayFormatter.format(new Date(isoDate));
}

async function getActivityResponseError(response: Response, fallback: string) {
  try {
    const payload = await response.clone().json();
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string' &&
      payload.error
    ) {
      return payload.error;
    }
  } catch {
    // Ignore malformed error payloads.
  }
  return fallback;
}

function tabAllowsDirection(tab: SubTab, direction: WalletActivityDirection) {
  if (tab === 'all') return true;
  if (tab === 'sent') return direction === 'outgoing';
  return direction === 'incoming';
}

function tableDirection(direction: WalletActivityDirection) {
  if (direction === 'incoming' || direction === 'outgoing') {
    return direction;
  }
  return undefined;
}

export default function ActivityPage() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { signIn: signInWithX } = useXSignIn();
  const { suiAddress: embeddedWalletAddress } = useEmbeddedWallet();
  const [tab, setTab] = useState<SubTab>('all');
  const [items, setItems] = useState<WalletActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const isLoggedIn = ready && authenticated;

  const fetchActivity = useCallback(
    async (nextCursor?: string) => {
      if (!embeddedWalletAddress) return;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      if (nextCursor) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError(null);
      }

      try {
        const params = new URLSearchParams({ address: embeddedWalletAddress });
        if (nextCursor) params.set('cursor', nextCursor);

        const res = await privyAuthenticatedFetch(
          getAccessToken,
          `/api/v1/activity?${params}`,
          { cache: 'no-store', signal: controller.signal },
        );

        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error(await getActivityResponseError(res, 'Failed to load activity.'));

        const payload = (await res.json()) as WalletActivityResponse;
        if (nextCursor) {
          setItems((prev) => [...prev, ...payload.items]);
        } else {
          setItems(payload.items);
        }
        setCursor(payload.nextCursor);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!nextCursor) setError(err instanceof Error ? err.message : 'Failed to load activity.');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [embeddedWalletAddress, getAccessToken],
  );

  useEffect(() => {
    if (isLoggedIn && embeddedWalletAddress && items.length === 0 && !loading) {
      void fetchActivity();
    }
    return () => {
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, embeddedWalletAddress]);

  const unifiedRows = useMemo(() => {
    return items
      .filter((item) => tabAllowsDirection(tab, item.direction))
      .map((item) => ({
        id: item.id,
        day: groupKey(item.createdAt),
        timestampMs: Date.parse(item.createdAt),
        row: {
          id: item.id,
          counterpartyLabel: item.counterpartyLabel,
          counterpartySubLabel: item.counterpartySubLabel,
          counterpartyAvatarUrl: item.counterpartyAvatarUrl,
          amount: item.amountLabel,
          direction: item.direction,
          createdAt: item.createdAt,
          txUrl: getExplorerTransactionUrl(NETWORK, item.txDigest),
        },
      }))
      .sort((a, b) => b.timestampMs - a.timestampMs);
  }, [tab, items]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof unifiedRows>();
    for (const entry of unifiedRows) {
      const list = map.get(entry.day) ?? [];
      list.push(entry);
      map.set(entry.day, list);
    }
    return Array.from(map.entries());
  }, [unifiedRows]);

  if (ready && !authenticated) {
    return (
      <div className="flex flex-col items-center pt-12 text-center">
        <p className="text-[14px]" style={{ color: 'var(--text-mute)' }}>
          Sign in to view your activity.
        </p>
        <Button
          className="mt-4 h-11 rounded-full px-5"
          onClick={signInWithX}
        >
          Sign in with X
        </Button>
      </div>
    );
  }

  if (isLoggedIn && !embeddedWalletAddress) {
    return (
      <p className="py-10 text-center text-[13px]" style={{ color: 'var(--text-mute)' }}>
        Preparing wallet activity…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">
        {(['all', 'sent', 'received'] as const).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-full px-4 py-1.5 text-[13px] font-medium capitalize transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : 'bg-surface text-foreground hover:bg-raise',
              )}
            >
              {t}
            </button>
          );
        })}
      </div>

      {error ? (
        <div
          className="rounded-[16px] px-4 py-3 text-[13px]"
          style={{ background: 'var(--down-soft)', color: 'var(--down)' }}
        >
          {error}
          <Button className="ml-3 h-8 rounded-full text-[12px]" variant="outline" size="sm" onClick={() => fetchActivity()}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading ? (
        <p className="py-10 text-center text-[13px]" style={{ color: 'var(--text-mute)' }}>
          Loading activity…
        </p>
      ) : null}

      {grouped.length === 0 && !loading ? (
        <PaymentTable
          counterpartyColumnLabel="Counterparty"
          emptyTitle="No activity yet"
          emptyDescription="Once your wallet has balance-changing activity, it will show up here."
          rows={[]}
        />
      ) : null}

      {grouped.map(([day, entries]) => (
        <section key={day}>
          <div className="flex items-baseline justify-between px-1 pb-2">
            <div className="text-[15px] font-semibold" style={{ color: 'var(--text-soft)' }}>
              {day}
            </div>
          </div>
          <PaymentTable
            counterpartyColumnLabel="Counterparty"
            emptyTitle=""
            emptyDescription=""
            rows={entries.map((entry) => ({
              id: entry.row.id,
              counterpartyLabel: entry.row.counterpartyLabel,
              counterpartySubLabel: entry.row.counterpartySubLabel,
              counterpartyAvatarUrl: entry.row.counterpartyAvatarUrl,
              amount: entry.row.amount,
              status: 'Confirmed',
              direction: tableDirection(entry.row.direction),
              date: entry.row.createdAt,
              txUrl: entry.row.txUrl,
            }))}
            showTxLink
          />
        </section>
      ))}

      <div className="flex items-center justify-center gap-3 pt-2">
        {cursor ? (
          <Button
            variant="outline"
            className="h-9 rounded-full text-[13px]"
            disabled={loadingMore}
            onClick={() => fetchActivity(cursor)}
          >
            {loadingMore ? 'Loading…' : 'Load more activity'}
            {!loadingMore ? <ArrowUpRight className="size-3.5" /> : null}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
