'use client';

import { ChainType } from '@lifi/sdk';
import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { useMemo } from 'react';
import { useExternalWalletCompanions } from './useExternalWalletCompanions';
import { useWalletFleet } from './useWalletFleet';

/**
 * Returns the set of destination chain types the user currently has a
 * receivable address on. Sources:
 *   - Privy embedded fleet (EVM / Solana / Sui / Bitcoin)
 *   - Sui dApp-Kit external wallet
 *   - External multi-chain wallet companion addresses (Phantom / OKX /
 *     Backpack on EVM / Solana / Bitcoin, when the wallet is connected via
 *     dApp-Kit for Sui)
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
  const companions = useExternalWalletCompanions();

  return useMemo(() => {
    const wallets = walletFleet.data?.wallets;
    const fleetReady = Boolean(wallets);
    const hasSuiExternal = Boolean(externalSuiAccount?.address);
    const hasCompanion =
      Boolean(companions.addresses.evm) ||
      Boolean(companions.addresses.solana) ||
      Boolean(companions.addresses.bitcoin);

    if (!fleetReady && !hasSuiExternal && !hasCompanion) {
      return undefined;
    }

    const set = new Set<ChainType>();
    if (wallets?.evm?.address || companions.addresses.evm) {
      set.add(ChainType.EVM);
    }
    if (wallets?.solana?.address || companions.addresses.solana) {
      set.add(ChainType.SVM);
    }
    if (wallets?.sui?.address || hasSuiExternal) {
      set.add(ChainType.MVM);
    }
    if (wallets?.bitcoin?.address || companions.addresses.bitcoin) {
      set.add(ChainType.UTXO);
    }
    return set;
  }, [
    walletFleet.data,
    externalSuiAccount?.address,
    companions.addresses.evm,
    companions.addresses.solana,
    companions.addresses.bitcoin,
  ]);
};
