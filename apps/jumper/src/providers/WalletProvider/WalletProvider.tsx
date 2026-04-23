"use client";

import {
  TrackingAction,
  TrackingCategory,
  TrackingEventParameter,
} from "@/const/trackingKeys";
import envConfig from "@/config/env-config";
import { useWalletFleet } from "@/hooks/useWalletFleet";
import { useChains } from "@/hooks/useChains";
import { signBitcoinPsbt } from "@/lib/privy/bitcoin";
import { PrivySuiSigner } from "@/lib/privy/sui";
import { resolveConnectedAccount } from "@/providers/WalletProvider/resolveConnectedAccount";
import { resolvePrivySignerTokens } from "@/providers/WalletProvider/resolvePrivySignerTokens";
import { useUserTracking } from "@/hooks/userTracking";
import { useMenuStore } from "@/stores/menu";
import {
  BitcoinContext,
  EthereumContext,
  SolanaContext,
  SuiContext,
  type Account,
  type EthereumProviderContext,
  type WalletConnector,
  type WidgetProviderContext,
} from "@lifi/widget-provider";
import { BitcoinProvider as BitcoinSDKProvider } from "@lifi/sdk-provider-bitcoin";
import { EthereumProvider as EthereumSDKProvider } from "@lifi/sdk-provider-ethereum";
import {
  WalletMenuContext,
  type WalletMenuOpenArgs,
} from "@lifi/wallet-management";
import { SolanaProvider as SolanaSDKProvider } from "@lifi/sdk-provider-solana";
import { SuiProvider as SuiSDKProvider } from "@lifi/sdk-provider-sui";
import { convertExtendedChain } from "@lifi/widget-provider-ethereum";
import { ChainId, ChainType, type ExtendedChain } from "@lifi/sdk";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import {
  PrivyProvider,
  useIdentityToken,
  usePrivy,
} from "@privy-io/react-auth";
import { useWallets as usePrivyEvmWallets } from "@privy-io/react-auth";
import { useWallets as usePrivySolanaWallets } from "@privy-io/react-auth/solana";
import {
  WagmiProvider as PrivyWagmiProvider,
  createConfig as createPrivyWagmiConfig,
} from "@privy-io/wagmi";
import {
  type FC,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { http, type Chain } from "viem";
import { mainnet } from "viem/chains";
import { useAccount as useWagmiAccount } from "wagmi";
import {
  getBytecode,
  getConnectorClient,
  getTransactionCount,
  switchChain,
} from "wagmi/actions";

const privyConnector: WalletConnector = {
  icon: "/favicon.png",
  id: "privy-account",
  name: "Privy Account",
};

const disconnectedAccounts: Record<ChainType, Account> = {
  [ChainType.EVM]: {
    chainType: ChainType.EVM,
    isConnected: false,
    isConnecting: false,
    isDisconnected: true,
    isReconnecting: false,
    status: "disconnected",
  },
  [ChainType.SVM]: {
    chainType: ChainType.SVM,
    isConnected: false,
    isConnecting: false,
    isDisconnected: true,
    isReconnecting: false,
    status: "disconnected",
  },
  [ChainType.MVM]: {
    chainType: ChainType.MVM,
    isConnected: false,
    isConnecting: false,
    isDisconnected: true,
    isReconnecting: false,
    status: "disconnected",
  },
  [ChainType.UTXO]: {
    chainType: ChainType.UTXO,
    isConnected: false,
    isConnecting: false,
    isDisconnected: true,
    isReconnecting: false,
    status: "disconnected",
  },
  [ChainType.TVM]: {
    chainType: ChainType.TVM,
    isConnected: false,
    isConnecting: false,
    isDisconnected: true,
    isReconnecting: false,
    status: "disconnected",
  },
  [ChainType.STL]: {
    chainType: ChainType.STL,
    isConnected: false,
    isConnecting: false,
    isDisconnected: true,
    isReconnecting: false,
    status: "disconnected",
  },
};

function getSolanaRpcUrl(): string {
  if (envConfig.NEXT_PUBLIC_SOLANA_RPC_URI) {
    return envConfig.NEXT_PUBLIC_SOLANA_RPC_URI;
  }

  try {
    const customRpcs = JSON.parse(envConfig.NEXT_PUBLIC_CUSTOM_RPCS || "{}");
    const solanaRpcs = customRpcs["1151111081099710"];
    if (Array.isArray(solanaRpcs) && solanaRpcs.length > 0) {
      return solanaRpcs[0];
    }
  } catch {
    // ignore malformed custom rpc config and fall back to the default Privy chain setup
  }

  return "https://api.mainnet-beta.solana.com";
}

function useCanonicalEvmChains(chains: ExtendedChain[]): [Chain, ...Chain[]] {
  return useMemo(() => {
    const evmChains = chains
      .filter((chain) => chain.chainType === ChainType.EVM)
      .map((chain) => convertExtendedChain(chain));

    return (evmChains.length ? evmChains : [mainnet]) as [Chain, ...Chain[]];
  }, [chains]);
}

const WalletMenuBridgeProvider: FC<PropsWithChildren> = ({ children }) => {
  const { authenticated, login } = usePrivy();
  const { openWalletMenu, setWalletMenuState } = useMenuStore((state) => ({
    openWalletMenu: state.openWalletMenu,
    setWalletMenuState: state.setWalletMenuState,
  }));

  const handleOpenWalletMenu = useCallback(
    (_args?: WalletMenuOpenArgs) => {
      if (!authenticated) {
        login();
        return;
      }

      setWalletMenuState(true);
    },
    [authenticated, login, setWalletMenuState],
  );

  const handleCloseWalletMenu = useCallback(() => {
    setWalletMenuState(false);
  }, [setWalletMenuState]);

  const handleToggleWalletMenu = useCallback(() => {
    if (!authenticated) {
      login();
      return;
    }

    setWalletMenuState(!openWalletMenu);
  }, [authenticated, login, openWalletMenu, setWalletMenuState]);

  const contextValue = useMemo(
    () => ({
      closeWalletMenu: handleCloseWalletMenu,
      isWalletMenuOpen: () => openWalletMenu,
      openWalletMenu: handleOpenWalletMenu,
      toggleWalletMenu: handleToggleWalletMenu,
    }),
    [
      handleCloseWalletMenu,
      handleOpenWalletMenu,
      handleToggleWalletMenu,
      openWalletMenu,
    ],
  );

  return (
    <WalletMenuContext.Provider value={contextValue}>
      {children}
    </WalletMenuContext.Provider>
  );
};

const WalletContextsProvider: FC<
  PropsWithChildren<{
    wagmiConfig: ReturnType<typeof createPrivyWagmiConfig>;
  }>
> = ({ children, wagmiConfig }) => {
  const { authenticated, getAccessToken, login, logout, ready } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { wallets: connectedEvmWallets } = usePrivyEvmWallets();
  const { wallets: connectedSolanaWallets } = usePrivySolanaWallets();
  const walletFleet = useWalletFleet();
  const wagmiAccount = useWagmiAccount();
  const fleetEvmWallet = walletFleet.data?.wallets.evm;
  const fleetSolanaWallet = walletFleet.data?.wallets.solana;

  const baseEvmAccount = useMemo<Account>(() => {
    if (!ready || !authenticated || !wagmiAccount.address) {
      return disconnectedAccounts[ChainType.EVM];
    }

    return {
      address: wagmiAccount.address,
      chainId: wagmiAccount.chainId,
      chainType: ChainType.EVM,
      connector: privyConnector,
      isConnected: wagmiAccount.isConnected,
      isConnecting: wagmiAccount.isConnecting,
      isDisconnected: wagmiAccount.isDisconnected,
      isReconnecting: wagmiAccount.isReconnecting,
      status: wagmiAccount.status,
    };
  }, [
    authenticated,
    ready,
    wagmiAccount.address,
    wagmiAccount.chainId,
    wagmiAccount.isConnected,
    wagmiAccount.isConnecting,
    wagmiAccount.isDisconnected,
    wagmiAccount.isReconnecting,
    wagmiAccount.status,
  ]);

  const evmAccount = useMemo<Account>(
    () =>
      resolveConnectedAccount({
        account: baseEvmAccount,
        authenticated,
        canUseFallback:
          wagmiAccount.status === "connected" && Boolean(wagmiAccount.chainId),
        connector: privyConnector,
        defaultChainId: mainnet.id,
        fallbackAddress:
          connectedEvmWallets[0]?.address ?? fleetEvmWallet?.address,
        ready,
      }),
    [
      authenticated,
      baseEvmAccount,
      connectedEvmWallets,
      fleetEvmWallet?.address,
      ready,
      wagmiAccount.chainId,
      wagmiAccount.status,
    ],
  );

  const solanaWallet = connectedSolanaWallets[0];
  const connectedSolanaAddress =
    (
      solanaWallet as
        | { address?: string; accounts?: Array<{ address: string }> }
        | undefined
    )?.address ??
    (solanaWallet as { accounts?: Array<{ address: string }> } | undefined)
      ?.accounts?.[0]?.address;

  const baseSolanaAccount = useMemo<Account>(() => {
    if (!ready || !authenticated || !connectedSolanaAddress) {
      return disconnectedAccounts[ChainType.SVM];
    }

    return {
      address: connectedSolanaAddress,
      chainId: 1151111081099710,
      chainType: ChainType.SVM,
      connector: privyConnector,
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      isReconnecting: false,
      status: "connected",
    };
  }, [authenticated, connectedSolanaAddress, ready]);

  const solanaAccount = useMemo<Account>(
    () =>
      resolveConnectedAccount({
        account: baseSolanaAccount,
        authenticated,
        canUseFallback: Boolean(solanaWallet && connectedSolanaAddress),
        connector: privyConnector,
        defaultChainId: 1151111081099710,
        fallbackAddress: fleetSolanaWallet?.address,
        ready,
      }),
    [
      authenticated,
      baseSolanaAccount,
      connectedSolanaAddress,
      fleetSolanaWallet?.address,
      ready,
      solanaWallet,
    ],
  );

  const suiWallet = walletFleet.data?.wallets.sui;
  const suiAccount = useMemo<Account>(
    () =>
      resolveConnectedAccount({
        account: disconnectedAccounts[ChainType.MVM],
        authenticated,
        canUseFallback: Boolean(suiWallet?.publicKey),
        connector: privyConnector,
        defaultChainId: ChainId.SUI,
        fallbackAddress: suiWallet?.address,
        ready,
      }),
    [authenticated, ready, suiWallet?.address, suiWallet?.publicKey],
  );

  const bitcoinWallet = walletFleet.data?.wallets.bitcoin;
  const bitcoinAccount = useMemo<Account>(() => {
    if (!ready || !authenticated || !bitcoinWallet?.address) {
      return disconnectedAccounts[ChainType.UTXO];
    }

    return {
      address: bitcoinWallet.address,
      addresses: [bitcoinWallet.address],
      chainId: 20000000000001,
      chainType: ChainType.UTXO,
      connector: privyConnector,
      isConnected: true,
      isConnecting: false,
      isDisconnected: false,
      isReconnecting: false,
      status: "connected",
    };
  }, [authenticated, bitcoinWallet?.address, ready]);

  const installedWallets = useMemo(
    () => (authenticated ? [privyConnector] : []),
    [authenticated],
  );

  const evmContextValue = useMemo<EthereumProviderContext>(
    () => ({
      account: evmAccount,
      connect: async (_connectorIdOrName, onSuccess) => {
        if (!authenticated) {
          login();
          return;
        }

        if (evmAccount.address && evmAccount.chainId) {
          onSuccess?.(evmAccount.address, evmAccount.chainId);
        }
      },
      disconnect: async () => {
        await logout();
      },
      getBytecode: (chainId, address) =>
        getBytecode(wagmiConfig, {
          address: address as `0x${string}`,
          chainId,
        }),
      getTransactionCount: (chainId, address) =>
        getTransactionCount(wagmiConfig, {
          address: address as `0x${string}`,
          chainId,
        }),
      installedWallets,
      isConnected: evmAccount.isConnected,
      isEnabled: true,
      isExternalContext: true,
      sdkProvider: EthereumSDKProvider({
        getWalletClient: () =>
          getConnectorClient(wagmiConfig, {
            assertChainId: false,
          }),
        switchChain: async (chainId: number) => {
          const chain = await switchChain(wagmiConfig, { chainId });
          return getConnectorClient(wagmiConfig, { chainId: chain.id });
        },
      }) as never,
    }),
    [authenticated, evmAccount, installedWallets, login, logout, wagmiConfig],
  );

  const solanaContextValue = useMemo<WidgetProviderContext>(
    () => ({
      account: solanaAccount,
      connect: async (_connectorIdOrName, onSuccess) => {
        if (!authenticated) {
          login();
          return;
        }

        if (solanaAccount.address) {
          onSuccess?.(
            solanaAccount.address,
            solanaAccount.chainId ?? 1151111081099710,
          );
        }
      },
      disconnect: async () => {
        await logout();
      },
      installedWallets,
      isConnected: solanaAccount.isConnected,
      isEnabled: true,
      isExternalContext: true,
      sdkProvider: SolanaSDKProvider({
        getWallet: async () => {
          if (!solanaWallet) {
            throw new Error("Missing Privy Solana wallet");
          }

          return solanaWallet as never;
        },
      }) as never,
    }),
    [
      authenticated,
      installedWallets,
      login,
      logout,
      solanaAccount,
      solanaWallet,
    ],
  );

  const suiClient = useMemo(
    () =>
      new SuiGrpcClient({
        baseUrl: getJsonRpcFullnodeUrl("mainnet"),
        network: "mainnet",
      }),
    [],
  );

  const suiContextValue = useMemo<WidgetProviderContext>(
    () => ({
      account: suiAccount,
      connect: async (_connectorIdOrName, onSuccess) => {
        if (!authenticated) {
          login();
          return;
        }

        if (suiAccount.address) {
          onSuccess?.(suiAccount.address, suiAccount.chainId ?? ChainId.SUI);
        }
      },
      disconnect: async () => {
        await logout();
      },
      installedWallets,
      isConnected: suiAccount.isConnected,
      isEnabled: true,
      isExternalContext: true,
      sdkProvider: SuiSDKProvider({
        getClient: async () => suiClient,
        getSigner: async () => {
          if (!suiWallet?.publicKey) {
            throw new Error("Missing Privy Sui wallet");
          }

          const signerTokens = await resolvePrivySignerTokens({
            cachedIdentityToken: identityToken,
            getAccessToken,
          });

          return new PrivySuiSigner({
            identityToken: signerTokens.identityToken,
            publicKey: suiWallet.publicKey,
            sessionJwt: signerTokens.sessionJwt,
          });
        },
      }) as never,
    }),
    [
      authenticated,
      getAccessToken,
      identityToken,
      installedWallets,
      login,
      logout,
      suiAccount,
      suiClient,
      suiWallet?.publicKey,
    ],
  );

  const bitcoinContextValue = useMemo<WidgetProviderContext>(
    () => ({
      account: bitcoinAccount,
      connect: async (_connectorIdOrName, onSuccess) => {
        if (!authenticated) {
          login();
          return;
        }

        if (bitcoinAccount.address) {
          onSuccess?.(
            bitcoinAccount.address,
            bitcoinAccount.chainId ?? 20000000000001,
          );
        }
      },
      disconnect: async () => {
        await logout();
      },
      installedWallets,
      isConnected: bitcoinAccount.isConnected,
      isEnabled: true,
      isExternalContext: true,
      sdkProvider: BitcoinSDKProvider({
        getWalletClient: async () => {
          if (!bitcoinWallet?.publicKey) {
            throw new Error("Missing Privy bitcoin wallet");
          }

          const signerTokens = await resolvePrivySignerTokens({
            cachedIdentityToken: identityToken,
            getAccessToken,
          });

          return {
            account: {
              address: bitcoinWallet.address,
              publicKey: bitcoinWallet.publicKey.startsWith("0x")
                ? bitcoinWallet.publicKey
                : `0x${bitcoinWallet.publicKey}`,
            },
            async request(request: {
              method: string;
              params: { psbt: string };
            }) {
              if (request.method !== "signPsbt") {
                throw new Error(
                  `Unsupported bitcoin wallet method: ${request.method}`,
                );
              }

              return signBitcoinPsbt({
                identityToken: signerTokens.identityToken,
                psbt: request.params.psbt,
                sessionJwt: signerTokens.sessionJwt,
              });
            },
          } as never;
        },
      }) as never,
    }),
    [
      authenticated,
      bitcoinAccount,
      bitcoinWallet?.address,
      bitcoinWallet?.publicKey,
      getAccessToken,
      identityToken,
      installedWallets,
      login,
      logout,
    ],
  );

  return (
    <EthereumContext.Provider value={evmContextValue}>
      <SolanaContext.Provider value={solanaContextValue}>
        <SuiContext.Provider value={suiContextValue}>
          <BitcoinContext.Provider value={bitcoinContextValue}>
            {children}
          </BitcoinContext.Provider>
        </SuiContext.Provider>
      </SolanaContext.Provider>
    </EthereumContext.Provider>
  );
};

export const WalletProvider: FC<PropsWithChildren> = ({ children }) => {
  const { trackEvent } = useUserTracking();
  const { chains } = useChains();

  const evmChains = useCanonicalEvmChains(chains);
  const wagmiConfig = useMemo(() => {
    const transports = Object.fromEntries(
      evmChains.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
    );

    return createPrivyWagmiConfig({
      chains: evmChains,
      ssr: true,
      transports: transports as Record<number, ReturnType<typeof http>>,
    });
  }, [evmChains]);
  const privyAppId = envConfig.NEXT_PUBLIC_PRIVY_APP_ID;

  useEffect(() => {
    if (!privyAppId) {
      console.error("NEXT_PUBLIC_PRIVY_APP_ID is required for apps/jumper");
    }
  }, [privyAppId]);

  if (!privyAppId) {
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          walletChainType: "ethereum-and-solana",
        },
        defaultChain: evmChains[0],
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
          disableAllExternalWallets: true,
        },
        loginMethods: ["email", "google"],
        supportedChains: evmChains,
      }}
    >
      <PrivyWagmiProvider
        config={wagmiConfig}
        reconnectOnMount={false}
        setActiveWalletForWagmi={({ wallets }) =>
          wallets.find(
            (wallet) =>
              wallet.type === "ethereum" &&
              wallet.walletClientType?.startsWith("privy"),
          )
        }
      >
        <WalletMenuBridgeProvider>
          <WalletContextsProvider wagmiConfig={wagmiConfig}>
            <WalletTrackingProvider trackEvent={trackEvent}>
              {children}
            </WalletTrackingProvider>
          </WalletContextsProvider>
        </WalletMenuBridgeProvider>
      </PrivyWagmiProvider>
    </PrivyProvider>
  );
};

const WalletTrackingProvider: FC<
  PropsWithChildren<{
    trackEvent: ReturnType<typeof useUserTracking>["trackEvent"];
  }>
> = ({ children, trackEvent }) => {
  const walletFleet = useWalletFleet();
  const trackedWalletIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const wallets = walletFleet.data?.wallets;
    if (!wallets) {
      return;
    }

    Object.values(wallets).forEach((wallet) => {
      if (!wallet || trackedWalletIdsRef.current.has(wallet.walletId)) {
        return;
      }

      trackedWalletIdsRef.current.add(wallet.walletId);

      trackEvent({
        category: TrackingCategory.Connect,
        action: TrackingAction.ConnectWallet,
        label: "connect-wallet",
        data: {
          [TrackingEventParameter.Wallet]: wallet.connectorName,
          [TrackingEventParameter.Ecosystem]: wallet.chain,
          [TrackingEventParameter.ChainId]: wallet.chain,
          [TrackingEventParameter.WalletAddress]: wallet.address,
        },
      });
    });
  }, [trackEvent, walletFleet.data?.wallets]);

  return children;
};
