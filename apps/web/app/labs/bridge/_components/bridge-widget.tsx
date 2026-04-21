'use client';

import { useMemo } from 'react';
import {
  ChainType,
  DisabledUI,
  LiFiWidget,
  WidgetSkeleton,
  type WidgetConfig,
} from '@lifi/widget';
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider as SuiWalletProvider,
} from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { arbitrum, base, mainnet, optimism, polygon } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

import { Button } from '@/components/ui/button';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';

import { ClientOnly } from './client-only';

const SUI_CHAIN_ID = 9270000000000000;

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, optimism, base, polygon],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
    [polygon.id]: http(),
  },
});

const { networkConfig } = createNetworkConfig({
  mainnet: { url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' },
});

function buildWidgetConfig(suiAddress: string): WidgetConfig {
  return {
    integrator: 'levo',
    toChain: SUI_CHAIN_ID,
    toAddress: {
      address: suiAddress,
      chainType: ChainType.MVM,
      name: 'Levo wallet',
    },
    disabledUI: [DisabledUI.ToAddress],
    appearance: 'light',
    theme: {
      container: {
        boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
        borderRadius: '16px',
      },
    },
  };
}

export function BridgeWidget() {
  const { ready, authenticated } = usePrivy();
  const { initOAuth } = useLoginWithOAuth();
  const { suiAddress, loading, error, refetch } = useEmbeddedWallet();

  const widgetConfig = useMemo(
    () => (suiAddress ? buildWidgetConfig(suiAddress) : null),
    [suiAddress],
  );

  if (!widgetConfig) {
    const signedOut = ready && !authenticated;

    const message = loading
      ? 'Preparing your Levo Sui wallet…'
      : error
        ? `Could not load your Levo Sui wallet: ${error}`
        : signedOut
          ? 'Sign in with X to bridge into your Levo Sui wallet.'
          : 'Preparing your Levo Sui wallet…';

    return (
      <div className="flex flex-col items-center gap-3">
        <p
          className="text-center text-[13px]"
          style={{ color: 'var(--text-mute)' }}
        >
          {message}
        </p>
        {signedOut ? (
          <Button
            className="h-11 rounded-full px-5"
            onClick={() => {
              void initOAuth({ provider: 'twitter' }).catch(() => {});
            }}
          >
            Sign in with X
          </Button>
        ) : error ? (
          <Button
            variant="outline"
            className="h-11 rounded-full px-5"
            onClick={() => {
              refetch();
            }}
          >
            Try again
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig} reconnectOnMount>
        <SuiClientProvider networks={networkConfig} defaultNetwork="mainnet">
          <SuiWalletProvider autoConnect>
            <ClientOnly fallback={<WidgetSkeleton config={widgetConfig} />}>
              <LiFiWidget integrator="levo" config={widgetConfig} />
            </ClientOnly>
          </SuiWalletProvider>
        </SuiClientProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
