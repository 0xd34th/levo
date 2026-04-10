'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeAccountDataRefresh } from '@/lib/account-refresh';
import { getSuiClient } from '@/lib/sui';
import { SUI_COIN_TYPE, formatAmount, getCoinLabel, isDisplaySupportedCoinType } from '@/lib/coins';

interface BalanceEntry {
  coinType: string;
  totalBalance: string;
}

interface BalanceDisplayProps {
  address: string | null;
}

export function BalanceDisplay({ address }: BalanceDisplayProps) {
  const [balances, setBalances] = useState<BalanceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!address) {
      setBalances([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const client = getSuiClient();
      const result = await client.getAllBalances({ owner: address });

      if (controller.signal.aborted) return;

      setBalances(
        result
          .filter((b: { coinType: string }) => isDisplaySupportedCoinType(b.coinType))
          .map((b: { coinType: string; totalBalance: string }) => ({
            coinType: b.coinType,
            totalBalance: b.totalBalance,
          })),
      );
    } catch {
      if (controller.signal.aborted) return;
      setBalances([]);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [address]);

  useEffect(() => {
    void fetchBalances();
    return () => abortRef.current?.abort();
  }, [fetchBalances]);

  useEffect(() => {
    return subscribeAccountDataRefresh(() => {
      // Delay to let the Sui fullnode index the new balance after send/earn flows.
      setTimeout(() => void fetchBalances(), 1500);
    });
  }, [fetchBalances]);

  // Find SUI balance as primary display
  const suiBalance = balances.find((b) => b.coinType === SUI_COIN_TYPE);
  const otherBalances = balances.filter((b) => b.coinType !== SUI_COIN_TYPE);

  const primaryDisplay = suiBalance
    ? `${formatAmount(suiBalance.totalBalance, SUI_COIN_TYPE)} SUI`
    : '0 SUI';

  return (
    <div className="flex flex-col items-center py-6">
      {loading && balances.length === 0 ? (
        <div className="h-12 w-32 animate-pulse rounded-xl bg-secondary/60" />
      ) : (
        <>
          <p className="text-4xl font-semibold tracking-tight font-display">
            {primaryDisplay}
          </p>
          {otherBalances.length > 0 ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {otherBalances
                .map((b) => `${formatAmount(b.totalBalance, b.coinType)} ${getCoinLabel(b.coinType)}`)
                .join(' + ')}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">Balance</p>
        </>
      )}
    </div>
  );
}
