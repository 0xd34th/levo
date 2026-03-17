'use client';

import { useEffect, useRef, useState } from 'react';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { Download, Sparkles } from 'lucide-react';
import { DashboardTabs } from '@/components/dashboard-tabs';
import { Navbar } from '@/components/navbar';
import { PaymentTable } from '@/components/payment-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  claimStatusLabel,
  explorerUrl,
  formatPendingBalances,
  receivedPaymentDisplay,
  truncateAddress,
  untrackedBalanceNote,
  type IncomingPaymentsResponse,
} from '@/lib/received-dashboard-client';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

export default function ReceivedDashboardPage() {
  const { ready, authenticated, user } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IncomingPaymentsResponse | null>(null);
  const fetchRequestIdRef = useRef(0);
  const loadMoreRequestIdRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);
  const activeTwitterSubjectRef = useRef<string | null>(null);

  const twitterSubject = user?.twitter?.subject;
  const twitterUsername = user?.twitter?.username;
  const twitterProfilePicture = user?.twitter?.profilePictureUrl;
  const trustedTwitterProfilePicture =
    twitterProfilePicture && isTrustedProfilePictureUrl(twitterProfilePicture)
      ? twitterProfilePicture
      : null;
  const activeTwitterSubject =
    ready && authenticated && twitterSubject ? twitterSubject : null;
  const pendingBalanceNote = data
    ? untrackedBalanceNote(
        data.pendingBalances,
        data.recordedTotals,
        data.claimStatus,
      )
    : null;

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!ready) return;

    if (!activeTwitterSubject) {
      activeTwitterSubjectRef.current = null;
      hasFetchedRef.current = false;
      fetchRequestIdRef.current += 1;
      loadMoreRequestIdRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      setLoading(false);
      setLoadingMore(false);
      setError(null);
      setData(null);
      return;
    }

    if (activeTwitterSubjectRef.current !== activeTwitterSubject) {
      activeTwitterSubjectRef.current = activeTwitterSubject;
      hasFetchedRef.current = false;
      setError(null);
      setData(null);
    }
  }, [ready, activeTwitterSubject]);

  useEffect(() => {
    if (!activeTwitterSubject || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    void handleFetch();
    return () => {
      hasFetchedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTwitterSubject]);

  async function fetchReceived(cursor?: string, signal?: AbortSignal) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(`/api/v1/payments/received?${params}`, {
      cache: 'no-store',
      signal,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: 'Unable to load received payments' }));
      throw new Error(payload.error ?? 'Unable to load received payments');
    }

    return (await response.json()) as IncomingPaymentsResponse;
  }

  async function handleFetch() {
    const fetchRequestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = fetchRequestId;
    loadMoreRequestIdRef.current += 1;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setLoadingMore(false);
    setData(null);
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const payload = await fetchReceived(undefined, controller.signal);
      if (fetchRequestIdRef.current !== fetchRequestId) return;
      setData(payload);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      if (fetchRequestIdRef.current !== fetchRequestId) return;
      setData(null);
      setError(requestError instanceof Error ? requestError.message : 'Unable to load received payments');
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (fetchRequestIdRef.current === fetchRequestId) {
        setLoading(false);
      }
    }
  }

  async function handleLoadMore() {
    if (!data?.nextCursor || loading || loadingMore) return;

    const loadMoreRequestId = loadMoreRequestIdRef.current + 1;
    loadMoreRequestIdRef.current = loadMoreRequestId;
    const currentFetchRequestId = fetchRequestIdRef.current;
    const currentCursor = data.nextCursor;

    setLoadingMore(true);
    setError(null);
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const payload = await fetchReceived(currentCursor, controller.signal);

      if (
        loadMoreRequestIdRef.current !== loadMoreRequestId ||
        fetchRequestIdRef.current !== currentFetchRequestId
      ) {
        return;
      }

      setData((previous) =>
        previous
          ? {
              ...previous,
              items: [...previous.items, ...payload.items],
              nextCursor: payload.nextCursor,
            }
          : payload,
      );
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      if (
        loadMoreRequestIdRef.current !== loadMoreRequestId ||
        fetchRequestIdRef.current !== currentFetchRequestId
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

  const showLoading = loading && !data;

  return (
    <div className="app-shell">
      <Navbar />

      <main className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-eyebrow">Recipient dashboard</p>
            <h1 className="hero-heading mt-3 max-w-2xl">Your received payments</h1>
            <p className="mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Sign in with X to view your vault status, pending balances, and every confirmed incoming transfer.
            </p>
          </div>
          {authenticated && twitterUsername ? (
            <div className="flex items-center gap-3">
              {trustedTwitterProfilePicture ? (
                <img
                  alt={`@${twitterUsername}`}
                  className="size-10 rounded-full"
                  src={trustedTwitterProfilePicture}
                />
              ) : null}
              <Badge variant="outline" className="rounded-full border-border/70 px-4 py-1.5 text-sm text-foreground dark:border-white/10">
                @{twitterUsername}
              </Badge>
            </div>
          ) : null}
        </section>

        <DashboardTabs />

        {showLoading ? (
          <section className="mt-8">
            <Card className="glass-card rounded-[30px] bg-card/95 py-0 dark:bg-[#11161d]/92">
              <CardContent className="flex items-center justify-center px-5 py-12 sm:px-6">
                <p className="text-sm text-muted-foreground">Loading…</p>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {ready && authenticated && !activeTwitterSubject && !showLoading && !error && !data ? (
          <section className="mt-8">
            <Card className="glass-card rounded-[30px] bg-card/95 py-0 dark:bg-[#11161d]/92">
              <CardContent className="flex flex-col items-start gap-4 px-5 py-6 sm:px-6">
                <div>
                  <p className="text-lg font-semibold tracking-[-0.03em]">Link X to load your vault</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Your dashboard needs a linked X account before Levo can load pending balances and incoming payments.
                  </p>
                </div>
                <Button
                  className="rounded-full"
                  onClick={() => {
                    void initOAuth({ provider: 'twitter' }).catch(() => {});
                  }}
                >
                  Link X account
                </Button>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {error ? (
          <section className="mt-8">
            <div className="rounded-[22px] border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {error}
              <Button
                className="ml-3 h-8 rounded-full px-3 text-xs"
                variant="outline"
                onClick={handleFetch}
              >
                Retry
              </Button>
            </div>
          </section>
        ) : null}

        {data ? (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="metric-card">
                <p className="section-eyebrow">Pending balance</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatPendingBalances(data.pendingBalances)}
                </p>
                {pendingBalanceNote ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {pendingBalanceNote}
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
                    Confirmed deposits routed to your vault.
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
