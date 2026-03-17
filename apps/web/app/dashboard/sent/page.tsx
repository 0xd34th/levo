'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RefreshCcw } from 'lucide-react';
import { DashboardTabs } from '@/components/dashboard-tabs';
import { Navbar } from '@/components/navbar';
import { PaymentTable } from '@/components/payment-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  formatAmount,
  getCoinLabel,
  getExplorerTransactionUrl,
  isDisplaySupportedCoinType,
} from '@/lib/coins';
import { truncateAddress } from '@/lib/received-dashboard-client';
import type { TransactionHistoryResponse, TransactionItem } from '@/lib/transaction-history';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

function parseLedgerAmount(value: string): bigint | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function formatSentAmount(amount: string, coinType: string) {
  if (!isDisplaySupportedCoinType(coinType)) {
    return `${amount} raw units (unknown asset)`;
  }

  return `${formatAmount(amount, coinType)} ${getCoinLabel(coinType)}`;
}

function summarizeAmount(items: TransactionItem[]) {
  if (items.length === 0) return '0';

  const totals = new Map<string, bigint>();

  for (const item of items) {
    const parsedAmount = parseLedgerAmount(item.amount);
    if (parsedAmount === null) {
      continue;
    }

    const current = totals.get(item.coinType) ?? 0n;
    totals.set(item.coinType, current + parsedAmount);
  }

  if (totals.size !== 1) {
    return `${totals.size} assets`;
  }

  const [coinType, total] = Array.from(totals.entries())[0]!;
  return formatSentAmount(total.toString(), coinType);
}

export default function SentDashboardPage() {
  const {
    suiAddress: embeddedWalletAddress,
    loading: walletLoading,
    error: walletError,
    refetch: refetchEmbeddedWallet,
  } = useEmbeddedWallet();
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const activeAddressRef = useRef<string | null>(embeddedWalletAddress ?? null);
  const loadingMoreRef = useRef(false);
  const loadMoreRequestIdRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  activeAddressRef.current = embeddedWalletAddress ?? null;

  const fetchHistory = useCallback(
    async (cursor?: string) => {
      const address = embeddedWalletAddress;
      if (!address) return;

      const isLoadMore = !!cursor;
      if (isLoadMore && loadingMoreRef.current) return;

      requestControllerRef.current?.abort();
      const controller = new AbortController();
      requestControllerRef.current = controller;
      const { signal } = controller;
      const isStaleRequest = () => signal?.aborted || activeAddressRef.current !== address;
      let loadMoreRequestId: number | undefined;

      if (isLoadMore) {
        loadMoreRequestId = loadMoreRequestIdRef.current + 1;
        loadMoreRequestIdRef.current = loadMoreRequestId;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        setLoadMoreError(null);
      } else {
        setLoading(true);
        setError(null);
        setLoadMoreError(null);
      }

      try {
        const params = new URLSearchParams({ senderAddress: address });
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(`/api/v1/payments/history?${params}`, {
          cache: 'no-store',
          signal,
        });

        if (isStaleRequest()) return;

        if (!response.ok) {
          throw new Error('Failed to load payments');
        }

        const payload = (await response.json()) as TransactionHistoryResponse;

        if (isLoadMore) {
          setItems((previous) => [...previous, ...payload.items]);
        } else {
          setItems(payload.items);
        }

        setNextCursor(payload.nextCursor);
      } catch (fetchError) {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        if (isStaleRequest()) return;

        if (isLoadMore) {
          setLoadMoreError('Failed to load more payments. Try again.');
        } else {
          setError('Failed to load sent payments. Try again.');
        }
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }

        if (isLoadMore) {
          if (
            loadMoreRequestId !== undefined &&
            loadMoreRequestIdRef.current === loadMoreRequestId
          ) {
            loadingMoreRef.current = false;
            setLoadingMore(false);
          }
        } else if (!isStaleRequest()) {
          setLoading(false);
        }
      }
    },
    [embeddedWalletAddress],
  );

  useEffect(() => {
    loadMoreRequestIdRef.current += 1;
    loadingMoreRef.current = false;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setLoading(false);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);
    setItems([]);
    setNextCursor(null);

    if (!embeddedWalletAddress) return;

    fetchHistory();

    return () => requestControllerRef.current?.abort();
  }, [embeddedWalletAddress, fetchHistory]);

  const totalSent = summarizeAmount(items);
  const recentRecipient = items[0]?.recipient.username ? `@${items[0].recipient.username}` : 'None yet';
  const volumeLabel = nextCursor ? 'Loaded volume' : 'Volume';

  return (
    <div className="app-shell">
      <Navbar />

      <main className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-eyebrow">Sender dashboard</p>
            <h1 className="hero-heading mt-3 max-w-2xl">Every payment you sent, in one calm ledger.</h1>
            <p className="mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
              View confirmed transfers from your embedded wallet.
            </p>
          </div>
        </section>

        <DashboardTabs />

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="metric-card">
            <p className="section-eyebrow">Payments</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{items.length}</p>
          </div>
          <div className="metric-card">
            <p className="section-eyebrow">{volumeLabel}</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{totalSent}</p>
          </div>
          <div className="metric-card">
            <p className="section-eyebrow">Most recent recipient</p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{recentRecipient}</p>
          </div>
        </section>

        <section className="table-surface mt-8">
          <Card className="border-0 bg-transparent py-0 shadow-none ring-0">
            <CardContent className="px-0 py-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-5 dark:border-white/8">
                <div>
                  <p className="text-lg font-semibold tracking-[-0.03em]">Sent payments</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Recipient, amount, status, date, and explorer link.
                  </p>
                </div>
                {embeddedWalletAddress ? (
                  <Badge className="rounded-full bg-secondary text-secondary-foreground dark:bg-white/8 dark:text-foreground">
                    {truncateAddress(embeddedWalletAddress)}
                  </Badge>
                ) : null}
              </div>

              {walletLoading ? (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  Setting up wallet…
                </div>
              ) : walletError ? (
                <div className="px-5 py-10">
                  <div className="rounded-[24px] border border-destructive/20 bg-destructive/8 p-5">
                    <p className="font-medium text-destructive">{walletError}</p>
                    <Button
                      className="mt-4 rounded-full"
                      variant="outline"
                      onClick={() => {
                        refetchEmbeddedWallet();
                      }}
                    >
                      Retry wallet setup
                    </Button>
                  </div>
                </div>
              ) : loading ? (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  Loading sent payments…
                </div>
              ) : error ? (
                <div className="px-5 py-10">
                  <div className="rounded-[24px] border border-destructive/20 bg-destructive/8 p-5">
                    <p className="font-medium text-destructive">{error}</p>
                    <Button className="mt-4 rounded-full" variant="outline" onClick={() => fetchHistory()}>
                      <RefreshCcw className="size-4" />
                      Retry
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-5 py-5">
                  <PaymentTable
                    counterpartyColumnLabel="Recipient"
                    emptyDescription="Once you send the first payment, it will show up here."
                    emptyTitle="No payments yet"
                    rows={items.map((item) => ({
                      id: item.id,
                      counterpartyAvatarUrl: item.recipient.profilePicture,
                      counterpartyLabel: `@${item.recipient.username}`,
                      counterpartySubLabel: 'X recipient',
                      amount: formatSentAmount(item.amount, item.coinType),
                      status: 'Confirmed',
                      date: item.createdAt,
                      txUrl: getExplorerTransactionUrl(NETWORK, item.txDigest),
                    }))}
                    showTxLink
                  />

                  {nextCursor ? (
                    <div className="mt-5 flex flex-col items-center gap-3">
                      <Button
                        className="rounded-full"
                        disabled={loadingMore}
                        variant="outline"
                        onClick={() => fetchHistory(nextCursor ?? undefined)}
                      >
                        {loadingMore ? 'Loading…' : 'Load more'}
                        {!loadingMore ? <ArrowUpRight className="size-4" /> : null}
                      </Button>
                      {loadMoreError ? (
                        <p className="text-sm text-destructive">{loadMoreError}</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
