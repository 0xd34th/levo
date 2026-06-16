'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { Check, Copy, Twitter } from 'lucide-react';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { PaymentTable } from '@/components/payment-table';
import { getExplorerTransactionUrl } from '@/lib/coins';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';
import { cn } from '@/lib/utils';
import type { WalletActivityItem, WalletActivityResponse } from '@/lib/wallet-activity';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
const STABLECOIN_LABEL = NETWORK === 'mainnet' ? 'USDC' : 'TEST_USDC';
const RECEIVED_REFRESH_INTERVAL_MS = 15_000;

export default function DepositPage() {
  const { getAccessToken } = usePrivy();
  const { suiAddress, loading, error } = useEmbeddedWallet();
  const [copied, setCopied] = useState(false);
  const [currency, setCurrency] = useState<'USDC' | 'SUI'>('USDC');
  const [receivedItems, setReceivedItems] = useState<WalletActivityItem[]>([]);
  const copyTimeoutRef = useRef<number | null>(null);
  const activityControllerRef = useRef<AbortController | null>(null);

  const copyAddress = useCallback(() => {
    if (!suiAddress) return;
    navigator.clipboard
      .writeText(suiAddress)
      .then(() => {
        if (copyTimeoutRef.current !== null) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        setCopied(true);
        copyTimeoutRef.current = window.setTimeout(() => {
          copyTimeoutRef.current = null;
          setCopied(false);
        }, 2000);
      })
      .catch(() => {});
  }, [suiAddress]);

  const fetchReceivedTransfers = useCallback(async () => {
    if (!suiAddress || (typeof document !== 'undefined' && document.hidden)) return;

    activityControllerRef.current?.abort();
    const controller = new AbortController();
    activityControllerRef.current = controller;

    try {
      const params = new URLSearchParams({
        address: suiAddress,
        limit: '20',
      });
      const response = await privyAuthenticatedFetch(
        getAccessToken,
        `/api/v1/activity?${params}`,
        { cache: 'no-store', signal: controller.signal },
      );

      if (controller.signal.aborted) return;
      if (!response.ok) {
        throw new Error('Failed to load received transfers');
      }

      const payload = (await response.json()) as WalletActivityResponse;
      if (controller.signal.aborted) return;
      setReceivedItems(payload.items.filter((item) => item.direction === 'incoming'));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }, [getAccessToken, suiAddress]);

  useEffect(() => {
    if (!suiAddress) {
      setReceivedItems([]);
      activityControllerRef.current?.abort();
      return;
    }

    void fetchReceivedTransfers();
    const intervalId = window.setInterval(() => {
      void fetchReceivedTransfers();
    }, RECEIVED_REFRESH_INTERVAL_MS);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        activityControllerRef.current?.abort();
        return;
      }
      void fetchReceivedTransfers();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      activityControllerRef.current?.abort();
    };
  }, [fetchReceivedTransfers, suiAddress]);

  const receivedRows = useMemo(() => {
    return [...receivedItems]
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        counterpartyLabel: item.counterpartyLabel,
        counterpartySubLabel: item.counterpartySubLabel,
        counterpartyAvatarUrl: item.counterpartyAvatarUrl,
        amount: item.amountLabel,
        status: 'Confirmed',
        direction: 'incoming' as const,
        date: item.createdAt,
        txUrl: getExplorerTransactionUrl(NETWORK, item.txDigest),
      }));
  }, [receivedItems]);

  return (
    <div className="min-h-screen bg-background">
      <MobileTopBar title="Request" backHref="/" />

      <main className="mx-auto w-full max-w-lg px-5 pb-16 pt-3">
        {loading ? (
          <p
            className="py-20 text-center text-[14px]"
            style={{ color: 'var(--text-mute)' }}
          >
            Setting up wallet…
          </p>
        ) : error ? (
          <p
            className="py-20 text-center text-[14px]"
            style={{ color: 'var(--down)' }}
          >
            {error}
          </p>
        ) : suiAddress ? (
          <div className="flex flex-col gap-2.5">
            {/* Currency toggle */}
            <div className="inline-flex w-fit items-center rounded-full bg-surface p-[4px]">
              {(['USDC', 'SUI'] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  onClick={() => setCurrency(x)}
                  className={cn(
                    'rounded-full px-5 py-2 text-[13px] font-medium transition-colors',
                    currency === x
                      ? 'bg-foreground text-background'
                      : 'text-foreground',
                  )}
                  style={currency !== x ? { color: 'var(--text-soft)' } : undefined}
                >
                  {x === 'USDC' ? STABLECOIN_LABEL.replace('_', ' ') : x}
                </button>
              ))}
            </div>

            {/* QR card */}
            <div className="flex flex-col items-center rounded-[24px] bg-surface px-5 py-7">
              <div className="rounded-[18px] bg-background p-4">
                <Image
                  loader={({ src }) => src}
                  unoptimized
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(suiAddress)}&bgcolor=ffffff&color=0e0e10&qzone=0`}
                  alt="Wallet QR code"
                  className="size-[220px] rounded-[6px]"
                  width={220}
                  height={220}
                />
              </div>
              <div className="mt-4 text-center">
                <p className="text-[18px] font-semibold tracking-[-0.01em]">
                  Scan to send {currency}
                </p>
                <p
                  className="mt-1 text-[13px]"
                  style={{ color: 'var(--text-mute)' }}
                >
                  Settles in ~2s · Sui {NETWORK}
                </p>
              </div>
            </div>

            {/* Address row */}
            <div className="flex items-center gap-3 rounded-[16px] bg-surface px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="eyebrow mb-1">Sui address</p>
                <p
                  className="mono-nums truncate text-[13px] font-medium"
                  title={suiAddress}
                >
                  {suiAddress}
                </p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-raise px-3.5 text-[13px] font-medium transition-colors hover:bg-[color:var(--border-strong)]/20"
                onClick={copyAddress}
              >
                {copied ? (
                  <>
                    <Check className="size-[15px]" style={{ color: 'var(--up)' }} />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-[15px]" />
                    Copy
                  </>
                )}
              </button>
            </div>

            {/* Share via X */}
            <div className="flex items-center gap-3 rounded-[16px] bg-surface px-4 py-3.5">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white"
                style={{ background: 'var(--tile-ink)' }}
              >
                <Twitter className="size-[18px]" strokeWidth={1.8} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium">Share your @handle</p>
                <p
                  className="mt-0.5 text-[13px]"
                  style={{ color: 'var(--text-mute)' }}
                >
                  Anyone on X can send {STABLECOIN_LABEL} to you.
                </p>
              </div>
            </div>

            <section className="pt-2">
              <div className="flex items-center justify-between px-1 pb-2">
                <div
                  className="text-[15px] font-semibold"
                  style={{ color: 'var(--text-soft)' }}
                >
                  Received transfers
                </div>
              </div>
              <PaymentTable
                counterpartyColumnLabel="Sender"
                emptyTitle="No received transfers yet"
                emptyDescription="Incoming wallet activity will show here after it settles."
                rows={receivedRows}
                showTxLink
              />
            </section>
          </div>
        ) : null}
      </main>
    </div>
  );
}
