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
    navigator.clipboard
      .writeText(embeddedWalletAddress)
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
  }, [embeddedWalletAddress]);

  return (
    <div className="flex flex-col gap-2.5">
      <PromoCard
        icon={Search}
        tile="ink"
        title="Recipient lookup"
        description="Check if an X handle has a canonical wallet ready."
        href="/lookup"
      />

      {ready && authenticated && embeddedWalletAddress ? (
        <>
          <PromoCard
            icon={Wallet}
            tile="blue"
            title="Your wallet"
            description={truncateAddress(embeddedWalletAddress)}
            action={
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-full bg-raise text-foreground transition-colors hover:bg-[color:var(--border-strong)]/20"
                onClick={(e) => {
                  e.stopPropagation();
                  copyAddress();
                }}
              >
                {copied ? (
                  <Check className="size-4" style={{ color: 'var(--up)' }} />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            }
          />

          <PromoCard
            icon={ExternalLink}
            tile="ink"
            title="View on explorer"
            description={`Suiscan ${NETWORK}`}
            externalHref={explorerAddressUrl(embeddedWalletAddress)}
          />
        </>
      ) : null}
    </div>
  );
}
