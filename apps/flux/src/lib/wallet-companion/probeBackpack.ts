import type { CompanionAddresses } from './types';

interface BackpackSolanaProvider {
  isBackpack?: boolean;
  publicKey?: { toString: () => string } | null;
  connect?: (opts: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString: () => string };
  }>;
}

interface BackpackEthProvider {
  isBackpack?: boolean;
  request?: (args: {
    method: string;
    params?: unknown[];
  }) => Promise<unknown>;
}

interface BackpackGlobal {
  solana?: BackpackSolanaProvider;
  ethereum?: BackpackEthProvider;
}

export interface BackpackHost {
  backpack?: BackpackGlobal;
  ethereum?: BackpackEthProvider;
}

const resolveHost = (host?: BackpackHost): BackpackHost => {
  if (host) {
    return host;
  }
  if (typeof window === 'undefined') {
    return {};
  }
  return window as unknown as BackpackHost;
};

const probeBackpackSolana = async (
  provider: BackpackSolanaProvider | undefined,
): Promise<string | undefined> => {
  if (!provider) {
    return undefined;
  }
  const direct = provider.publicKey?.toString?.();
  if (direct) {
    return direct;
  }
  if (!provider.connect) {
    return undefined;
  }
  try {
    const result = await provider.connect({ onlyIfTrusted: true });
    return result?.publicKey?.toString?.() || undefined;
  } catch {
    return undefined;
  }
};

const probeBackpackEvm = async (
  provider: BackpackEthProvider | undefined,
): Promise<string | undefined> => {
  if (!provider?.request) {
    return undefined;
  }
  try {
    const accounts = await provider.request({ method: 'eth_accounts' });
    if (Array.isArray(accounts) && typeof accounts[0] === 'string') {
      return accounts[0];
    }
    return undefined;
  } catch {
    return undefined;
  }
};

/**
 * Silently probe a Backpack wallet for companion addresses. Solana via
 * `connect({ onlyIfTrusted })` or the synchronous `publicKey`. EVM prefers
 * `window.backpack.ethereum`; only falls back to `window.ethereum` when its
 * `isBackpack === true` flag is set, to avoid colliding with MetaMask /
 * other injected EVM providers.
 *
 * Backpack does not currently expose a Bitcoin provider — bitcoin is omitted.
 */
export const probeBackpackCompanions = async (
  host?: BackpackHost,
): Promise<CompanionAddresses> => {
  const resolved = resolveHost(host);
  const backpack = resolved.backpack;
  if (!backpack) {
    return {};
  }
  const evmProvider =
    backpack.ethereum && backpack.ethereum.request
      ? backpack.ethereum
      : resolved.ethereum?.isBackpack
        ? resolved.ethereum
        : undefined;
  const [solana, evm] = await Promise.all([
    probeBackpackSolana(backpack.solana),
    probeBackpackEvm(evmProvider),
  ]);
  return {
    ...(solana ? { solana } : {}),
    ...(evm ? { evm } : {}),
  };
};
