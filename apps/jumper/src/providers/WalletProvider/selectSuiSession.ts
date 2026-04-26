import { ChainId, ChainType } from "@lifi/sdk";
import type { Account, WalletConnector } from "@lifi/widget-provider";
import { resolveConnectedAccount } from "./resolveConnectedAccount";

export const dappKitSuiConnector: WalletConnector = {
  icon: "/favicon.png",
  id: "sui-dapp-kit",
  name: "Sui Wallet",
};

export type SuiProviderTag = "dapp-kit" | "privy" | "empty";

export function selectSuiProviderTag(params: {
  externalAccount?: { address?: string | null } | null;
  suiWallet?: { publicKey?: string | null } | null;
}): SuiProviderTag {
  if (params.externalAccount?.address) {
    return "dapp-kit";
  }
  if (params.suiWallet?.publicKey) {
    return "privy";
  }
  return "empty";
}

export function selectSuiAccount(params: {
  authenticated: boolean;
  disconnectedAccount: Account;
  externalAccount?: { address?: string | null } | null;
  privyConnector: WalletConnector;
  ready: boolean;
  suiWallet?: { address?: string | null; publicKey?: string | null } | null;
}): Account {
  const externalAddress = params.externalAccount?.address;
  if (externalAddress) {
    return {
      address: externalAddress,
      chainId: ChainId.SUI,
      chainType: ChainType.MVM,
      connector: dappKitSuiConnector,
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      isReconnecting: false,
      status: "connected",
    };
  }

  return resolveConnectedAccount({
    account: params.disconnectedAccount,
    authenticated: params.authenticated,
    canUseFallback: Boolean(params.suiWallet?.publicKey),
    connector: params.privyConnector,
    defaultChainId: ChainId.SUI,
    fallbackAddress: params.suiWallet?.address ?? undefined,
    ready: params.ready,
  });
}
