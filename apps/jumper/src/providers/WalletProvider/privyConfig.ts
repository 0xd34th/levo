import type { PrivyClientConfig } from "@privy-io/react-auth";
import type { Chain } from "viem";

export function buildPrivyClientConfig(params: {
  defaultChain: Chain;
  supportedChains: [Chain, ...Chain[]];
}): PrivyClientConfig {
  return {
    appearance: {
      walletChainType: "ethereum-and-solana",
    },
    defaultChain: params.defaultChain,
    embeddedWallets: {
      ethereum: {
        createOnLogin: "all-users",
      },
      showWalletUIs: false,
      solana: {
        createOnLogin: "all-users",
      },
    },
    externalWallets: {
      disableAllExternalWallets: false,
      walletConnect: {
        enabled: true,
      },
    },
    loginMethods: ["email", "google", "wallet"],
    supportedChains: params.supportedChains,
  };
}
