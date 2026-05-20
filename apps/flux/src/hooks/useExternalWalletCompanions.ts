'use client';

import { useCurrentAccount, useCurrentWallet } from '@mysten/dapp-kit-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import {
  detectCompanionProvider,
  probeCompanions,
  subscribeCompanionChanges,
  type CompanionAddresses,
  type CompanionProviderName,
} from '@/lib/wallet-companion';

export interface ExternalWalletCompanionsResult {
  providerName: CompanionProviderName | null;
  addresses: CompanionAddresses;
  isReady: boolean;
}

const EMPTY_ADDRESSES: CompanionAddresses = Object.freeze(
  {},
) as CompanionAddresses;
const STALE_MS = 30_000;

const buildQueryKey = (
  providerName: CompanionProviderName | null,
  externalSuiAddress: string | undefined,
) => ['wallet-companion', providerName, externalSuiAddress] as const;

/**
 * Returns companion addresses (EVM / Solana / Bitcoin) belonging to the
 * external multi-chain wallet the user has connected via Sui dApp-Kit, when
 * that wallet is a known multi-chain provider (Phantom / OKX / Backpack).
 *
 * Always silent — never opens a connect popup. If no external Sui wallet is
 * connected, or the connected wallet is not a known multi-chain provider,
 * `providerName` is `null` and `addresses` is empty. Listens for
 * accountsChanged events and invalidates the cache so addresses follow.
 */
export const useExternalWalletCompanions =
  (): ExternalWalletCompanionsResult => {
    const externalSuiAccount = useCurrentAccount();
    const externalSuiWallet = useCurrentWallet();
    const queryClient = useQueryClient();

    const providerName = useMemo(
      () => detectCompanionProvider(externalSuiWallet?.name ?? null),
      [externalSuiWallet?.name],
    );

    const externalSuiAddress = externalSuiAccount?.address;
    const queryEnabled = Boolean(providerName && externalSuiAddress);

    const { data, isSuccess } = useQuery({
      queryKey: buildQueryKey(providerName, externalSuiAddress),
      queryFn: () =>
        providerName
          ? probeCompanions(providerName)
          : Promise.resolve(EMPTY_ADDRESSES),
      enabled: queryEnabled,
      staleTime: STALE_MS,
      refetchOnWindowFocus: false,
    });

    useEffect(() => {
      if (!providerName || !externalSuiAddress) {
        return;
      }
      const unsubscribe = subscribeCompanionChanges(providerName, () => {
        queryClient.invalidateQueries({ queryKey: ['wallet-companion'] });
      });
      return unsubscribe;
    }, [providerName, externalSuiAddress, queryClient]);

    return {
      providerName,
      addresses: queryEnabled && data ? data : EMPTY_ADDRESSES,
      isReady: queryEnabled ? isSuccess : true,
    };
  };
