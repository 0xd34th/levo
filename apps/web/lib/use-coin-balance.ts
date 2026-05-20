'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeAccountDataRefresh } from '@/lib/account-refresh';
import { getSuiClient } from '@/lib/sui';

/**
 * Fetches the raw balance (base units as string) for a specific coin type.
 * Re-fetches when address or coinType changes, and after send/earn events.
 */
export function useCoinBalance(
  address: string | null | undefined,
  coinType: string,
) {
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const client = getSuiClient();
      const result = await client.getBalance({ owner: address, coinType });

      if (controller.signal.aborted) return;
      setBalance(result.totalBalance);
    } catch {
      if (controller.signal.aborted) return;
      setBalance(null);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [address, coinType]);

  useEffect(() => {
    void fetchBalance();
    return () => abortRef.current?.abort();
  }, [fetchBalance]);

  useEffect(() => {
    return subscribeAccountDataRefresh(() => {
      setTimeout(() => void fetchBalance(), 1500);
    });
  }, [fetchBalance]);

  return { balance, loading, refetch: fetchBalance };
}
