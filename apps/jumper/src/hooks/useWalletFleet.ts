'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { type ChainType } from '@lifi/sdk';
import { mapLifiChainTypeToFleetChain, type WalletFleetResponse } from '@/lib/privy/wallet-fleet';

const walletFleetQueryKey = ['privy-wallet-fleet'];

async function fetchWalletFleet(accessToken: string): Promise<WalletFleetResponse> {
  const response = await fetch('/api/privy/wallet-fleet', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch wallet fleet');
  }

  return response.json();
}

export function useWalletFleet() {
  const { authenticated, getAccessToken, ready } = usePrivy();

  return useQuery({
    queryKey: walletFleetQueryKey,
    queryFn: async () => {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Missing Privy access token');
      }

      return fetchWalletFleet(accessToken);
    },
    enabled: ready && authenticated,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useWalletFleetAddress(chainType?: ChainType) {
  const walletFleet = useWalletFleet();
  const fleetChain = mapLifiChainTypeToFleetChain(chainType);

  return fleetChain ? walletFleet.data?.wallets[fleetChain]?.address : undefined;
}
