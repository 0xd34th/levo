"use client";

import { ChainType } from "@lifi/sdk";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { usePrivy } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import {
  mapLifiChainTypeToFleetChain,
  type WalletFleetResponse,
} from "@/lib/privy/wallet-fleet";
import { useSuiPreferenceStore } from "@/stores/wallet";

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
  const preferredSuiSource = useSuiPreferenceStore(
    (state) => state.preferredSuiSource,
  );
  const fleetChain = mapLifiChainTypeToFleetChain(chainType);

  // For Sui the user has up to two simultaneous addresses (external dapp-kit
  // wallet and Privy embedded). Selection respects the user's preference,
  // falling back to whichever side is actually present.
  if (chainType === ChainType.MVM) {
    const external = externalSuiAccount?.address;
    const privy = walletFleet.data?.wallets.sui?.address;
    if (preferredSuiSource === "privy") {
      return privy ?? external;
    }
    return external ?? privy;
  }

  return fleetChain
    ? walletFleet.data?.wallets[fleetChain]?.address
    : undefined;
}
