'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, Copy, Twitter } from 'lucide-react';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';
import { cn } from '@/lib/utils';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
const STABLECOIN_LABEL = NETWORK === 'mainnet' ? 'USDC' : 'TEST_USDC';

export default function DepositPage() {
  const { suiAddress, loading, error } = useEmbeddedWallet();
  const [copied, setCopied] = useState(false);
  const [currency, setCurrency] = useState<'USDC' | 'SUI'>('USDC');
  const copyTimeoutRef = useRef<number | null>(null);

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
          </div>
        ) : null}
      </main>
    </div>
  );
}
