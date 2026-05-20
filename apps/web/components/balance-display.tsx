'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeAccountDataRefresh } from '@/lib/account-refresh';
import { getSuiClient } from '@/lib/sui';
import {
  MAINNET_USDC_TYPE,
  SUI_COIN_TYPE,
  formatAmount,
  getCoinLabel,
  getUserFacingUsdcCoinType,
  isDisplaySupportedCoinType,
  normalizeCoinType,
  normalizeCoinTypeForDisplay,
} from '@/lib/coins';

interface BalanceEntry {
  coinType: string;
  totalBalance: string;
}

interface BalanceDisplayProps {
  address: string | null;
}

/**
 * v3 BalanceBlock — huge left-aligned dollar figure, soft label above,
 * APY sub-line in forest green. USDC is the primary unit of account.
 */
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
            coinType: normalizeCoinType(normalizeCoinTypeForDisplay(b.coinType)),
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
      setTimeout(() => void fetchBalances(), 1500);
    });
  }, [fetchBalances]);

  const usdcCoinType = getUserFacingUsdcCoinType() ?? MAINNET_USDC_TYPE;
  const usdcLookupKey = normalizeCoinType(normalizeCoinTypeForDisplay(usdcCoinType));
  const suiLookupKey = normalizeCoinType(SUI_COIN_TYPE);
  const usdcBalance = balances.find((b) => b.coinType === usdcLookupKey);
  const suiBalance = balances.find((b) => b.coinType === suiLookupKey);

  // USDC-first: integer and fractional parts rendered separately for a softer cents treatment.
  const { integer, fraction } = useMemo(() => {
    const raw = usdcBalance ? formatAmount(usdcBalance.totalBalance, usdcCoinType) : '0.00';
    const [wholeRaw, fracRaw = '00'] = raw.split('.');
    const whole = Number(wholeRaw || '0').toLocaleString('en-US');
    const frac = fracRaw.slice(0, 2).padEnd(2, '0');
    return { integer: whole, fraction: frac };
  }, [usdcBalance, usdcCoinType]);

  if (loading && balances.length === 0) {
    return (
      <div className="px-1 pb-7 pt-1">
        <div className="h-4 w-20 animate-pulse rounded-full bg-surface" />
        <div className="mt-3 h-12 w-56 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  return (
    <div className="px-1 pb-7 pt-1">
      <div className="text-[17px]" style={{ color: 'var(--text-soft)' }}>
        Balance
      </div>
      <div
        className="mt-1 flex items-baseline gap-0 tabular-nums"
        style={{
          fontFamily: 'var(--font-sans)',
          fontWeight: 700,
          letterSpacing: '-0.035em',
          lineHeight: 1.02,
        }}
      >
        <span
          className="mr-0.5"
          style={{ fontSize: 38, fontWeight: 600, color: 'var(--foreground)' }}
        >
          $
        </span>
        <span style={{ fontSize: 52 }}>{integer}</span>
        <span style={{ fontSize: 32, color: 'var(--text-mute)' }}>.{fraction}</span>
      </div>
      <div
        className="mt-2 text-[13px]"
        style={{ color: 'var(--text-soft)' }}
      >
        {suiBalance && BigInt(suiBalance.totalBalance) > 0n ? (
          <>
            <span className="mono-nums">
              {formatAmount(suiBalance.totalBalance, SUI_COIN_TYPE)} {getCoinLabel(SUI_COIN_TYPE)}
            </span>{' '}
            for gas · USDC earns yield on Sui
          </>
        ) : (
          <>Stablecoin wallet · settles in ~2s on Sui</>
        )}
      </div>
    </div>
  );
}
