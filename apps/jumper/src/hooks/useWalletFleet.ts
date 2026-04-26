"use client";

import { ChainType } from "@lifi/sdk";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import {
  mapLifiChainTypeToFleetChain,
  type WalletFleetResponse,
} from "@/lib/privy/wallet-fleet";

const walletFleetQueryKey = ["privy-wallet-fleet"];

class WalletFleetAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletFleetAuthError";
  }
}

async function fetchWalletFleet(userJwt: string): Promise<WalletFleetResponse> {
  const response = await fetch("/api/privy/wallet-fleet", {
    headers: {
      Authorization: `Bearer ${userJwt}`,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    const message = payload?.error || "Failed to fetch wallet fleet";
    if (response.status === 401) {
      throw new WalletFleetAuthError(message);
    }

    throw new Error(message);
  }

  return response.json();
}

export function useWalletFleet() {
  const { authenticated, getAccessToken, logout, ready } = usePrivy();

  return useQuery({
    queryKey: walletFleetQueryKey,
    queryFn: async () => {
      const sessionJwt = await getAccessToken();
      if (!sessionJwt) {
        throw new Error("Missing Privy session token");
      }

      try {
        return await fetchWalletFleet(sessionJwt);
      } catch (error) {
        if (error instanceof WalletFleetAuthError) {
          await logout();
        }

        throw error;
      }
    },
    enabled: ready && authenticated,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useWalletFleetAddress(chainType?: ChainType) {
  const walletFleet = useWalletFleet();
  const externalSuiAccount = useCurrentAccount();
  const fleetChain = mapLifiChainTypeToFleetChain(chainType);

  // External Sui wallet beats the Privy embedded Sui wallet (locked spec).
  if (chainType === ChainType.MVM) {
    return externalSuiAccount?.address ?? walletFleet.data?.wallets.sui?.address;
  }

  return fleetChain
    ? walletFleet.data?.wallets[fleetChain]?.address
    : undefined;
}
