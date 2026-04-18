'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { BadgeCheck, Search, ShieldCheck, Wallet } from 'lucide-react';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { PaymentTable } from '@/components/payment-table';
import { Button } from '@/components/ui/button';
import {
  Input,
  largeFormInputPrefixOffsetClass,
} from '@/components/ui/input';
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
import { cn } from '@/lib/utils';

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

      if (lookupRequestIdRef.current !== lookupRequestId) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: 'Lookup failed' }));
        throw new Error(payload.error ?? 'Lookup failed');
      }

      const payload = (await response.json()) as PublicLookupResponse;
      if (lookupRequestIdRef.current !== lookupRequestId) return;
      setResult(payload);
    } catch (lookupError) {
      if (controller.signal.aborted) return;
      if (lookupRequestIdRef.current !== lookupRequestId) return;
      setResult(null);
      setError(lookupError instanceof Error ? lookupError.message : 'Lookup failed');
    } finally {
      if (lookupAbortRef.current === controller) lookupAbortRef.current = null;
      if (lookupRequestIdRef.current === lookupRequestId) setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobileTopBar title="Recipient lookup" backHref="/tools" />

      <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-3 md:max-w-3xl">
        <section className="rounded-[20px] bg-surface px-4 py-4">
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
            <div className="relative flex-1">
              <span
                className={cn(
                  'pointer-events-none absolute top-1/2 -translate-y-1/2 text-[18px] font-medium',
                  largeFormInputPrefixOffsetClass,
                )}
                style={{ color: 'var(--text-mute)' }}
              >
                @
              </span>
              <Input
                className="h-[56px] rounded-[14px] border-0 bg-background pl-14 pr-5 text-[17px] font-medium placeholder:text-[color:var(--text-fade)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-0"
                maxLength={MAX_X_HANDLE_LENGTH + 1}
                placeholder="username"
                value={handle}
                onChange={(event) => setHandle(normalizeHandle(event.target.value))}
              />
            </div>
            <Button className="h-[56px] rounded-[14px] px-5" disabled={loading} type="submit">
              <Search className="size-4" />
              {loading ? 'Searching…' : 'Lookup'}
            </Button>
          </form>

          {error ? (
            <div
              className="mt-3 rounded-[12px] px-3 py-2 text-[13px]"
              style={{ background: 'var(--down-soft)', color: 'var(--down)' }}
            >
              {error}
            </div>
          ) : null}
        </section>

        {result ? (
          <>
            <section className="mt-5 grid gap-2.5 md:grid-cols-3">
              <div className="rounded-[18px] bg-surface px-4 py-4">
                <p className="eyebrow">Wallet ready</p>
                <p className="mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                  {walletReadyLabel(result.walletReady)}
                </p>
                <p
                  className="mono-nums mt-2 text-[13px]"
                  style={{ color: 'var(--text-mute)' }}
                >
                  {result.recipientAddress
                    ? truncateAddress(result.recipientAddress)
                    : 'Canonical wallet not yet provisioned.'}
                </p>
              </div>
              <div className="rounded-[18px] bg-surface px-4 py-4">
                <p className="eyebrow">Current wallet balance</p>
                <p className="tabular-nums mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                  {formatPendingBalances(result.pendingBalances)}
                </p>
                {untrackedBalanceNote(result.pendingBalances, result.recordedTotals) ? (
                  <p className="mt-2 text-[13px]" style={{ color: 'var(--text-mute)' }}>
                    {untrackedBalanceNote(result.pendingBalances, result.recordedTotals)}
                  </p>
                ) : null}
              </div>
              <div className="rounded-[18px] bg-surface px-4 py-4">
                <p className="eyebrow">Indexed received</p>
                <p className="tabular-nums mt-2 text-[22px] font-semibold tracking-[-0.02em]">
                  {formatPendingBalances(result.recordedTotals)}
                </p>
                <p className="mt-2 text-[13px]" style={{ color: 'var(--text-mute)' }}>
                  Confirmed transfers indexed for @{result.username}.
                </p>
              </div>
            </section>

            <section className="mt-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                <div>
                  <p className="text-[15px] font-semibold">Recent incoming payments</p>
                  <p className="mt-0.5 text-[13px]" style={{ color: 'var(--text-mute)' }}>
                    Latest confirmed transfers to the canonical wallet.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium"
                  >
                    <BadgeCheck className="size-3" />@{result.username}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-[12px] font-medium"
                    style={{ color: 'var(--text-mute)' }}
                  >
                    <ShieldCheck className="size-3" />
                    Public view
                  </span>
                </div>
              </div>

              <PaymentTable
                counterpartyColumnLabel="Sender"
                emptyDescription="No confirmed incoming transfers found yet."
                emptyTitle="Nothing received yet"
                rows={result.recentIncomingPayments.map((payment) => ({
                  id: payment.id,
                  counterpartyLabel: truncateAddress(payment.senderAddress),
                  counterpartySubLabel: 'Sender wallet',
                  amount: receivedPaymentDisplay(payment),
                  status: 'Confirmed',
                  direction: 'incoming',
                  date: payment.createdAt,
                  txUrl: explorerUrl(NETWORK, payment.txDigest),
                }))}
                showTxLink
              />
            </section>

            <section className="mt-5 grid gap-2.5 md:grid-cols-2">
              <div className="rounded-[18px] bg-surface px-4 py-4">
                <p className="eyebrow">How it works</p>
                <p className="mt-2 text-[15px] font-semibold tracking-[-0.005em]">
                  New transfers resolve a canonical Privy-backed Sui wallet for the X account and send there directly.
                </p>
              </div>
              <div className="rounded-[18px] bg-surface px-4 py-4">
                <p className="eyebrow">Next step</p>
                <p className="mt-2 text-[15px] font-semibold tracking-[-0.005em]">
                  {result.walletReady
                    ? 'The canonical wallet is live and can receive assets immediately.'
                    : 'The wallet is provisioned automatically the first time someone sends to this handle.'}
                </p>
                <p
                  className="mt-2 inline-flex items-center gap-2 text-[13px]"
                  style={{ color: 'var(--text-mute)' }}
                >
                  <Wallet className="size-4" />
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
