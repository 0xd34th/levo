'use client';

import {
  useEmbeddedWalletBootstrap,
  type EmbeddedWalletBootstrapState,
  type EmbeddedWalletState,
} from '@/lib/embedded-wallet-bootstrap';

export type { EmbeddedWalletState };

/**
 * Reads the app-wide Privy embedded Sui wallet bootstrap state.
 *
 * The setup POST runs once from EmbeddedWalletBootstrapProvider under PrivyProvider,
 * so pages can consume this hook without racing or duplicating wallet setup.
 */
export function useEmbeddedWallet(): EmbeddedWalletBootstrapState {
  return useEmbeddedWalletBootstrap();
}
