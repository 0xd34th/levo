import type { CompanionAddresses } from './types';

interface OkxSolanaProvider {
  publicKey?: { toString: () => string } | null;
}

interface OkxBitcoinProvider {
  getAccounts?: () => Promise<string[]>;
}

interface OkxWalletGlobal {
  request?: (args: {
    method: string;
    params?: unknown[];
  }) => Promise<unknown>;
  solana?: OkxSolanaProvider;
  bitcoin?: OkxBitcoinProvider;
}

export interface OkxHost {
  okxwallet?: OkxWalletGlobal;
}

const resolveHost = (host?: OkxHost): OkxHost => {
  if (host) {
    return host;
  }
  if (typeof window === 'undefined') {
    return {};
  }
  return window as unknown as OkxHost;
};

const probeOkxSolana = (
  provider: OkxSolanaProvider | undefined,
): string | undefined => {
  const publicKey = provider?.publicKey?.toString?.();
  return publicKey || undefined;
};

const probeOkxEvm = async (
  provider: OkxWalletGlobal | undefined,
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

const probeOkxBitcoin = async (
  provider: OkxBitcoinProvider | undefined,
): Promise<string | undefined> => {
  if (!provider?.getAccounts) {
    return undefined;
  }
  try {
    const accounts = await provider.getAccounts();
    if (Array.isArray(accounts) && typeof accounts[0] === 'string') {
      return accounts[0];
    }
    return undefined;
  } catch {
    return undefined;
  }
};

/**
 * Silently probe an OKX wallet for companion addresses. EVM via EIP-1193
 * `eth_accounts`; Solana via the synchronous `publicKey` populated after a
 * prior connect; Bitcoin via OKX's documented silent `getAccounts()` (extension
 * 2.77.1+).
 */
export const probeOkxCompanions = async (
  host?: OkxHost,
): Promise<CompanionAddresses> => {
  const okx = resolveHost(host).okxwallet;
  if (!okx) {
    return {};
  }
  const [evm, bitcoin] = await Promise.all([
    probeOkxEvm(okx),
    probeOkxBitcoin(okx.bitcoin),
  ]);
  const solana = probeOkxSolana(okx.solana);
  return {
    ...(solana ? { solana } : {}),
    ...(evm ? { evm } : {}),
    ...(bitcoin ? { bitcoin } : {}),
  };
};
