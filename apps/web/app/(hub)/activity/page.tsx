'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { ArrowUpRight, Download } from 'lucide-react';
import { PaymentTable } from '@/components/payment-table';
import { Button } from '@/components/ui/button';
import {
  claimActionLabel,
  claimStatusLabel,
  explorerUrl,
  formatPendingBalances,
  getIncomingPaymentSenderDisplay,
  receivedPaymentDisplay,
  truncateAddress,
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

type SubTab = 'sent' | 'received';

function formatSentAmount(amount: string, coinType: string) {
  if (!isDisplaySupportedCoinType(coinType)) {
    return `${amount} raw units`;
  }
  return `${formatAmount(amount, coinType)} ${getCoinLabel(coinType)}`;
}

export default function ActivityPage() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const { suiAddress: embeddedWalletAddress } = useEmbeddedWallet();
  const [tab, setTab] = useState<SubTab>('sent');

  // Sent state
  const [sentItems, setSentItems] = useState<TransactionItem[]>([]);
  const [sentCursor, setSentCursor] = useState<string | null>(null);
  const [sentLoading, setSentLoading] = useState(false);
  const [sentLoadingMore, setSentLoadingMore] = useState(false);
  const [sentError, setSentError] = useState<string | null>(null);
  const sentControllerRef = useRef<AbortController | null>(null);

  // Received state
  const [receivedData, setReceivedData] = useState<IncomingPaymentsResponse | null>(null);
  const [receivedLoading, setReceivedLoading] = useState(false);
  const [receivedLoadingMore, setReceivedLoadingMore] = useState(false);
  const [receivedError, setReceivedError] = useState<string | null>(null);
  const receivedControllerRef = useRef<AbortController | null>(null);

  const twitterSubject = user?.twitter?.subject;
  const isLoggedIn = ready && authenticated;

  // Fetch sent payments
  const fetchSent = useCallback(
    async (cursor?: string) => {
      if (!embeddedWalletAddress) return;

      sentControllerRef.current?.abort();
      const controller = new AbortController();
      sentControllerRef.current = controller;

      if (cursor) {
        setSentLoadingMore(true);
      } else {
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

        if (cursor) {
          setSentItems((prev) => [...prev, ...payload.items]);
        } else {
          setSentItems(payload.items);
        }
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

  // Fetch received payments
  const fetchReceived = useCallback(
    async (cursor?: string) => {
      if (!twitterSubject) return;

      receivedControllerRef.current?.abort();
      const controller = new AbortController();
      receivedControllerRef.current = controller;

      if (cursor) {
        setReceivedLoadingMore(true);
      } else {
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

  // Initial fetch when tab or auth changes
  useEffect(() => {
    if (!isLoggedIn) return;
    if (tab === 'sent' && sentItems.length === 0 && !sentLoading && embeddedWalletAddress) {
      void fetchSent();
    }
    if (tab === 'received' && !receivedData && !receivedLoading && twitterSubject) {
      void fetchReceived();
    }
    return () => {
      sentControllerRef.current?.abort();
      receivedControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isLoggedIn, embeddedWalletAddress, twitterSubject]);

  if (ready && !authenticated) {
    return (
      <div className="flex flex-col items-center pt-12 text-center">
        <p className="text-sm text-muted-foreground">Sign in to view your activity.</p>
        <Button
          className="mt-4 rounded-full"
          onClick={() => {
            void initOAuth({ provider: 'twitter' }).catch(() => {});
          }}
        >
          Sign in with X
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-secondary/40 p-1 dark:border-white/8 dark:bg-white/4">
        {(['sent', 'received'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={cn(
              'flex-1 rounded-full py-2 text-center text-sm font-medium capitalize transition-colors',
              tab === t
                ? 'bg-background text-foreground shadow-sm dark:bg-white/10'
                : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Sent Tab */}
      {tab === 'sent' ? (
        <div>
          {sentLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading sent payments...</p>
          ) : sentError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/8 p-4">
              <p className="text-sm text-destructive">{sentError}</p>
              <Button className="mt-3 rounded-full" size="sm" variant="outline" onClick={() => fetchSent()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <PaymentTable
                counterpartyColumnLabel="Recipient"
                emptyDescription="Once you send the first payment, it will show up here."
                emptyTitle="No payments yet"
                rows={sentItems.map((item) => ({
                  id: item.id,
                  counterpartyAvatarUrl: item.recipientType === 'SUI_ADDRESS' ? null : item.recipient.profilePicture,
                  counterpartyLabel: item.recipientType === 'SUI_ADDRESS'
                    ? (item.recipientAddress ? truncateAddress(item.recipientAddress) : item.recipient.username)
                    : `@${item.recipient.username}`,
                  counterpartySubLabel: item.recipientType === 'SUI_ADDRESS' ? 'Sui address' : 'X recipient',
                  amount: formatSentAmount(item.amount, item.coinType),
                  status: 'Confirmed',
                  date: item.createdAt,
                  txUrl: getExplorerTransactionUrl(NETWORK, item.txDigest),
                }))}
                showTxLink
              />
              {sentCursor ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    className="rounded-full"
                    disabled={sentLoadingMore}
                    variant="outline"
                    size="sm"
                    onClick={() => fetchSent(sentCursor ?? undefined)}
                  >
                    {sentLoadingMore ? 'Loading...' : 'Load more'}
                    {!sentLoadingMore ? <ArrowUpRight className="size-3.5" /> : null}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {/* Received Tab */}
      {tab === 'received' ? (
        <div>
          {receivedLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading received payments...</p>
          ) : receivedError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/8 p-4">
              <p className="text-sm text-destructive">{receivedError}</p>
              <Button className="mt-3 rounded-full" size="sm" variant="outline" onClick={() => fetchReceived()}>
                Retry
              </Button>
            </div>
          ) : !twitterSubject ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Link your X account to view received payments.
            </p>
          ) : receivedData ? (
            <>
              {receivedData.pendingBalances.length > 0 ? (
                <div className="mb-3 rounded-2xl border border-accent/20 bg-accent/5 p-3 text-sm dark:bg-accent/8">
                  <span className="font-semibold">{formatPendingBalances(receivedData.pendingBalances)}</span>
                  {' '}pending &middot; {claimStatusLabel(receivedData.claimStatus)} &middot; {claimActionLabel(receivedData.claimAction)}
                </div>
              ) : null}

              <PaymentTable
                counterpartyColumnLabel="Sender"
                emptyDescription="No confirmed incoming payments yet."
                emptyTitle="Nothing received yet"
                rows={receivedData.items.map((item) => {
                  const senderDisplay = getIncomingPaymentSenderDisplay(item);

                  return {
                    id: item.id,
                    counterpartyAvatarUrl: senderDisplay.avatarUrl,
                    counterpartyLabel: senderDisplay.label,
                    counterpartySubLabel: senderDisplay.subLabel,
                    amount: receivedPaymentDisplay(item),
                    status: 'Confirmed',
                    date: item.createdAt,
                    txUrl: explorerUrl(NETWORK, item.txDigest),
                  };
                })}
                showTxLink
              />
              {receivedData.nextCursor ? (
                <div className="mt-4 flex justify-center">
                  <Button
                    className="rounded-full"
                    disabled={receivedLoadingMore}
                    variant="outline"
                    size="sm"
                    onClick={() => fetchReceived(receivedData.nextCursor ?? undefined)}
                  >
                    {receivedLoadingMore ? 'Loading...' : 'Load more'}
                    <Download className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
