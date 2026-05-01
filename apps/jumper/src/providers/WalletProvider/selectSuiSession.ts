import { ChainId, ChainType } from "@lifi/sdk";
import type { Account, WalletConnector } from "@lifi/widget-provider";
import type { SuiSourcePreference } from "@/stores/wallet";
import { resolveConnectedAccount } from "./resolveConnectedAccount";

export const WALLET_CONNECTOR_ICON = "/wallet-avatar.svg";

export const dappKitSuiConnector: WalletConnector = {
  icon: WALLET_CONNECTOR_ICON,
  id: "sui-dapp-kit",
  name: "Sui Wallet",
};

export type SuiProviderTag = "dapp-kit" | "privy" | "empty";

/**
 * Resolves which Sui session should be considered the primary signer / autofill
 * source given the user's stored preference plus what's actually available.
 *
 * "auto" (default): external dapp-kit wallet wins if present, else Privy embedded.
 * "external": prefer external wallet; fall back to Privy embedded if none.
 * "privy":    prefer Privy embedded; fall back to external wallet if none.
 */
export function selectSuiProviderTag(params: {
  externalAccount?: { address?: string | null } | null;
  suiWallet?: { publicKey?: string | null } | null;
  preference?: SuiSourcePreference;
}): SuiProviderTag {
  const hasExternal = Boolean(params.externalAccount?.address);
  const hasPrivy = Boolean(params.suiWallet?.publicKey);
  const preference = params.preference ?? "auto";

  if (preference === "privy") {
    if (hasPrivy) return "privy";
    if (hasExternal) return "dapp-kit";
    return "empty";
  }

  // "auto" and "external" both prefer external first
  if (hasExternal) return "dapp-kit";
  if (hasPrivy) return "privy";
  return "empty";
}

export function selectSuiAccount(params: {
  authenticated: boolean;
  disconnectedAccount: Account;
  externalAccount?: { address?: string | null } | null;
  preference?: SuiSourcePreference;
  privyConnector: WalletConnector;
  ready: boolean;
  suiWallet?: { address?: string | null; publicKey?: string | null } | null;
}): Account {
  const tag = selectSuiProviderTag({
    externalAccount: params.externalAccount,
    suiWallet: params.suiWallet,
    preference: params.preference,
  });

  if (tag === "dapp-kit" && params.externalAccount?.address) {
    return {
      address: params.externalAccount.address,
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
