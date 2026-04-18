'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { ArrowUpRight, Download } from 'lucide-react';
import { PaymentTable } from '@/components/payment-table';
import { Button } from '@/components/ui/button';
import {
  explorerUrl,
  formatPendingBalances,
  getIncomingPaymentSenderDisplay,
  receivedPaymentDisplay,
  truncateAddress,
  walletReadyLabel,
  type IncomingPaymentsResponse,
} from '@/lib/received-dashboard-client';
import {
  formatAmount,
  getCoinLabel,
  getExplorerTransactionUrl,
  isDisplaySupportedCoinType,
} from '@/lib/coins';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';
import type { TransactionHistoryResponse, TransactionItem } from '@/lib/transaction-history';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';
import { cn } from '@/lib/utils';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

type SubTab = 'all' | 'sent' | 'received';

function formatSentAmount(amount: string, coinType: string) {
  if (!isDisplaySupportedCoinType(coinType)) return `${amount} raw`;
  return `${formatAmount(amount, coinType)} ${getCoinLabel(coinType)}`;
}

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function groupKey(isoDate: string) {
  return dayFormatter.format(new Date(isoDate));
}

export default function ActivityPage() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const { suiAddress: embeddedWalletAddress } = useEmbeddedWallet();
  const [tab, setTab] = useState<SubTab>('all');

  const [sentItems, setSentItems] = useState<TransactionItem[]>([]);
  const [sentCursor, setSentCursor] = useState<string | null>(null);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentLoadingMore, setSentLoadingMore] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);
  const sentControllerRef = useRef<AbortController | null>(null);

  const [receivedData, setReceivedData] = useState<IncomingPaymentsResponse | null>(null);
  const [receivedLoading, setReceivedLoading] = useState(false);
  const [receivedLoadingMore, setReceivedLoadingMore] = useState(false);
  const [receivedError, setReceivedError] = useState<string | null>(null);
  const receivedControllerRef = useRef<AbortController | null>(null);

  const twitterSubject = user?.twitter?.subject;
  const isLoggedIn = ready && authenticated;

  const fetchSent = useCallback(
    async (cursor?: string) => {
      if (!embeddedWalletAddress) return;
      sentControllerRef.current?.abort();
      const controller = new AbortController();
      sentControllerRef.current = controller;

      if (cursor) setSentLoadingMore(true);
      else {
        setSentLoading(true);
        setSentError(null);
      }

      try {
        const params = new URLSearchParams({ senderAddress: embeddedWalletAddress });
        if (cursor) params.set('cursor', cursor);

        const res = await privyAuthenticatedFetch(
          getAccessToken,
          `/api/v1/payments/history?${params}`,
          { cache: 'no-store', signal: controller.signal },
        );

        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error('Failed to load payments');

        const payload = (await res.json()) as TransactionHistoryResponse;

        if (cursor) setSentItems((prev) => [...prev, ...payload.items]);
        else setSentItems(payload.items);
        setSentCursor(payload.nextCursor);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!cursor) setSentError('Failed to load sent payments.');
      } finally {
        if (!controller.signal.aborted) {
          setSentLoading(false);
          setSentLoadingMore(false);
        }
      }
    },
    [embeddedWalletAddress, getAccessToken],
  );

  const fetchReceived = useCallback(
    async (cursor?: string) => {
      if (!twitterSubject) return;
      receivedControllerRef.current?.abort();
      const controller = new AbortController();
      receivedControllerRef.current = controller;

      if (cursor) setReceivedLoadingMore(true);
      else {
        setReceivedLoading(true);
        setReceivedError(null);
      }

      try {
        const params = new URLSearchParams();
        if (cursor) params.set('cursor', cursor);

        const res = await privyAuthenticatedFetch(
          getAccessToken,
          `/api/v1/payments/received?${params}`,
          { cache: 'no-store', signal: controller.signal },
        );

        if (controller.signal.aborted) return;
        if (!res.ok) throw new Error('Failed to load received payments');

        const payload = (await res.json()) as IncomingPaymentsResponse;

        if (cursor) {
          setReceivedData((prev) =>
            prev
              ? { ...prev, items: [...prev.items, ...payload.items], nextCursor: payload.nextCursor }
              : payload,
          );
        } else {
          setReceivedData(payload);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!cursor) setReceivedError('Failed to load received payments.');
      } finally {
        if (!controller.signal.aborted) {
          setReceivedLoading(false);
          setReceivedLoadingMore(false);
        }
      }
    },
    [twitterSubject, getAccessToken],
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    if ((tab === 'all' || tab === 'sent') && sentItems.length === 0 && !sentLoading && embeddedWalletAddress) {
      void fetchSent();
    }
    if ((tab === 'all' || tab === 'received') && !receivedData && !receivedLoading && twitterSubject) {
      void fetchReceived();
    }
    return () => {
      sentControllerRef.current?.abort();
      receivedControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isLoggedIn, embeddedWalletAddress, twitterSubject]);

  // Build a unified list + day groups + net summary.
  const unifiedRows = useMemo(() => {
    const rows: Array<{
      id: string;
      day: string;
      timestampMs: number;
      row: {
        id: string;
        counterpartyLabel: string;
        counterpartySubLabel: string;
        counterpartyAvatarUrl: string | null;
        amount: string;
        direction: 'incoming' | 'outgoing';
        createdAt: string;
        txUrl: string | null;
      };
    }> = [];

    if (tab === 'all' || tab === 'sent') {
      sentItems.forEach((item) => {
        rows.push({
          id: item.id,
          day: groupKey(item.createdAt),
          timestampMs: Date.parse(item.createdAt),
          row: {
            id: item.id,
            counterpartyAvatarUrl:
              item.recipientType === 'SUI_ADDRESS' ? null : item.recipient.profilePicture,
            counterpartyLabel:
              item.recipientType === 'SUI_ADDRESS'
                ? (item.recipientAddress ? truncateAddress(item.recipientAddress) : item.recipient.username)
                : `@${item.recipient.username}`,
            counterpartySubLabel: item.recipientType === 'SUI_ADDRESS' ? 'Sui address' : 'X recipient',
            amount: formatSentAmount(item.amount, item.coinType),
            direction: 'outgoing',
            createdAt: item.createdAt,
            txUrl: getExplorerTransactionUrl(NETWORK, item.txDigest),
          },
        });
      });
    }

    if ((tab === 'all' || tab === 'received') && receivedData) {
      receivedData.items.forEach((item) => {
        const senderDisplay = getIncomingPaymentSenderDisplay(item);
        rows.push({
          id: item.id,
          day: groupKey(item.createdAt),
          timestampMs: Date.parse(item.createdAt),
          row: {
            id: item.id,
            counterpartyAvatarUrl: senderDisplay.avatarUrl,
            counterpartyLabel: senderDisplay.label,
            counterpartySubLabel: senderDisplay.subLabel,
            amount: receivedPaymentDisplay(item),
            direction: 'incoming',
            createdAt: item.createdAt,
            txUrl: explorerUrl(NETWORK, item.txDigest),
          },
        });
      });
    }

    return rows.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [tab, sentItems, receivedData]);

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
          onClick={() => {
            void initOAuth({ provider: 'twitter' }).catch(() => {});
          }}
        >
          Sign in with X
        </Button>
      </div>
    );
  }

  const loading = (tab === 'sent' || tab === 'all') && sentLoading;
  const loadingReceived = (tab === 'received' || tab === 'all') && receivedLoading;

  return (
    <div className="flex flex-col gap-4">
      {/* Secondary pill tabs (All / Sent / Received) */}
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

      {sentError && (tab === 'all' || tab === 'sent') ? (
        <div
          className="rounded-[16px] px-4 py-3 text-[13px]"
          style={{ background: 'var(--down-soft)', color: 'var(--down)' }}
        >
          {sentError}
          <Button className="ml-3 h-8 rounded-full text-[12px]" variant="outline" size="sm" onClick={() => fetchSent()}>
            Retry
          </Button>
        </div>
      ) : null}

      {receivedError && (tab === 'all' || tab === 'received') ? (
        <div
          className="rounded-[16px] px-4 py-3 text-[13px]"
          style={{ background: 'var(--down-soft)', color: 'var(--down)' }}
        >
          {receivedError}
          <Button className="ml-3 h-8 rounded-full text-[12px]" variant="outline" size="sm" onClick={() => fetchReceived()}>
            Retry
          </Button>
        </div>
      ) : null}

      {loading || loadingReceived ? (
        <p className="py-10 text-center text-[13px]" style={{ color: 'var(--text-mute)' }}>
          Loading activity…
        </p>
      ) : null}

      {receivedData?.pendingBalances?.length ? (
        <div
          className="rounded-[16px] px-4 py-3 text-[13px]"
          style={{ background: 'var(--up-soft)', color: 'var(--up)' }}
        >
          <span className="font-semibold">
            {formatPendingBalances(receivedData.pendingBalances)}
          </span>
          {' '}available on-chain · {walletReadyLabel(receivedData.walletReady)}
        </div>
      ) : null}

      {grouped.length === 0 && !loading && !loadingReceived ? (
        <PaymentTable
          counterpartyColumnLabel="Counterparty"
          emptyTitle="No activity yet"
          emptyDescription="Once you send or receive a payment, it will show up here."
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
              direction: entry.row.direction,
              date: entry.row.createdAt,
              txUrl: entry.row.txUrl,
            }))}
            showTxLink
          />
        </section>
      ))}

      <div className="flex items-center justify-center gap-3 pt-2">
        {sentCursor && (tab === 'all' || tab === 'sent') ? (
          <Button
            variant="outline"
            className="h-9 rounded-full text-[13px]"
            disabled={sentLoadingMore}
            onClick={() => fetchSent(sentCursor ?? undefined)}
          >
            {sentLoadingMore ? 'Loading…' : 'Load more sent'}
            {!sentLoadingMore ? <ArrowUpRight className="size-3.5" /> : null}
          </Button>
        ) : null}

        {receivedData?.nextCursor && (tab === 'all' || tab === 'received') ? (
          <Button
            variant="outline"
            className="h-9 rounded-full text-[13px]"
            disabled={receivedLoadingMore}
            onClick={() => fetchReceived(receivedData.nextCursor ?? undefined)}
          >
            {receivedLoadingMore ? 'Loading…' : 'Load more received'}
            {!receivedLoadingMore ? <Download className="size-3.5" /> : null}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
