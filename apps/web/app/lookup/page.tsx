'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Search, ShieldCheck, Wallet } from 'lucide-react';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { PaymentTable } from '@/components/payment-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  explorerUrl,
  formatPendingBalances,
  normalizeHandle,
  receivedPaymentDisplay,
  truncateAddress,
  untrackedBalanceNote,
  walletReadyLabel,
  type PublicLookupResponse,
} from '@/lib/received-dashboard-client';
import { MAX_X_HANDLE_LENGTH } from '@/lib/send-form';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

export default function LookupPage() {
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicLookupResponse | null>(null);
  const lookupRequestIdRef = useRef(0);
  const lookupAbortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      lookupAbortRef.current?.abort();
    },
    [],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const username = normalizeHandle(handle);
    const lookupRequestId = lookupRequestIdRef.current + 1;
    lookupRequestIdRef.current = lookupRequestId;
    lookupAbortRef.current?.abort();
    lookupAbortRef.current = null;

    if (!username) {
      setLoading(false);
      setError('Enter an X handle to check the recipient wallet.');
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    const controller = new AbortController();
    lookupAbortRef.current = controller;

    try {
      const params = new URLSearchParams({ username });
      const response = await fetch(`/api/v1/lookup/x-username?${params.toString()}`, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (lookupRequestIdRef.current !== lookupRequestId) {
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Lookup failed' }));
        throw new Error(payload.error ?? 'Lookup failed');
      }

      const payload = (await response.json()) as PublicLookupResponse;
      if (lookupRequestIdRef.current !== lookupRequestId) {
        return;
      }

      setResult(payload);
    } catch (lookupError) {
      if (controller.signal.aborted) {
        return;
      }
      if (lookupRequestIdRef.current !== lookupRequestId) {
        return;
      }
      setResult(null);
      setError(lookupError instanceof Error ? lookupError.message : 'Lookup failed');
    } finally {
      if (lookupAbortRef.current === controller) {
        lookupAbortRef.current = null;
      }
      if (lookupRequestIdRef.current === lookupRequestId) {
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen">
      <MobileTopBar title="Wallet Lookup" backHref="/tools" />

      <main className="mx-auto flex w-full max-w-lg flex-col px-4 pb-16 pt-6 md:max-w-4xl">
        <section className="mx-auto mt-8 w-full max-w-3xl">
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
                  {loading ? 'Searching…' : 'Lookup'}
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

        {result ? (
          <>
            <section className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="metric-card">
                <p className="section-eyebrow">Wallet ready</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {walletReadyLabel(result.walletReady)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {result.recipientAddress
                    ? truncateAddress(result.recipientAddress)
                    : 'Canonical recipient wallet has not been provisioned yet.'}
                </p>
              </div>
              <div className="metric-card">
                <p className="section-eyebrow">Current wallet balance</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatPendingBalances(result.pendingBalances)}
                </p>
                {untrackedBalanceNote(result.pendingBalances, result.recordedTotals) ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {untrackedBalanceNote(result.pendingBalances, result.recordedTotals)}
                  </p>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">
                  Current on-chain balance for the canonical recipient wallet.
                </p>
              </div>
              <div className="metric-card">
                <p className="section-eyebrow">Indexed received</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatPendingBalances(result.recordedTotals)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Confirmed transfers indexed for @{result.username}.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Public status for @{result.username}</p>
              </div>
            </section>

            <section className="table-surface mt-8">
              <div className="border-b border-border/70 px-5 py-5 dark:border-white/8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold tracking-[-0.03em]">Recent incoming payments</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Latest confirmed transfers sent directly to the canonical wallet.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-full border-border/70 px-3 text-muted-foreground dark:border-white/10">
                      @{result.username}
                    </Badge>
                    <Badge variant="outline" className="rounded-full border-border/70 px-3 text-muted-foreground dark:border-white/10">
                      <ShieldCheck className="mr-1 size-3.5" />
                      Public view
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="px-5 py-5">
                <PaymentTable
                  counterpartyColumnLabel="Sender"
                  emptyDescription="No confirmed incoming transfers were found for this handle yet."
                  emptyTitle="Nothing received yet"
                  rows={result.recentIncomingPayments.map((payment) => ({
                    id: payment.id,
                    counterpartyLabel: truncateAddress(payment.senderAddress),
                    counterpartySubLabel: 'Sender wallet',
                    amount: receivedPaymentDisplay(payment),
                    status: 'Confirmed',
                    date: payment.createdAt,
                    txUrl: explorerUrl(NETWORK, payment.txDigest),
                  }))}
                  showTxLink
                />
              </div>
            </section>

            <section className="mx-auto mt-8 grid w-full max-w-5xl gap-4 md:grid-cols-2">
              <div className="metric-card">
                <p className="section-eyebrow">How it works</p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                  New transfers resolve a canonical Privy-backed Sui wallet for the X account and send there directly.
                </p>
              </div>
              <div className="metric-card">
                <p className="section-eyebrow">Next step</p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.03em]">
                  {result.walletReady
                    ? 'The canonical wallet is live and can receive assets immediately.'
                    : 'The wallet will be provisioned automatically the first time someone sends to this handle or when the user signs in.'}
                </p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Wallet className="size-4 text-primary" />
                  Direct wallet delivery replaces the old claim flow.
                </p>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
