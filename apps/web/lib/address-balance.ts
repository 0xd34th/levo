import type {
  Transaction,
  TransactionArgument,
} from '@mysten/sui/transactions';
import { SUI_COIN_TYPE } from '@/lib/coins';

export const ADDRESS_BALANCE_GAS_FEATURE_FLAG = 'enable_address_balance_gas_payments';

export type GasPaymentMode = 'address-balance' | 'legacy-coin';

export interface AddressBalanceGasStatus {
  featureEnabled: boolean;
  addressBalance: bigint;
  coinBalance: bigint;
  totalBalance: bigint;
  available: boolean;
  reason: string | null;
}

type BalanceResponse = {
  balance?: {
    balance?: string;
    totalBalance?: string;
    addressBalance?: string;
    coinBalance?: string;
  };
};

export interface AddressBalanceGasClient {
  getProtocolConfig?: () => Promise<{
    featureFlags?: Record<string, boolean>;
  }>;
  core?: {
    getBalance: (params: {
      owner: string;
      coinType?: string;
    }) => Promise<BalanceResponse>;
  };
}

type GasBuildTransaction = {
  setGasOwner: (owner: string) => void;
  setGasPayment: (payments: []) => void;
  build: (params: { client: never }) => Promise<Uint8Array>;
};

type SendFundsTransaction = {
  moveCall: Transaction['moveCall'];
  pure: {
    address: Transaction['pure']['address'];
  };
};

function parseBalance(value: string | null | undefined) {
  return value ? BigInt(value) : 0n;
}

export async function getAddressBalanceGasStatus(params: {
  client: AddressBalanceGasClient;
  owner: string;
  minBalanceMist?: bigint;
}): Promise<AddressBalanceGasStatus> {
  const minBalanceMist = params.minBalanceMist ?? 1n;
  let featureEnabled = false;

  try {
    const config = await params.client.getProtocolConfig?.();
    featureEnabled = Boolean(config?.featureFlags?.[ADDRESS_BALANCE_GAS_FEATURE_FLAG]);
  } catch {
    featureEnabled = false;
  }

  let addressBalance = 0n;
  let coinBalance = 0n;
  let totalBalance = 0n;

  try {
    const response = await params.client.core?.getBalance({
      owner: params.owner,
      coinType: SUI_COIN_TYPE,
    });
    addressBalance = parseBalance(response?.balance?.addressBalance);
    coinBalance = parseBalance(response?.balance?.coinBalance);
    totalBalance = parseBalance(response?.balance?.balance ?? response?.balance?.totalBalance);
    if (totalBalance === 0n) {
      totalBalance = addressBalance + coinBalance;
    }
  } catch {
    addressBalance = 0n;
    coinBalance = 0n;
    totalBalance = 0n;
  }

  const available = featureEnabled && addressBalance >= minBalanceMist;
  let reason: string | null = null;
  if (!featureEnabled) {
    reason = 'feature_disabled';
  } else if (addressBalance < minBalanceMist) {
    reason = 'insufficient_address_balance';
  }

  return {
    featureEnabled,
    addressBalance,
    coinBalance,
    totalBalance,
    available,
    reason,
  };
}

export function applyAddressBalanceGasPayment(tx: GasBuildTransaction, gasOwner: string) {
  tx.setGasOwner(gasOwner);
  tx.setGasPayment([]);
}

export async function buildTransactionBytesWithGasPreference(params: {
  client: AddressBalanceGasClient;
  gasOwner: string;
  buildTransaction: () => GasBuildTransaction | Promise<GasBuildTransaction>;
  minAddressBalanceMist?: bigint;
  allowLegacyFallback?: boolean;
}): Promise<{
  txBytes: Uint8Array;
  gasMode: GasPaymentMode;
  status: AddressBalanceGasStatus;
}> {
  const allowLegacyFallback = params.allowLegacyFallback ?? true;
  const status = await getAddressBalanceGasStatus({
    client: params.client,
    owner: params.gasOwner,
    minBalanceMist: params.minAddressBalanceMist,
  });

  if (status.available) {
    const tx = await params.buildTransaction();
    applyAddressBalanceGasPayment(tx, params.gasOwner);
    try {
      return {
        txBytes: await tx.build({ client: params.client as never }),
        gasMode: 'address-balance',
        status,
      };
    } catch (error) {
      if (!allowLegacyFallback) {
        throw error;
      }
    }
  }

  if (!allowLegacyFallback) {
    throw new Error(status.reason ?? 'address-balance gas unavailable');
  }

  const fallbackTx = await params.buildTransaction();
  fallbackTx.setGasOwner(params.gasOwner);
  return {
    txBytes: await fallbackTx.build({ client: params.client as never }),
    gasMode: 'legacy-coin',
    status,
  };
}

export function sendFundsToAddressBalance(params: {
  tx: SendFundsTransaction;
  coin: TransactionArgument;
  recipient: string;
  coinType: string;
}) {
  params.tx.moveCall({
    target: '0x2::coin::send_funds',
    typeArguments: [params.coinType],
    arguments: [params.coin, params.tx.pure.address(params.recipient)],
  });
}
