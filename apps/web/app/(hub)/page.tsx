'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { Wallet } from 'lucide-react';
import { ActionButtonRow } from '@/components/action-button-row';
import { BalanceDisplay } from '@/components/balance-display';
import { PaymentTable } from '@/components/payment-table';
import { PromoCard } from '@/components/promo-card';
import { Button } from '@/components/ui/button';
import { subscribeAccountDataRefresh } from '@/lib/account-refresh';
import {
  getExplorerTransactionUrl,
} from '@/lib/coins';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';
import type { IncomingPaymentsResponse } from '@/lib/received-dashboard-client';
import {
  buildRecentActivityItems,
  type RecentActivityItem,
} from '@/lib/recent-activity';
import { truncateAddress } from '@/lib/received-dashboard-client';
import type { TransactionHistoryResponse } from '@/lib/transaction-history';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
const RECENT_LIMIT = 5;

export default function AccountPage() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const {
    suiAddress: embeddedWalletAddress,
    loading: walletLoading,
  } = useEmbeddedWallet();
  const twitterSubject = user?.twitter?.subject ?? null;

  // Recent transactions
  const [recentItems, setRecentItems] = useState<RecentActivityItem[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchRecent = useCallback(async () => {
    if (!embeddedWalletAddress) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setRecentLoading(true);

    try {
      const sentParams = new URLSearchParams({
        senderAddress: embeddedWalletAddress,
        limit: String(RECENT_LIMIT),
      });
      const receivedParams = new URLSearchParams({
        limit: String(RECENT_LIMIT),
      });

      const sentRequest = privyAuthenticatedFetch(
        getAccessToken,
        `/api/v1/payments/history?${sentParams}`,
        { cache: 'no-store', signal: controller.signal },
      ).then(async (res) => {
        if (!res.ok) {
          throw new Error('Failed to load sent payments');
        }

        return res.json() as Promise<TransactionHistoryResponse>;
      });

      const receivedRequest = twitterSubject
        ? privyAuthenticatedFetch(
            getAccessToken,
            `/api/v1/payments/received?${receivedParams}`,
            { cache: 'no-store', signal: controller.signal },
          ).then(async (res) => {
            if (!res.ok) {
              throw new Error('Failed to load received payments');
            }

            return res.json() as Promise<IncomingPaymentsResponse>;
          })
        : null;

      const [sentResult, receivedResult] = await Promise.all([
        sentRequest.catch(() => null),
        receivedRequest?.catch(() => null) ?? Promise.resolve(null),
      ]);

      if (controller.signal.aborted) return;

      setRecentItems(
        buildRecentActivityItems(
          sentResult?.items ?? [],
          receivedResult?.items ?? [],
          RECENT_LIMIT,
        ),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
    } finally {
      if (!controller.signal.aborted) setRecentLoading(false);
    }
  }, [embeddedWalletAddress, getAccessToken, twitterSubject]);

  useEffect(() => {
    if (ready && authenticated && embeddedWalletAddress) {
      void fetchRecent();
    }
    return () => controllerRef.current?.abort();
  }, [ready, authenticated, embeddedWalletAddress, fetchRecent]);

  useEffect(() => {
    return subscribeAccountDataRefresh(() => {
      if (ready && authenticated && embeddedWalletAddress) {
        void fetchRecent();
      }
    });
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

      <ActionButtonRow depositHref={embeddedWalletAddress ? '/deposit' : undefined} />

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
              counterpartyColumnLabel="Counterparty"
              emptyTitle="No transactions yet"
              emptyDescription="Your recent sent and received payments will show here."
              rows={recentItems.map((item) => ({
                id: item.id,
                counterpartyAvatarUrl: item.counterpartyAvatarUrl,
                counterpartyLabel: item.counterpartyLabel,
                counterpartySubLabel: item.counterpartySubLabel,
                amount: item.amount,
                status: item.direction,
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
