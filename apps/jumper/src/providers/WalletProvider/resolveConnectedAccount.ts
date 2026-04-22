import type { Account, WalletConnector } from '@lifi/widget-provider';

interface ResolveConnectedAccountParams {
  account: Account;
  authenticated: boolean;
  canUseFallback?: boolean;
  connector: WalletConnector;
  defaultChainId?: number;
  fallbackAddress?: string;
  fallbackAddresses?: readonly string[];
  ready: boolean;
}

export function resolveConnectedAccount(
  params: ResolveConnectedAccountParams,
): Account {
  const {
    account,
    authenticated,
    canUseFallback = true,
    connector,
    defaultChainId,
    fallbackAddresses,
    ready,
  } = params;
  const fallbackAddress = params.fallbackAddress?.trim();

  if (account.isConnected && account.address) {
    return account;
  }

  if (!authenticated || !canUseFallback || !ready || !fallbackAddress) {
    return account;
  }

  return {
    ...account,
    address: fallbackAddress,
    addresses: fallbackAddresses ?? account.addresses,
    chainId: account.chainId ?? defaultChainId,
    connector: account.connector ?? connector,
    isConnected: true,
    isConnecting: false,
    isDisconnected: false,
    isReconnecting: false,
    status: 'connected',
  };
}
