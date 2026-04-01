'use client';

import { useCallback, useRef, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Check, Copy, ExternalLink, Search, Wallet } from 'lucide-react';
import { PromoCard } from '@/components/promo-card';
import { truncateAddress } from '@/lib/received-dashboard-client';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

function explorerAddressUrl(address: string): string {
  return `https://suiscan.xyz/${NETWORK}/account/${address}`;
}

export default function ToolsPage() {
  const { ready, authenticated } = usePrivy();
  const { suiAddress: embeddedWalletAddress } = useEmbeddedWallet();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

  const copyAddress = useCallback(() => {
    if (!embeddedWalletAddress) return;
    navigator.clipboard.writeText(embeddedWalletAddress).then(() => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      setCopied(true);
      copyTimeoutRef.current = window.setTimeout(() => {
        copyTimeoutRef.current = null;
        setCopied(false);
      }, 2000);
    }).catch(() => {});
  }, [embeddedWalletAddress]);

  return (
    <div className="flex flex-col gap-3 md:grid md:grid-cols-2">
      <PromoCard
        icon={Search}
        title="Vault Lookup"
        description="Check if an X handle has pending funds"
        href="/lookup"
      />

      {ready && authenticated && embeddedWalletAddress ? (
        <>
          <PromoCard
            icon={Wallet}
            title="Your Wallet"
            description={truncateAddress(embeddedWalletAddress)}
            action={
              <button
                type="button"
                className="flex size-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:text-foreground dark:border-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  copyAddress();
                }}
              >
                {copied ? (
                  <Check className="size-3.5 text-accent" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            }
          />

          <PromoCard
            icon={ExternalLink}
            title="View on Explorer"
            description={`Suiscan ${NETWORK}`}
            externalHref={explorerAddressUrl(embeddedWalletAddress)}
          />
        </>
      ) : null}
    </div>
  );
}
