'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Search,
  Twitter,
  Wallet,
} from 'lucide-react';
import { ActionButtonRow } from '@/components/action-button-row';
import { BalanceDisplay } from '@/components/balance-display';
import { FeatureGrid } from '@/components/feature-grid';
import { PaymentTable } from '@/components/payment-table';
import { PromoCard } from '@/components/promo-card';
import { Wordmark } from '@/components/wordmark';
import { Button } from '@/components/ui/button';
import { subscribeAccountDataRefresh } from '@/lib/account-refresh';
import { getExplorerTransactionUrl } from '@/lib/coins';
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
        if (!res.ok) throw new Error('Failed to load sent payments');
        return res.json() as Promise<TransactionHistoryResponse>;
      });

      const receivedRequest = twitterSubject
        ? privyAuthenticatedFetch(
            getAccessToken,
            `/api/v1/payments/received?${receivedParams}`,
            { cache: 'no-store', signal: controller.signal },
          ).then(async (res) => {
            if (!res.ok) throw new Error('Failed to load received payments');
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

  // Unauthenticated welcome — quiet masthead + single CTA.
  if (ready && !authenticated) {
    return (
      <div className="flex flex-col pt-4">
        <Wordmark size={28} className="mb-6" />
        <h1
          className="text-[34px] font-semibold leading-[1.05] tracking-[-0.025em]"
          style={{ textWrap: 'balance' }}
        >
          A quiet wallet for
          <br />
          stablecoins on Sui.
        </h1>
        <p
          className="mt-4 max-w-sm text-[15px] leading-[1.45]"
          style={{ color: 'var(--text-soft)' }}
        >
          Send USDC to any <span className="text-foreground">@handle</span>, earn
          yield on idle balances, and watch it all settle in about two seconds.
        </p>
        <Button
          className="mt-8 h-[54px] w-full max-w-sm rounded-[16px] text-[16px]"
          onClick={() => {
            void initOAuth({ provider: 'twitter' }).catch(() => {});
          }}
        >
          <span className="inline-flex items-center gap-2">
            Sign in with X
            <ArrowRight className="size-4" />
          </span>
        </Button>
        <p
          className="mt-4 text-[12px]"
          style={{ color: 'var(--text-mute)' }}
        >
          Your embedded Sui wallet is provisioned on sign-in — no seed phrases.
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center pt-20">
        <p className="text-[14px]" style={{ color: 'var(--text-mute)' }}>
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BalanceDisplay address={embeddedWalletAddress} />

      <ActionButtonRow depositHref={embeddedWalletAddress ? '/deposit' : undefined} />

      {embeddedWalletAddress ? (
        <PromoCard
          icon={Banknote}
          tile="green"
          title="Set up direct deposit"
          description="Get paid in USDC and earn yield from the moment it lands."
          href="/deposit"
        />
      ) : walletLoading ? (
        <PromoCard
          icon={Wallet}
          tile="ink"
          title="Setting up wallet"
          description="Your embedded Sui wallet is being created…"
        />
      ) : null}

      {embeddedWalletAddress ? (
        <>
          <div className="flex items-center justify-between pt-1">
            <div
              className="text-[15px] font-semibold"
              style={{ color: 'var(--text-soft)' }}
            >
              Get started
            </div>
            <div
              className="text-[14px]"
              style={{ color: 'var(--text-mute)' }}
            >
              Explore
            </div>
          </div>

          <FeatureGrid
            items={[
              {
                icon: BadgeCheck,
                tile: 'blue',
                title: 'Your embedded wallet',
                body: truncateAddress(embeddedWalletAddress),
                href: '/deposit',
              },
              {
                icon: Twitter,
                tile: 'ink',
                title: 'Pay any @handle',
                body: 'Send USDC to anyone on X — no wallet address.',
                href: '/send',
              },
            ]}
          />

          <FeatureGrid
            items={[
              {
                icon: Search,
                tile: 'ink',
                title: 'Recipient lookup',
                body: 'Check if a handle has a canonical wallet ready.',
                href: '/lookup',
              },
              {
                icon: Wallet,
                tile: 'ink',
                title: 'Wallet tools',
                body: 'View on Suiscan, copy address, and more.',
                href: '/tools',
              },
            ]}
          />

          <div className="flex items-center justify-between pt-4">
            <div
              className="text-[15px] font-semibold"
              style={{ color: 'var(--text-soft)' }}
            >
              Recent activity
            </div>
            <Link
              href="/activity"
              className="text-[14px] font-medium text-foreground"
            >
              See all
            </Link>
          </div>

          {recentLoading ? (
            <div className="rounded-[18px] bg-surface px-6 py-10 text-center">
              <p className="text-[13px]" style={{ color: 'var(--text-mute)' }}>
                Loading…
              </p>
            </div>
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
                status: 'Confirmed',
                direction: item.direction === 'Received' ? 'incoming' : 'outgoing',
                date: item.createdAt,
                txUrl: getExplorerTransactionUrl(NETWORK, item.txDigest),
              }))}
              showTxLink
            />
          )}
        </>
      ) : null}
    </div>
  );
}
