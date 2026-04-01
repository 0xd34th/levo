'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { Wallet } from 'lucide-react';
import { ActionButtonRow } from '@/components/action-button-row';
import { BalanceDisplay } from '@/components/balance-display';
import { ClaimCard } from '@/components/claim-card';
import { PaymentTable } from '@/components/payment-table';
import { PromoCard } from '@/components/promo-card';
import { Button } from '@/components/ui/button';
import {
  formatAmount,
  getCoinLabel,
  getExplorerTransactionUrl,
  isDisplaySupportedCoinType,
} from '@/lib/coins';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';
import { truncateAddress } from '@/lib/received-dashboard-client';
import type { TransactionHistoryResponse, TransactionItem } from '@/lib/transaction-history';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
const RECENT_LIMIT = 5;

function formatSentAmount(amount: string, coinType: string) {
  if (!isDisplaySupportedCoinType(coinType)) return `${amount} raw`;
  return `${formatAmount(amount, coinType)} ${getCoinLabel(coinType)}`;
}

export default function AccountPage() {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const {
    suiAddress: embeddedWalletAddress,
    loading: walletLoading,
  } = useEmbeddedWallet();
  const [hasPending, setHasPending] = useState(false);

  // Recent transactions
  const [recentItems, setRecentItems] = useState<TransactionItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchRecent = useCallback(async () => {
    if (!embeddedWalletAddress) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRecentLoading(true);

    try {
      const params = new URLSearchParams({
        senderAddress: embeddedWalletAddress,
        limit: String(RECENT_LIMIT),
      });
      const res = await privyAuthenticatedFetch(
        getAccessToken,
        `/api/v1/payments/history?${params}`,
        { cache: 'no-store', signal: controller.signal },
      );

      if (controller.signal.aborted) return;
      if (!res.ok) throw new Error('fetch failed');

      const payload = (await res.json()) as TransactionHistoryResponse;
      if (!controller.signal.aborted) {
        setRecentItems(payload.items.slice(0, RECENT_LIMIT));
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    } finally {
      if (!controller.signal.aborted) setRecentLoading(false);
    }
  }, [embeddedWalletAddress, getAccessToken]);

  useEffect(() => {
    if (ready && authenticated && embeddedWalletAddress) {
      void fetchRecent();
    }
    return () => controllerRef.current?.abort();
  }, [ready, authenticated, embeddedWalletAddress, fetchRecent]);

  // Unauthenticated state
  if (ready && !authenticated) {
    return (
      <div className="flex flex-col items-center pt-16 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-lg">
          L
        </span>
        <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">
          Send money to any X handle
        </h1>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          Enter a handle, set an amount, and move stablecoins in one clean motion on Sui.
        </p>
        <Button
          className="mt-8 h-12 rounded-full px-8 text-base font-semibold"
          onClick={() => {
            void initOAuth({ provider: 'twitter' }).catch(() => {});
          }}
        >
          Sign in with X
        </Button>
      </div>
    );
  }

  // Loading state
  if (!ready) {
    return (
      <div className="flex items-center justify-center pt-20">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Full-width hero: Balance + Actions */}
      <BalanceDisplay address={embeddedWalletAddress} />

      <ActionButtonRow
        depositHref={embeddedWalletAddress ? '/deposit' : undefined}
        showClaim={hasPending}
        onClaim={() => {
          document.getElementById('claim-card')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <div id="claim-card">
        <ClaimCard onPendingChange={setHasPending} />
      </div>

      {embeddedWalletAddress ? (
        <PromoCard
          icon={Wallet}
          title="Embedded wallet"
          description={truncateAddress(embeddedWalletAddress)}
          href="/deposit"
        />
      ) : walletLoading ? (
        <PromoCard
          icon={Wallet}
          title="Setting up wallet"
          description="Your embedded Sui wallet is being created..."
        />
      ) : null}

      {/* Recent Transactions */}
      {embeddedWalletAddress ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Recent</p>
            <Link href="/activity" className="text-xs font-medium text-primary">
              View all
            </Link>
          </div>
          {recentLoading ? (
            <p className="py-6 text-center text-xs text-muted-foreground">Loading...</p>
          ) : (
            <PaymentTable
              counterpartyColumnLabel="Recipient"
              emptyTitle="No transactions yet"
              emptyDescription="Send your first payment to see it here."
              rows={recentItems.map((item) => ({
                id: item.id,
                counterpartyAvatarUrl: item.recipient.profilePicture,
                counterpartyLabel: `@${item.recipient.username}`,
                amount: formatSentAmount(item.amount, item.coinType),
                status: 'Confirmed',
                date: item.createdAt,
                txUrl: getExplorerTransactionUrl(NETWORK, item.txDigest),
              }))}
              showTxLink
            />
          )}
        </div>
      ) : null}
    </div>
  );
}
