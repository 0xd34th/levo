'use client';

import { ChainType } from '@lifi/sdk';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { useMemo } from 'react';
import { useWalletFleet } from './useWalletFleet';

/**
 * Returns the set of destination chain types the user currently has a
 * receivable address on (Privy embedded fleet + Sui dApp-Kit external).
 *
 * `undefined` means "no constraint" — the user has not authenticated yet,
 * so we let them browse routes across all destinations. A non-empty set
 * means "constrain to these ecosystems"; an empty set means "user is
 * authenticated but somehow has no addresses" — caller should treat as
 * empty filter.
 */
export const useAvailableToChainTypes = (): Set<ChainType> | undefined => {
  const walletFleet = useWalletFleet();
  const externalSuiAccount = useCurrentAccount();

  return useMemo(() => {
    const wallets = walletFleet.data?.wallets;
    const fleetReady = Boolean(wallets);
    const hasSuiExternal = Boolean(externalSuiAccount?.address);

    if (!fleetReady && !hasSuiExternal) {
      return undefined;
    }

    const set = new Set<ChainType>();
    if (wallets?.evm?.address) {
      set.add(ChainType.EVM);
    }
    if (wallets?.solana?.address) {
      set.add(ChainType.SVM);
    }
    if (wallets?.sui?.address) {
      set.add(ChainType.MVM);
    }
    if (wallets?.bitcoin?.address) {
      set.add(ChainType.UTXO);
    }
    if (hasSuiExternal) {
      set.add(ChainType.MVM);
    }
    return set;
  }, [walletFleet.data, externalSuiAccount?.address]);
};
