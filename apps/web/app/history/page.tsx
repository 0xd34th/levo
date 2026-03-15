'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useDAppKit, useCurrentAccount } from '@mysten/dapp-kit-react';
import { TransactionList } from '@/components/transaction-list';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { TransactionHistoryResponse, TransactionItem } from '@/lib/transaction-history';

const ConnectButton = dynamic(
  () => import('@mysten/dapp-kit-react/ui').then((m) => m.ConnectButton),
  { ssr: false },
);

const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';

export default function HistoryPage() {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const activeAddressRef = useRef<string | null>(account?.address ?? null);
  activeAddressRef.current = account?.address ?? null;
  const loadingMoreRef = useRef(false);
  const loadMoreRequestIdRef = useRef(0);
  const signatureRef = useRef<string | null>(null);

  const fetchHistory = useCallback(
    async (cursor?: string, signal?: AbortSignal) => {
      const address = account?.address;
      if (!address) return;

      const isStaleRequest = () => signal?.aborted || activeAddressRef.current !== address;
      const isLoadMore = !!cursor;
      let loadMoreRequestId: number | undefined;
      if (isLoadMore) {
        if (loadingMoreRef.current) return;
        loadMoreRequestId = loadMoreRequestIdRef.current + 1;
        loadMoreRequestIdRef.current = loadMoreRequestId;
        loadingMoreRef.current = true;
        setLoadingMore(true);
        setLoadMoreError(null);
      } else {
        setLoading(true);
        setError(null);
        setLoadMoreError(null);
      }

      try {
        for (let authAttempt = 0; authAttempt < 2; authAttempt += 1) {
          let signature = signatureRef.current;

          if (!signature) {
            const challengeParams = new URLSearchParams({ address });
            const challengeRes = await fetch(`/api/v1/wallet-auth/challenge?${challengeParams}`, {
              cache: 'no-store',
              credentials: 'same-origin',
              signal,
            });
            if (!challengeRes.ok) {
              throw new Error('Failed to authenticate wallet');
            }

            const challengeData = await challengeRes.json() as { message: string };

            if (isStaleRequest()) return;

            const authMessage = new TextEncoder().encode(challengeData.message);
            const signed = await dAppKit.signPersonalMessage({
              message: authMessage,
            });

            if (isStaleRequest()) return;

            signature = signed.signature;
            signatureRef.current = signature;
          }

          const params = new URLSearchParams({ senderAddress: address });
          if (cursor) params.set('cursor', cursor);

          const res = await fetch(`/api/v1/payments/history?${params}`, {
            credentials: 'same-origin',
            headers: {
              'x-wallet-signature': signature,
            },
            signal,
          });

          if (isStaleRequest()) return;

          if (res.status === 401 && signatureRef.current === signature) {
            signatureRef.current = null;
            if (authAttempt === 0) {
              continue;
            }
          }

          if (!res.ok) {
            throw new Error('Failed to load transactions');
          }

          const data = await res.json() as TransactionHistoryResponse;

          if (isStaleRequest()) return;

          if (isLoadMore) {
            setItems((prev) => [...prev, ...data.items]);
            setLoadMoreError(null);
          } else {
            setItems(data.items);
          }
          setNextCursor(data.nextCursor);
          return;
        }

        throw new Error('Failed to load transactions');
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (isStaleRequest()) return;
        if (isLoadMore) {
          setLoadMoreError('Failed to load more transactions. Please try again.');
        } else {
          setError('Failed to load transactions. Please try again.');
        }
      } finally {
        if (isLoadMore) {
          if (
            loadMoreRequestId !== undefined &&
            loadMoreRequestIdRef.current === loadMoreRequestId
          ) {
            loadingMoreRef.current = false;
            setLoadingMore(false);
          }
        } else if (!isStaleRequest()) {
          setLoading(false);
        }
      }
    },
    [account?.address, dAppKit],
  );

  useEffect(() => {
    signatureRef.current = null;
    loadMoreRequestIdRef.current += 1;
    loadingMoreRef.current = false;
    setLoading(false);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);
    setItems([]);
    setNextCursor(null);
    if (account?.address) {
      const controller = new AbortController();
      fetchHistory(undefined, controller.signal);
      return () => controller.abort();
    }
  }, [account?.address, fetchHistory]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Levo</h1>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/send" className="text-muted-foreground hover:text-foreground">
              Send
            </Link>
            <Link href="/history" className="text-foreground font-medium">
              History
            </Link>
          </nav>
        </div>
        <ConnectButton />
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pt-12 sm:pt-20">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
          </CardHeader>
          <CardContent>
            {!account ? (
              <p className="text-sm text-muted-foreground py-4">
                Connect your wallet to view transaction history.
              </p>
            ) : (
              <TransactionList
                items={items}
                loading={loading}
                error={error}
                onRetry={() => fetchHistory()}
                loadMoreError={loadMoreError}
                nextCursor={nextCursor}
                loadingMore={loadingMore}
                onLoadMore={() => fetchHistory(nextCursor ?? undefined)}
                network={NETWORK}
              />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
