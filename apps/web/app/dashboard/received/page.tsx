'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Download, Search, Sparkles } from 'lucide-react';
import { DashboardTabs } from '@/components/dashboard-tabs';
import { Navbar } from '@/components/navbar';
import { PaymentTable } from '@/components/payment-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  claimStatusLabel,
  explorerUrl,
  formatPendingBalances,
  normalizeHandle,
  receivedPaymentDisplay,
  truncateAddress,
  untrackedBalanceNote,
  type IncomingPaymentsResponse,
} from '@/lib/received-dashboard-client';
import { MAX_X_HANDLE_LENGTH } from '@/lib/send-form';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

export default function ReceivedDashboardPage() {
  const [handle, setHandle] = useState('');
  const [activeHandle, setActiveHandle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IncomingPaymentsResponse | null>(null);
  const lookupRequestIdRef = useRef(0);
  const loadMoreRequestIdRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  async function fetchIncoming(username: string, cursor?: string, signal?: AbortSignal) {
    const params = new URLSearchParams({ username });
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`/api/v1/payments/incoming?${params}`, {
      cache: 'no-store',
      signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Unable to load incoming payments' }));
      throw new Error(payload.error ?? 'Unable to load incoming payments');
    }

    return (await response.json()) as IncomingPaymentsResponse;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const username = normalizeHandle(handle);
    const lookupRequestId = lookupRequestIdRef.current + 1;
    lookupRequestIdRef.current = lookupRequestId;
    loadMoreRequestIdRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setLoadingMore(false);
    setActiveHandle(null);
    setData(null);

    if (!username) {
      setLoading(false);
      setError('Enter an X handle to load received payments.');
      return;
    }

    setLoading(true);
    setError(null);
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const payload = await fetchIncoming(username, undefined, controller.signal);

      if (lookupRequestIdRef.current !== lookupRequestId) return;

      setData(payload);
      setActiveHandle(username);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      if (lookupRequestIdRef.current !== lookupRequestId) return;
      setData(null);
      setActiveHandle(null);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load incoming payments');
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (lookupRequestIdRef.current === lookupRequestId) {
        setLoading(false);
      }
    }
  }

  async function handleLoadMore() {
    if (!activeHandle || !data?.nextCursor || loading || loadingMore) return;

    const loadMoreRequestId = loadMoreRequestIdRef.current + 1;
    loadMoreRequestIdRef.current = loadMoreRequestId;
    const currentLookupRequestId = lookupRequestIdRef.current;
    const currentHandle = activeHandle;
    const currentCursor = data.nextCursor;

    setLoadingMore(true);
    setError(null);
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const payload = await fetchIncoming(
        currentHandle,
        currentCursor,
        controller.signal,
      );

      if (
        loadMoreRequestIdRef.current !== loadMoreRequestId ||
        lookupRequestIdRef.current !== currentLookupRequestId
      ) {
        return;
      }

      setData((previous) =>
        previous
          ? {
              ...payload,
              items: [...previous.items, ...payload.items],
            }
          : payload,
      );
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      if (
        loadMoreRequestIdRef.current !== loadMoreRequestId ||
        lookupRequestIdRef.current !== currentLookupRequestId
      ) {
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Unable to load more payments');
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (loadMoreRequestIdRef.current === loadMoreRequestId) {
        setLoadingMore(false);
      }
    }
  }

  return (
    <div className="app-shell">
      <Navbar />

      <main className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-eyebrow">Recipient dashboard</p>
            <h1 className="hero-heading mt-3 max-w-2xl">See what has arrived for an X identity before it is claimed.</h1>
            <p className="mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Search any handle to inspect vault status, pending balances, and every confirmed incoming transfer.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full border-border/70 px-4 py-1.5 text-xs text-muted-foreground dark:border-white/10">
            Public pre-claim view
          </Badge>
        </section>

        <DashboardTabs />

        <section className="mt-8">
          <Card className="glass-card rounded-[30px] bg-card/95 py-0 dark:bg-[#11161d]/92">
            <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
              <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">
                    @
                  </span>
                  <Input
                    className="h-16 rounded-[22px] border-border/70 bg-background/80 pl-12 text-lg font-medium dark:border-white/10 dark:bg-white/5"
                    maxLength={MAX_X_HANDLE_LENGTH + 1}
                    placeholder="username"
                    value={handle}
                    onChange={(event) => setHandle(normalizeHandle(event.target.value))}
                  />
                </div>
                <Button className="h-16 rounded-[22px] px-5" disabled={loading} type="submit">
                  <Search className="size-4" />
                  {loading ? 'Loading…' : 'Load dashboard'}
                </Button>
              </form>

              {error ? (
                <div className="mt-4 rounded-[22px] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>

        {data ? (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="metric-card">
                <p className="section-eyebrow">Pending balance</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatPendingBalances(data.pendingBalances)}
                </p>
                {untrackedBalanceNote(data.pendingBalances, data.recordedTotals, data.claimStatus) ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {untrackedBalanceNote(data.pendingBalances, data.recordedTotals, data.claimStatus)}
                  </p>
                ) : null}
              </div>
              <div className="metric-card">
                <p className="section-eyebrow">Claim status</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {claimStatusLabel(data.claimStatus)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.vaultExists
                    ? 'Vault object exists on-chain.'
                    : data.claimStatus === 'PREVIOUSLY_CLAIMED'
                      ? 'Vault object was previously claimed and is no longer live on-chain.'
                      : 'Waiting for the first claim.'}
                </p>
              </div>
              <div className="metric-card">
                <p className="section-eyebrow">Vault address</p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                  {truncateAddress(data.vaultAddress)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Deterministic vault for @{data.username}
                </p>
              </div>
            </section>

            <section className="table-surface mt-8">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-5 dark:border-white/8">
                <div>
                  <p className="text-lg font-semibold tracking-[-0.03em]">Incoming payments</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Confirmed deposits routed to the vault before wallet claim.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="rounded-full border-border/70 px-3 text-muted-foreground dark:border-white/10">
                    @{data.username}
                  </Badge>
                  <Badge className="rounded-full bg-secondary text-secondary-foreground dark:bg-white/8 dark:text-foreground">
                    <Sparkles className="mr-1 size-3.5" />
                    {claimStatusLabel(data.claimStatus)}
                  </Badge>
                </div>
              </div>

              <div className="px-5 py-5">
                <PaymentTable
                  key={data.username}
                  counterpartyColumnLabel="Sender"
                  emptyDescription="No confirmed incoming payments have been routed here yet."
                  emptyTitle="Nothing received yet"
                  enableVirtualization
                  rows={data.items.map((item) => ({
                    id: item.id,
                    counterpartyLabel: truncateAddress(item.senderAddress),
                    counterpartySubLabel: 'Sender wallet',
                    amount: receivedPaymentDisplay(item),
                    status: 'Confirmed',
                    claimStatus: claimStatusLabel(data.claimStatus),
                    date: item.createdAt,
                    txUrl: explorerUrl(NETWORK, item.txDigest),
                  }))}
                  showClaimStatus
                  showTxLink
                />

                {data.nextCursor ? (
                  <div className="mt-5 flex justify-center">
                    <Button
                      className="rounded-full"
                      disabled={loadingMore}
                      variant="outline"
                      onClick={handleLoadMore}
                    >
                      <Download className="size-4" />
                      {loadingMore ? 'Loading…' : 'Load more'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
