'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { Check, Copy } from 'lucide-react';
import { MobileTopBar } from '@/components/mobile-top-bar';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
const STABLECOIN_LABEL = NETWORK === 'mainnet' ? 'USDC' : 'TEST_USDC';

export default function DepositPage() {
  const { suiAddress, loading, error } = useEmbeddedWallet();
  const [copied, setCopied] = useState(false);
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
    <div className="min-h-screen">
      <MobileTopBar title="Deposit" backHref="/" />

      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-8">
        {loading ? (
          <p className="py-20 text-center text-sm text-muted-foreground">
            Setting up wallet...
          </p>
        ) : error ? (
          <p className="py-20 text-center text-sm text-destructive">{error}</p>
        ) : suiAddress ? (
          <div className="flex flex-col items-center gap-6">
            {/* QR Code */}
            <div className="rounded-2xl border border-border/60 bg-card p-4 dark:border-white/8">
              <Image
                loader={({ src }) => src}
                unoptimized
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(suiAddress)}`}
                alt="Wallet QR code"
                className="size-48 rounded-lg"
                width={200}
                height={200}
              />
            </div>

            {/* Address + copy */}
            <div className="w-full rounded-2xl border border-border/60 bg-card dark:border-white/8">
              <div className="flex items-center gap-2 p-3">
                <p className="min-w-0 flex-1 break-all text-sm font-mono text-foreground">
                  {suiAddress}
                </p>
                <button
                  type="button"
                  className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 transition-colors hover:bg-secondary dark:border-white/10"
                  onClick={copyAddress}
                  aria-label="Copy address"
                >
                  {copied ? (
                    <Check className="size-4 text-accent" />
                  ) : (
                    <Copy className="size-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              {copied ? (
                <p className="border-t border-border/60 px-3 py-2 text-center text-xs font-medium text-accent dark:border-white/8">
                  Copied to clipboard
                </p>
              ) : null}
            </div>

            <p className="text-center text-sm text-muted-foreground">
              Send <span className="font-medium text-foreground">SUI</span> or{' '}
              <span className="font-medium text-foreground">{STABLECOIN_LABEL}</span> to
              this address to fund your wallet.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
