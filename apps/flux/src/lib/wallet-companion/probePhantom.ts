import type { CompanionAddresses } from './types';

interface PhantomSolanaProvider {
  isPhantom?: boolean;
  connect?: (opts: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString: () => string };
  }>;
}

interface PhantomEthProvider {
  isPhantom?: boolean;
  request?: (args: {
    method: string;
    params?: unknown[];
  }) => Promise<unknown>;
}

interface PhantomGlobal {
  solana?: PhantomSolanaProvider;
  ethereum?: PhantomEthProvider;
}

export interface PhantomHost {
  phantom?: PhantomGlobal;
}

const resolveHost = (host?: PhantomHost): PhantomHost => {
  if (host) {
    return host;
  }
  if (typeof window === 'undefined') {
    return {};
  }
  return window as unknown as PhantomHost;
};

const probePhantomSolana = async (
  provider: PhantomSolanaProvider | undefined,
): Promise<string | undefined> => {
  if (!provider?.isPhantom || !provider.connect) {
    return undefined;
  }
  try {
    const result = await provider.connect({ onlyIfTrusted: true });
    const publicKey = result?.publicKey?.toString?.();
    return publicKey || undefined;
  } catch {
    return undefined;
  }
};

const probePhantomEvm = async (
  provider: PhantomEthProvider | undefined,
): Promise<string | undefined> => {
  if (!provider?.isPhantom || !provider.request) {
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
 * Silently probe a Phantom wallet for companion addresses on chains other
 * than Sui. Uses `connect({ onlyIfTrusted: true })` for Solana and EIP-1193
 * `eth_accounts` for EVM — both prompt-free; failure modes return undefined
 * for that namespace.
 *
 * Bitcoin is intentionally omitted in v1: Phantom's BTC API requires
 * `requestAccounts()` which can prompt, and `window.phantom.bitcoin` is
 * marked for deprecation.
 */
export const probePhantomCompanions = async (
  host?: PhantomHost,
): Promise<CompanionAddresses> => {
  const phantom = resolveHost(host).phantom;
  if (!phantom) {
    return {};
  }
  const [solana, evm] = await Promise.all([
    probePhantomSolana(phantom.solana),
    probePhantomEvm(phantom.ethereum),
  ]);
  return {
    ...(solana ? { solana } : {}),
    ...(evm ? { evm } : {}),
  };
};
