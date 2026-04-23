"use client";

import { type ChainType } from "@lifi/sdk";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import {
  mapLifiChainTypeToFleetChain,
  type WalletFleetResponse,
} from "@/lib/privy/wallet-fleet";

const walletFleetQueryKey = ["privy-wallet-fleet"];

async function fetchWalletFleet(userJwt: string): Promise<WalletFleetResponse> {
  const response = await fetch("/api/privy/wallet-fleet", {
    headers: {
      Authorization: `Bearer ${userJwt}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch wallet fleet");
  }

  return response.json();
}

export function useWalletFleet() {
  const { authenticated, getAccessToken, ready } = usePrivy();

  return useQuery({
    queryKey: walletFleetQueryKey,
    queryFn: async () => {
      const sessionJwt = await getAccessToken();
      if (!sessionJwt) {
        throw new Error("Missing Privy session token");
      }

      return fetchWalletFleet(sessionJwt);
    },
    enabled: ready && authenticated,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useWalletFleetAddress(chainType?: ChainType) {
  const walletFleet = useWalletFleet();
  const fleetChain = mapLifiChainTypeToFleetChain(chainType);

  return fleetChain
    ? walletFleet.data?.wallets[fleetChain]?.address
    : undefined;
}
