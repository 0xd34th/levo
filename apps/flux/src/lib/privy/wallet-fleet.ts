import { ChainType } from '@lifi/sdk';

export type WalletFleetChain = 'evm' | 'solana' | 'sui' | 'bitcoin';
export type PrivyFleetWalletChain =
  | 'ethereum'
  | 'solana'
  | 'sui'
  | 'bitcoin-segwit';

export interface WalletFleetEntry {
  address: string;
  chain: WalletFleetChain;
  chainType: ChainType;
  connectorName: 'Privy Account';
  privyChainType: PrivyFleetWalletChain;
  publicKey: string | null;
  walletId: string;
}

export interface WalletFleetUserSummary {
  email: string | null;
  id: string;
  loginMethod: 'email' | 'google' | 'wallet' | 'unknown';
}

export interface WalletFleetResponse {
  readyStates: Record<WalletFleetChain, boolean>;
  user: WalletFleetUserSummary;
  wallets: Partial<Record<WalletFleetChain, WalletFleetEntry>>;
}

export interface PrivyLinkedAccountLike {
  address?: string | null;
  chain_type?: string | null;
  connector_type?: string | null;
  email?: string | null;
  id?: string | null;
  public_key?: string | null;
  type?: string | null;
  wallet_client?: string | null;
}

export const canonicalWalletFleetOrder: WalletFleetChain[] = [
  'evm',
  'solana',
  'sui',
  'bitcoin',
];

export const canonicalPrivyWalletOrder: PrivyFleetWalletChain[] = [
  'ethereum',
  'solana',
  'sui',
  'bitcoin-segwit',
];

export function mapPrivyChainTypeToFleetChain(
  chainType?: string | null,
): WalletFleetChain | undefined {
  switch (chainType) {
    case 'ethereum':
      return 'evm';
    case 'solana':
      return 'solana';
    case 'sui':
      return 'sui';
    case 'bitcoin-segwit':
      return 'bitcoin';
    default:
      return undefined;
  }
}

export function mapFleetChainToPrivyChainType(
  chain: WalletFleetChain,
): PrivyFleetWalletChain {
  switch (chain) {
    case 'evm':
      return 'ethereum';
    case 'solana':
      return 'solana';
    case 'sui':
      return 'sui';
    case 'bitcoin':
      return 'bitcoin-segwit';
  }
}

export function mapLifiChainTypeToFleetChain(
  chainType?: ChainType,
): WalletFleetChain | undefined {
  switch (chainType) {
    case ChainType.EVM:
      return 'evm';
    case ChainType.SVM:
      return 'solana';
    case ChainType.MVM:
      return 'sui';
    case ChainType.UTXO:
      return 'bitcoin';
    default:
      return undefined;
  }
}

export function mapFleetChainToLifiChainType(chain: WalletFleetChain): ChainType {
  switch (chain) {
    case 'evm':
      return ChainType.EVM;
    case 'solana':
      return ChainType.SVM;
    case 'sui':
      return ChainType.MVM;
    case 'bitcoin':
      return ChainType.UTXO;
  }
}

export function extractUserSummary(params: {
  linkedAccounts: Array<{
    address?: string | null;
    connector_type?: string | null;
    email?: string | null;
    type?: string | null;
  }>;
  userId: string;
}): WalletFleetUserSummary {
  const emailAccount = params.linkedAccounts.find(
    (account) => account.type === 'email' && account.address,
  );

  if (emailAccount?.address) {
    return {
      id: params.userId,
      email: emailAccount.address,
      loginMethod: 'email',
    };
  }

  const googleAccount = params.linkedAccounts.find(
    (account) => account.type === 'google_oauth' && account.email,
  );

  if (googleAccount?.email) {
    return {
      id: params.userId,
      email: googleAccount.email,
      loginMethod: 'google',
    };
  }

  const externalWalletAccount = params.linkedAccounts.find(
    (account) =>
      account.type === 'wallet' &&
      account.address &&
      account.connector_type !== 'embedded',
  );

  if (externalWalletAccount?.address) {
    return {
      id: params.userId,
      email: null,
      loginMethod: 'wallet',
    };
  }

  return {
    id: params.userId,
    email: null,
    loginMethod: 'unknown',
  };
}

function isCanonicalEmbeddedWalletAccount(
  account: PrivyLinkedAccountLike,
): account is Required<
  Pick<PrivyLinkedAccountLike, 'address' | 'chain_type' | 'id'>
> &
  PrivyLinkedAccountLike {
  return Boolean(
    account.type === 'wallet' &&
      account.address &&
      account.id &&
      mapPrivyChainTypeToFleetChain(account.chain_type) &&
      account.connector_type === 'embedded',
  );
}

export function buildWalletFleet(
  linkedAccounts: PrivyLinkedAccountLike[],
): Partial<Record<WalletFleetChain, WalletFleetEntry>> {
  return linkedAccounts.reduce<Partial<Record<WalletFleetChain, WalletFleetEntry>>>(
    (fleet, account) => {
      if (!isCanonicalEmbeddedWalletAccount(account)) {
        return fleet;
      }

      const chain = mapPrivyChainTypeToFleetChain(account.chain_type);
      if (!chain || fleet[chain]) {
        return fleet;
      }

      fleet[chain] = {
        address: account.address!,
        chain,
        chainType: mapFleetChainToLifiChainType(chain),
        connectorName: 'Privy Account',
        privyChainType: mapFleetChainToPrivyChainType(chain),
        publicKey: account.public_key ?? null,
        walletId: account.id!,
      };

      return fleet;
    },
    {},
  );
}

export function buildWalletFleetResponse(params: {
  linkedAccounts: PrivyLinkedAccountLike[];
  userId: string;
}): WalletFleetResponse {
  const wallets = buildWalletFleet(params.linkedAccounts);

  const readyStates = canonicalWalletFleetOrder.reduce<
    Record<WalletFleetChain, boolean>
  >(
    (state, chain) => {
      state[chain] = Boolean(wallets[chain]);
      return state;
    },
    {
      evm: false,
      solana: false,
      sui: false,
      bitcoin: false,
    },
  );

  return {
    readyStates,
    user: extractUserSummary({
      linkedAccounts: params.linkedAccounts,
      userId: params.userId,
    }),
    wallets,
  };
}

export function getMissingPrivyWalletChains(
  fleet: Partial<Record<WalletFleetChain, WalletFleetEntry>>,
): PrivyFleetWalletChain[] {
  return canonicalWalletFleetOrder
    .filter((chain) => !fleet[chain])
    .map((chain) => mapFleetChainToPrivyChainType(chain));
}
