import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  Transaction,
  TransactionDataBuilder,
  coinWithBalance,
  type TransactionArgument,
  type TransactionObjectArgument,
} from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
  MAINNET_USDC_TYPE,
  getConfiguredLevoUsdCoinType,
  getUserFacingUsdcCoinType,
} from '@/lib/coins';
import { getGasStationKeypair } from '@/lib/gas-station';
import { prisma } from '@/lib/prisma';
import { getPrivyClient } from '@/lib/privy-auth';
import {
  buildPrivyRawSignAuthorizationRequest,
  signSuiTransaction,
} from '@/lib/privy-wallet';
import { acquireRedisLock } from '@/lib/redis-lock';
import { getRedis } from '@/lib/rate-limit';
import { getStableLayerManagerKeypair } from '@/lib/stable-layer-manager';
import { getStableLayerClient } from '@/lib/stable-layer';
import { getSuiClient } from '@/lib/sui';
import {
  annotateNoValidGasCoinsError,
  getAnnotatedTransactionErrorMessage,
} from '@/lib/sui-transaction-errors';

export type EarnAction = 'stake' | 'claim' | 'withdraw';
export type YieldSettlementMode = 'server_payout' | 'disabled';
export type ClaimBlockedReason = 'below_minimum_net_yield';

export interface EarnSummary {
  walletReady: boolean;
  availableUsdc: string;
  depositedUsdc: string;
  claimableYieldUsdc: string;
  claimableYieldReliable: boolean;
  yieldSettlementMode: YieldSettlementMode;
  claimAllowed: boolean;
  claimMinimumYieldUsdc: string;
  claimBlockedReason: ClaimBlockedReason | null;
}

export interface EarnPreview extends EarnSummary {
  previewToken: string;
  action: EarnAction;
  amount: string;
  principalReceivesUsdc: string;
  yieldReceivesUsdc: string;
  userReceivesUsdc: string;
  yieldSettlementSkipped?: boolean;
}

export type EarnExecuteResult =
  | {
      status: 'authorization_required';
      authorizationRequest: ReturnType<typeof buildPrivyRawSignAuthorizationRequest>;
    }
  | {
      status: 'confirmed' | 'pending' | 'partial';
      action: EarnAction;
      txDigest: string;
      message?: string;
    };

export interface EarnConfirmResult {
  status: 'confirmed' | 'pending' | 'partial';
  txDigest: string;
  message?: string;
}

type StableLayerEarnInternals = {
  bucketClient: {
    buildDepositToSavingPoolTransaction: (
      tx: Transaction,
      params: {
        address: string;
        accountObjectOrId?: string | TransactionArgument;
        lpType: string;
        depositCoinOrAmount: number | TransactionArgument;
      },
    ) => Promise<void>;
    buildPSMSwapOutTransaction: (
      tx: Transaction,
      params: {
        coinType: string;
        usdbCoinOrAmount: number | bigint | TransactionArgument;
      },
    ) => Promise<TransactionObjectArgument>;
    getConfig: () => Promise<{
      FRAMEWORK_PACKAGE_ID: string;
    }>;
    getUsdbCoinType: () => Promise<string>;
    getUserAccounts: (params: {
      address: string;
    }) => Promise<BucketUserAccount[]>;
  };
};

type BucketUserAccount = {
  id: {
    id: string;
  };
  alias: string | null;
};

type WalletBinding = {
  privyUserId: string | null;
  privyWalletId: string | null;
  suiAddress: string | null;
  suiPublicKey: string | null;
};

type EarnAccountingState = {
  retainedAccountId: string | null;
  rewardDebtPayoutUsdc: bigint;
  rewardDebtRetainedUsdb: bigint;
  claimedUsdcTotal: bigint;
  retainedUsdbTotal: bigint;
  lastKnownDepositedUsdc: bigint;
};

type EarnGlobalState = {
  accPayoutPerShareUsdcE18: bigint;
  accRetainedPerShareUsdbE18: bigint;
  lastHarvestTxDigest: string | null;
  lastHarvestedRewardUsdb: bigint;
  lastHarvestedPayoutUsdc: bigint;
  lastHarvestedRetainedUsdb: bigint;
};

type EarnPosition = {
  accounting: EarnAccountingState;
  globalState: EarnGlobalState;
  availableUsdc: bigint;
  depositedUsdc: bigint;
  claimableYieldUsdc: bigint;
  claimableYieldReliable: boolean;
  harvestedOutstandingUsdc: bigint;
  harvestedOutstandingRetainedUsdb: bigint;
  globalClaimableRewardUsdb: bigint;
  totalSupply: bigint;
  yieldSettlementMode: YieldSettlementMode;
};

type SettlementPlan = {
  xUserId: string;
  action: EarnAction;
  stableCoinType: string;
  senderAddress: string;
  yieldSettlementMode: YieldSettlementMode;
  yieldSettled: boolean;
  preBalanceUsdc: bigint;
  postBalanceUsdc: bigint;
  userPayoutOwedUsdc: bigint;
  userRetainedOwedUsdb: bigint;
  harvestedRewardUsdb: bigint;
  harvestedPayoutUsdc: bigint;
  harvestedRetainedUsdb: bigint;
  nextAccPayoutPerShareUsdcE18: bigint;
  nextAccRetainedPerShareUsdbE18: bigint;
};

type SignedTxBundle = {
  txDigest: string;
  txBytesBase64: string;
  signatures: string[];
};

export interface ResolvedClaimableReward {
  amount: bigint;
  yieldSettlementSkipped: boolean;
}

type SettlementSnapshot = z.infer<typeof SettlementSnapshotSchema>;

type EarnDb = Pick<typeof prisma, 'earnAccounting' | 'earnGlobalState' | 'pendingEarnSettlement'>;

export const EARN_RETAINED_ACCOUNT_ALIAS = 'levo-earn-retained';

const ACC_PRECISION = 1_000_000_000_000_000_000n;
const MIN_EARN_CLAIM_YIELD_USDC = 40_000n;
const PREVIEW_TTL_SEC = 10 * 60;
const AUTHORIZATION_TTL_SEC = 5 * 60;
const PENDING_EARN_TTL_SEC = 15 * 60;
const HARVEST_LOCK_TTL_SEC = 60;
const SETTLEMENT_PARTIAL_MESSAGE =
  'Yield was settled, but principal withdraw did not complete. Your principal remains in Earn. Retry Withdraw to continue.';
const CLAIM_MINIMUM_YIELD_MESSAGE =
  'Claim available once yield reaches 0.04 USDC. Small claims cost more gas than they are worth.';

const WalletBindingSchema = z.object({
  privyUserId: z.string().nullable(),
  privyWalletId: z.string().nullable(),
  suiAddress: z.string().nullable(),
  suiPublicKey: z.string().nullable(),
});

const StagedPreviewSchema = z.object({
  xUserId: z.string().min(1),
  action: z.enum(['stake', 'claim', 'withdraw']),
  amount: z.string().regex(/^\d+$/),
  yieldSettlementMode: z.enum(['server_payout', 'disabled']),
  expectedYieldUsdc: z.string().regex(/^\d+$/),
  expectedPrincipalUsdc: z.string().regex(/^\d+$/),
  yieldSettlementSkipped: z.boolean().optional(),
});

const StagedAuthorizationSchema = z.object({
  action: z.enum(['stake', 'withdraw']),
  amount: z.string().regex(/^\d+$/),
  txBytesBase64: z.string().min(1),
  walletId: z.string().min(1),
  storedPublicKey: z.string().min(1),
  sponsored: z.boolean().default(false),
});

const PendingEarnBundleSchema = z.object({
  xUserId: z.string().min(1),
  action: z.literal('stake'),
  amount: z.string().regex(/^\d+$/),
  txBytesBase64: z.string().min(1),
  signatures: z.array(z.string().min(1)).min(1),
});

const SettlementSnapshotSchema = z.object({
  yieldSettled: z.boolean(),
  preBalanceUsdc: z.string().regex(/^\d+$/),
  postBalanceUsdc: z.string().regex(/^\d+$/),
  userPayoutOwedUsdc: z.string().regex(/^\d+$/),
  userRetainedOwedUsdb: z.string().regex(/^\d+$/),
  nextAccPayoutPerShareUsdcE18: z.string().regex(/^\d+$/),
  nextAccRetainedPerShareUsdbE18: z.string().regex(/^\d+$/),
  harvestedRewardUsdb: z.string().regex(/^\d+$/),
  harvestedPayoutUsdc: z.string().regex(/^\d+$/),
  harvestedRetainedUsdb: z.string().regex(/^\d+$/),
});

type StagedPreview = z.infer<typeof StagedPreviewSchema>;
type StagedAuthorization = z.infer<typeof StagedAuthorizationSchema>;
type PendingEarnBundle = z.infer<typeof PendingEarnBundleSchema>;

function getPreviewKey(previewToken: string) {
  return `earn-preview:${previewToken}`;
}

function getAuthorizationKey(previewToken: string) {
  return `earn-authorization:${previewToken}`;
}

function getPendingEarnKey(txDigest: string) {
  return `earn-pending:${txDigest}`;
}

function zeroSummary(yieldSettlementMode: YieldSettlementMode): EarnSummary {
  return {
    walletReady: false,
    availableUsdc: '0',
    depositedUsdc: '0',
    claimableYieldUsdc: '0',
    claimableYieldReliable: true,
    yieldSettlementMode,
    claimAllowed: false,
    claimMinimumYieldUsdc: serializeBigInt(MIN_EARN_CLAIM_YIELD_USDC),
    claimBlockedReason: null,
  };
}

function getYieldSettlementMode(): YieldSettlementMode {
  return getStableLayerManagerKeypair() ? 'server_payout' : 'disabled';
}

function assertEarnConfig() {
  const network = process.env.NEXT_PUBLIC_SUI_NETWORK?.trim();
  if (network !== 'mainnet') {
    throw new Error('Earn is only available on mainnet');
  }

  const stableCoinType = getConfiguredLevoUsdCoinType(
    process.env.NEXT_PUBLIC_PACKAGE_ID,
    process.env.LEVO_USD_COIN_TYPE,
    process.env.NEXT_PUBLIC_SUI_NETWORK,
  );
  if (!stableCoinType) {
    throw new Error('StableLayer Earn is not configured');
  }

  const userFacingUsdcType = getUserFacingUsdcCoinType(
    process.env.NEXT_PUBLIC_SUI_NETWORK,
    process.env.NEXT_PUBLIC_PACKAGE_ID,
  );
  if (userFacingUsdcType !== MAINNET_USDC_TYPE) {
    throw new Error('Mainnet USDC is not configured');
  }

  return {
    stableCoinType,
    userFacingUsdcType,
  };
}

function parseBaseUnitAmount(amount: string | undefined, action: EarnAction) {
  if (action === 'claim') {
    return 0n;
  }

  if (!amount || !/^\d+$/.test(amount)) {
    throw new Error('Amount is required');
  }

  const parsedAmount = BigInt(amount);
  if (parsedAmount <= 0n) {
    throw new Error('Amount must be greater than zero');
  }

  return parsedAmount;
}

function parseBigIntLike(value: bigint | number | string) {
  return BigInt(value);
}

function serializeBigInt(value: bigint) {
  return value.toString();
}

function getClaimAvailability(params: {
  walletReady: boolean;
  claimableYieldUsdc: bigint;
  yieldSettlementMode: YieldSettlementMode;
}): {
  claimAllowed: boolean;
  claimBlockedReason: ClaimBlockedReason | null;
} {
  if (!params.walletReady || params.yieldSettlementMode !== 'server_payout') {
    return {
      claimAllowed: false,
      claimBlockedReason: null,
    };
  }

  if (params.claimableYieldUsdc <= 0n) {
    return {
      claimAllowed: false,
      claimBlockedReason: null,
    };
  }

  if (params.claimableYieldUsdc < MIN_EARN_CLAIM_YIELD_USDC) {
    return {
      claimAllowed: false,
      claimBlockedReason: 'below_minimum_net_yield',
    };
  }

  return {
    claimAllowed: true,
    claimBlockedReason: null,
  };
}

function scaleShare(amount: bigint, accPerShareE18: bigint) {
  return (amount * accPerShareE18) / ACC_PRECISION;
}

function computePendingReward(params: {
  balance: bigint;
  accPerShareE18: bigint;
  rewardDebt: bigint;
}) {
  const accrued = scaleShare(params.balance, params.accPerShareE18);
  return accrued > params.rewardDebt ? accrued - params.rewardDebt : 0n;
}

function normalizeObjectTypeTag(typeTag: string): string {
  const separatorIndex = typeTag.indexOf('::');
  if (separatorIndex === -1) {
    return typeTag;
  }

  try {
    return normalizeSuiAddress(typeTag.slice(0, separatorIndex)) + typeTag.slice(separatorIndex);
  } catch {
    return typeTag;
  }
}

function getTransactionObjectArgument(tx: Transaction, objectId: string) {
  const candidate = tx as Transaction & {
    object?: (id: string) => TransactionArgument;
  };

  return typeof candidate.object === 'function'
    ? candidate.object(objectId)
    : objectId as unknown as TransactionArgument;
}

function getDevInspectFailureMessage(result: unknown) {
  if (typeof result !== 'object' || result === null) {
    return 'unknown dev-inspect failure';
  }

  const candidate = result as {
    error?: string;
    effects?: {
      status?: {
        status?: string;
        error?: string;
      };
    };
  };

  if (candidate.effects?.status?.status === 'success') {
    return null;
  }

  return candidate.effects?.status?.error ?? candidate.error ?? 'unknown dev-inspect failure';
}

function parseLastDevInspectU64(result: unknown) {
  if (typeof result !== 'object' || result === null) {
    return null;
  }

  const candidate = result as {
    results?: Array<{
      returnValues?: Array<[number[] | Uint8Array, string]>;
    }>;
  };

  const results = candidate.results;
  if (!results || results.length === 0) {
    return null;
  }

  const encoded = results[results.length - 1]?.returnValues?.[0];
  if (!encoded || encoded[1] !== 'u64') {
    return null;
  }

  const bytes = encoded[0];
  if (!(Array.isArray(bytes) || bytes instanceof Uint8Array) || bytes.length < 8) {
    return null;
  }

  return Buffer.from(bytes).readBigUInt64LE(0);
}

export function splitRetainedYieldUsdb(amount: bigint) {
  const userClaimUsdb = (amount * 9n) / 10n;
  const retainedUsdb = amount - userClaimUsdb;

  return {
    userClaimUsdb,
    retainedUsdb,
  };
}

export function findEarnRetainedAccountId(accounts: BucketUserAccount[]): string | null {
  const retainedAccount = accounts.find((account) => account.alias === EARN_RETAINED_ACCOUNT_ALIAS);
  return retainedAccount ? normalizeSuiAddress(retainedAccount.id.id) : null;
}

export function extractCreatedEarnRetainedAccountId(
  objectChanges: unknown[] | null | undefined,
  frameworkPackageId: string,
) {
  const normalizedFrameworkPackageId = normalizeSuiAddress(frameworkPackageId);

  for (const change of objectChanges ?? []) {
    if (typeof change !== 'object' || change === null) {
      continue;
    }

    const candidate = change as {
      objectId?: string;
      objectType?: string;
      type?: string;
    };

    if (
      candidate.type === 'created' &&
      typeof candidate.objectId === 'string' &&
      typeof candidate.objectType === 'string' &&
      normalizeObjectTypeTag(candidate.objectType) ===
        `${normalizedFrameworkPackageId}::account::Account`
    ) {
      return normalizeSuiAddress(candidate.objectId);
    }
  }

  return null;
}

function parseEarnAccountingState(
  row:
    | {
        retainedAccountId: string | null;
        rewardDebtPayoutUsdc: string;
        rewardDebtRetainedUsdb: string;
        claimedUsdcTotal: bigint;
        retainedUsdbTotal: bigint;
        lastKnownDepositedUsdc: bigint;
      }
    | null,
): EarnAccountingState {
  if (!row) {
    return {
      retainedAccountId: null,
      rewardDebtPayoutUsdc: 0n,
      rewardDebtRetainedUsdb: 0n,
      claimedUsdcTotal: 0n,
      retainedUsdbTotal: 0n,
      lastKnownDepositedUsdc: 0n,
    };
  }

  return {
    retainedAccountId: row.retainedAccountId ? normalizeSuiAddress(row.retainedAccountId) : null,
    rewardDebtPayoutUsdc: BigInt(row.rewardDebtPayoutUsdc),
    rewardDebtRetainedUsdb: BigInt(row.rewardDebtRetainedUsdb),
    claimedUsdcTotal: row.claimedUsdcTotal,
    retainedUsdbTotal: row.retainedUsdbTotal,
    lastKnownDepositedUsdc: row.lastKnownDepositedUsdc,
  };
}

function parseEarnGlobalState(
  row:
    | {
        accPayoutPerShareUsdcE18: string;
        accRetainedPerShareUsdbE18: string;
        lastHarvestTxDigest: string | null;
        lastHarvestedRewardUsdb: bigint;
        lastHarvestedPayoutUsdc: bigint;
        lastHarvestedRetainedUsdb: bigint;
      }
    | null,
): EarnGlobalState {
  if (!row) {
    return {
      accPayoutPerShareUsdcE18: 0n,
      accRetainedPerShareUsdbE18: 0n,
      lastHarvestTxDigest: null,
      lastHarvestedRewardUsdb: 0n,
      lastHarvestedPayoutUsdc: 0n,
      lastHarvestedRetainedUsdb: 0n,
    };
  }

  return {
    accPayoutPerShareUsdcE18: BigInt(row.accPayoutPerShareUsdcE18),
    accRetainedPerShareUsdbE18: BigInt(row.accRetainedPerShareUsdbE18),
    lastHarvestTxDigest: row.lastHarvestTxDigest,
    lastHarvestedRewardUsdb: row.lastHarvestedRewardUsdb,
    lastHarvestedPayoutUsdc: row.lastHarvestedPayoutUsdc,
    lastHarvestedRetainedUsdb: row.lastHarvestedRetainedUsdb,
  };
}

function serializeSettlementSnapshot(plan: SettlementPlan): SettlementSnapshot {
  return {
    yieldSettled: plan.yieldSettled,
    preBalanceUsdc: serializeBigInt(plan.preBalanceUsdc),
    postBalanceUsdc: serializeBigInt(plan.postBalanceUsdc),
    userPayoutOwedUsdc: serializeBigInt(plan.userPayoutOwedUsdc),
    userRetainedOwedUsdb: serializeBigInt(plan.userRetainedOwedUsdb),
    nextAccPayoutPerShareUsdcE18: serializeBigInt(plan.nextAccPayoutPerShareUsdcE18),
    nextAccRetainedPerShareUsdbE18: serializeBigInt(plan.nextAccRetainedPerShareUsdbE18),
    harvestedRewardUsdb: serializeBigInt(plan.harvestedRewardUsdb),
    harvestedPayoutUsdc: serializeBigInt(plan.harvestedPayoutUsdc),
    harvestedRetainedUsdb: serializeBigInt(plan.harvestedRetainedUsdb),
  };
}

function parseSettlementSnapshot(raw: unknown) {
  const parsed = SettlementSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Earn settlement state is invalid');
  }

  return {
    yieldSettled: parsed.data.yieldSettled,
    preBalanceUsdc: BigInt(parsed.data.preBalanceUsdc),
    postBalanceUsdc: BigInt(parsed.data.postBalanceUsdc),
    userPayoutOwedUsdc: BigInt(parsed.data.userPayoutOwedUsdc),
    userRetainedOwedUsdb: BigInt(parsed.data.userRetainedOwedUsdb),
    nextAccPayoutPerShareUsdcE18: BigInt(parsed.data.nextAccPayoutPerShareUsdcE18),
    nextAccRetainedPerShareUsdbE18: BigInt(parsed.data.nextAccRetainedPerShareUsdbE18),
    harvestedRewardUsdb: BigInt(parsed.data.harvestedRewardUsdb),
    harvestedPayoutUsdc: BigInt(parsed.data.harvestedPayoutUsdc),
    harvestedRetainedUsdb: BigInt(parsed.data.harvestedRetainedUsdb),
  };
}

function isClaimRewardDryRunInferenceFailure(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes(
      'StableLayerClient.getClaimRewardUsdbAmount: dry-run did not succeed; cannot infer claimable USDB.',
    )
  );
}

export async function resolveClaimableRewardUsdb(params: {
  action: EarnAction;
  fetchClaimRewardUsdbAmount: () => Promise<bigint>;
}): Promise<ResolvedClaimableReward> {
  try {
    return {
      amount: await params.fetchClaimRewardUsdbAmount(),
      yieldSettlementSkipped: false,
    };
  } catch (error) {
    if (params.action === 'withdraw' && isClaimRewardDryRunInferenceFailure(error)) {
      return {
        amount: 0n,
        yieldSettlementSkipped: true,
      };
    }

    throw error;
  }
}

async function getWalletBinding(xUserId: string): Promise<WalletBinding | null> {
  const walletBinding = await prisma.xUser.findUnique({
    where: { xUserId },
    select: {
      privyUserId: true,
      privyWalletId: true,
      suiAddress: true,
      suiPublicKey: true,
    },
  });

  const parsed = WalletBindingSchema.safeParse(walletBinding);
  return parsed.success ? parsed.data : null;
}

function assertWalletReady(
  walletBinding: WalletBinding | null,
): asserts walletBinding is {
  privyUserId: string;
  privyWalletId: string;
  suiAddress: string;
  suiPublicKey: string;
} {
  if (
    !walletBinding?.privyUserId ||
    !walletBinding.privyWalletId ||
    !walletBinding.suiAddress ||
    !walletBinding.suiPublicKey
  ) {
    throw new Error('Embedded wallet is not ready yet');
  }
}

async function getEarnBalances(senderAddress: string, stableCoinType: string) {
  const client = getSuiClient();
  const [availableUsdc, depositedUsdc] = await Promise.all([
    client.getBalance({
      owner: senderAddress,
      coinType: MAINNET_USDC_TYPE,
    }).then((result) => BigInt(result.totalBalance)),
    client.getBalance({
      owner: senderAddress,
      coinType: stableCoinType,
    }).then((result) => BigInt(result.totalBalance)),
  ]);

  return {
    availableUsdc,
    depositedUsdc,
  };
}

async function loadEarnAccountingState(xUserId: string) {
  const row = await prisma.earnAccounting.findUnique({
    where: { xUserId },
    select: {
      retainedAccountId: true,
      rewardDebtPayoutUsdc: true,
      rewardDebtRetainedUsdb: true,
      claimedUsdcTotal: true,
      retainedUsdbTotal: true,
      lastKnownDepositedUsdc: true,
    },
  });

  return parseEarnAccountingState(row);
}

async function loadEarnGlobalState(stableCoinType: string) {
  const row = await prisma.earnGlobalState.findUnique({
    where: { stableCoinType },
    select: {
      accPayoutPerShareUsdcE18: true,
      accRetainedPerShareUsdbE18: true,
      lastHarvestTxDigest: true,
      lastHarvestedRewardUsdb: true,
      lastHarvestedPayoutUsdc: true,
      lastHarvestedRetainedUsdb: true,
    },
  });

  return parseEarnGlobalState(row);
}

async function ensureEarnAccountingBaseline(params: {
  xUserId: string;
  accounting: EarnAccountingState;
  depositedUsdc: bigint;
}) {
  if (params.depositedUsdc <= 0n || params.accounting.lastKnownDepositedUsdc > 0n) {
    return params.accounting;
  }

  await prisma.earnAccounting.upsert({
    where: { xUserId: params.xUserId },
    update: {
      lastKnownDepositedUsdc: params.depositedUsdc,
    },
    create: {
      xUserId: params.xUserId,
      lastKnownDepositedUsdc: params.depositedUsdc,
    },
  });

  return {
    ...params.accounting,
    lastKnownDepositedUsdc: params.depositedUsdc,
  };
}

async function inspectGlobalClaimableRewardUsdb(params: {
  senderAddress: string;
  stableCoinType: string;
}) {
  // Simulate a full claim transaction (releaseRewards → claim) to get the true
  // claimable USDB including unreleased yield sitting in the Bucket saving pool.
  // claimable_amount() on STABLE_VAULT_FARM only reads the farm's internal state
  // which is NOT updated until a claim/pay actually executes, so it always returns 0
  // when no recent settlements have occurred.
  const managerKeypair = getStableLayerManagerKeypair();
  if (managerKeypair) {
    const managerAddress = managerKeypair.toSuiAddress();
    const stableLayerClient = await getStableLayerClient(managerAddress);
    const maybeGetClaimRewardUsdbAmount = stableLayerClient as unknown as {
      getClaimRewardUsdbAmount?: (params: {
        stableCoinType: string;
        sender: string;
      }) => Promise<bigint>;
    };
    if (typeof maybeGetClaimRewardUsdbAmount.getClaimRewardUsdbAmount === 'function') {
      return await maybeGetClaimRewardUsdbAmount.getClaimRewardUsdbAmount({
        stableCoinType: params.stableCoinType,
        sender: managerAddress,
      });
    }
  }

  // Fallback: read farm's internal state directly (may undercount unreleased yield).
  const stableLayerClient = await getStableLayerClient(params.senderAddress);
  const constants = stableLayerClient.getConstants();
  const tx = new Transaction();
  tx.setSender(params.senderAddress);
  tx.moveCall({
    target: `${constants.STABLE_VAULT_FARM_PACKAGE_ID}::stable_vault_farm::claimable_amount`,
    typeArguments: [
      constants.STABLE_LP_TYPE,
      constants.USDC_TYPE,
      params.stableCoinType,
      constants.YUSDB_TYPE,
      constants.SAVING_TYPE,
    ],
    arguments: [getTransactionObjectArgument(tx, constants.STABLE_VAULT_FARM)],
  });

  const result = await getSuiClient().devInspectTransactionBlock({
    sender: params.senderAddress,
    transactionBlock: tx,
  });
  const failureMessage = getDevInspectFailureMessage(result);
  if (failureMessage) {
    throw new Error(failureMessage);
  }

  const amount = parseLastDevInspectU64(result);
  if (amount === null) {
    throw new Error('StableLayer claimable amount inspect returned no u64');
  }

  return amount;
}

async function maybeApplyGasSponsor(tx: Transaction, sponsored: boolean) {
  if (!sponsored) {
    return false;
  }

  const gasKeypair = getGasStationKeypair();
  if (!gasKeypair) {
    return false;
  }

  const gasAddress = gasKeypair.toSuiAddress();
  tx.setGasOwner(gasAddress);
  return true;
}

async function buildUserEarnTransaction(params: {
  action: 'stake' | 'withdraw';
  senderAddress: string;
  stableCoinType: string;
  amount: bigint;
  sponsored: boolean;
}) {
  const tx = new Transaction();
  tx.setSender(params.senderAddress);
  const sponsorApplied = await maybeApplyGasSponsor(tx, params.sponsored);

  const stableLayerClient = await getStableLayerClient(params.senderAddress);
  if (params.action === 'stake') {
    const usdcCoin = tx.add(
      coinWithBalance({
        type: MAINNET_USDC_TYPE,
        balance: params.amount,
      }),
    );

    await stableLayerClient.buildMintTx({
      tx,
      sender: params.senderAddress,
      stableCoinType: params.stableCoinType,
      usdcCoin,
      amount: params.amount,
      autoTransfer: true,
    });
  } else {
    const principalUsdcCoin = await stableLayerClient.buildBurnTx({
      tx,
      sender: params.senderAddress,
      stableCoinType: params.stableCoinType,
      amount: params.amount,
      autoTransfer: false,
    });

    if (!principalUsdcCoin) {
      throw new Error('StableLayer withdraw did not return USDC');
    }

    tx.transferObjects([principalUsdcCoin as TransactionObjectArgument], params.senderAddress);
  }

  return { tx, sponsorApplied };
}

async function buildUserEarnTransactionBytes(params: {
  action: 'stake' | 'withdraw';
  senderAddress: string;
  stableCoinType: string;
  amount: bigint;
  sponsored: boolean;
}) {
  const { tx, sponsorApplied } = await buildUserEarnTransaction(params);
  try {
    const txBytes = await tx.build({ client: getSuiClient() });
    return { txBytes, sponsorApplied };
  } catch (error) {
    throw new Error(
      getAnnotatedTransactionErrorMessage(error) ?? 'Failed to build Earn transaction',
    );
  }
}

async function stagePreview(preview: StagedPreview) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    throw new Error('Earn preview store unavailable');
  }

  const previewToken = randomUUID();
  await redis.set(getPreviewKey(previewToken), JSON.stringify(preview), 'EX', PREVIEW_TTL_SEC);
  return previewToken;
}

async function loadPreview(previewToken: string): Promise<StagedPreview | null> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return null;
  }

  try {
    const raw = await redis.get(getPreviewKey(previewToken));
    if (!raw) {
      return null;
    }

    const parsed = StagedPreviewSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Failed to load Earn preview bundle', { previewToken, error });
    return null;
  }
}

async function clearPreview(previewToken: string) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return;
  }

  try {
    await redis.del(getPreviewKey(previewToken));
  } catch (error) {
    console.warn('Failed to clear Earn preview bundle', { previewToken, error });
  }
}

async function stageAuthorization(previewToken: string, payload: StagedAuthorization) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    throw new Error('Earn authorization store unavailable');
  }

  await redis.set(
    getAuthorizationKey(previewToken),
    JSON.stringify(payload),
    'EX',
    AUTHORIZATION_TTL_SEC,
  );
}

async function loadAuthorization(previewToken: string): Promise<StagedAuthorization | null> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return null;
  }

  try {
    const raw = await redis.get(getAuthorizationKey(previewToken));
    if (!raw) {
      return null;
    }

    const parsed = StagedAuthorizationSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Failed to load Earn authorization bundle', { previewToken, error });
    return null;
  }
}

async function clearAuthorization(previewToken: string) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return;
  }

  try {
    await redis.del(getAuthorizationKey(previewToken));
  } catch (error) {
    console.warn('Failed to clear Earn authorization bundle', { previewToken, error });
  }
}

async function stagePendingEarn(txDigest: string, payload: PendingEarnBundle) {
  await prisma.pendingEarn.upsert({
    where: { txDigest },
    update: {
      xUserId: payload.xUserId,
      action: payload.action,
      amount: payload.amount,
      txBytesBase64: payload.txBytesBase64,
      signatures: payload.signatures,
      createdAt: new Date(),
    },
    create: {
      txDigest,
      xUserId: payload.xUserId,
      action: payload.action,
      amount: payload.amount,
      txBytesBase64: payload.txBytesBase64,
      signatures: payload.signatures,
    },
  });

  prisma.pendingEarn.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - PENDING_EARN_TTL_SEC * 1000) } },
  }).catch(() => {});

  try {
    const redis = getRedis();
    if (redis.status === 'ready') {
      await redis.set(
        getPendingEarnKey(txDigest),
        JSON.stringify(payload),
        'EX',
        PENDING_EARN_TTL_SEC,
      );
    }
  } catch (error) {
    console.warn('Failed to cache pending Earn in Redis (DB record persisted)', { txDigest, error });
  }
}

async function loadPendingEarn(txDigest: string): Promise<PendingEarnBundle | null> {
  prisma.pendingEarn.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - PENDING_EARN_TTL_SEC * 1000) } },
  }).catch(() => {});

  try {
    const redis = getRedis();
    if (redis.status === 'ready') {
      const raw = await redis.get(getPendingEarnKey(txDigest));
      if (raw) {
        const parsed = PendingEarnBundleSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          return parsed.data;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to load pending Earn from Redis; falling back to DB', { txDigest, error });
  }

  try {
    const row = await prisma.pendingEarn.findUnique({ where: { txDigest } });
    if (!row) {
      return null;
    }

    const ageSeconds = (Date.now() - row.createdAt.getTime()) / 1000;
    if (ageSeconds > PENDING_EARN_TTL_SEC) {
      await prisma.pendingEarn.delete({ where: { txDigest } }).catch(() => {});
      return null;
    }

    const parsed = PendingEarnBundleSchema.safeParse({
      xUserId: row.xUserId,
      action: row.action,
      amount: row.amount ?? '0',
      txBytesBase64: row.txBytesBase64,
      signatures: row.signatures,
    });
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Failed to load pending Earn from DB', { txDigest, error });
    return null;
  }
}

async function clearPendingEarn(txDigest: string) {
  try {
    await prisma.pendingEarn.delete({ where: { txDigest } });
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && (error as { code: string }).code === 'P2025')) {
      console.warn('Failed to clear pending Earn from DB', { txDigest, error });
    }
  }

  try {
    const redis = getRedis();
    if (redis.status === 'ready') {
      await redis.del(getPendingEarnKey(txDigest));
    }
  } catch (error) {
    console.warn('Failed to clear pending Earn from Redis', { txDigest, error });
  }
}

async function createPendingSettlement(params: {
  xUserId: string;
  action: 'claim' | 'withdraw';
  stableCoinType: string;
  previewToken: string;
  status: 'yield_pending' | 'principal_pending';
  expectedYieldUsdc: bigint;
  expectedPrincipalUsdc: bigint;
  snapshot: SettlementSnapshot;
  yieldBundle?: SignedTxBundle | null;
  principalBundle?: SignedTxBundle | null;
}) {
  return prisma.pendingEarnSettlement.create({
    data: {
      xUserId: params.xUserId,
      action: params.action,
      stableCoinType: params.stableCoinType,
      previewToken: params.previewToken,
      status: params.status,
      expectedYieldUsdc: params.expectedYieldUsdc,
      expectedPrincipalUsdc: params.expectedPrincipalUsdc,
      yieldTxDigest: params.yieldBundle?.txDigest ?? null,
      yieldTxBytesBase64: params.yieldBundle?.txBytesBase64 ?? null,
      yieldSignatures: params.yieldBundle?.signatures ?? [],
      principalTxDigest: params.principalBundle?.txDigest ?? null,
      principalTxBytesBase64: params.principalBundle?.txBytesBase64 ?? null,
      principalSignatures: params.principalBundle?.signatures ?? [],
      settlementSnapshot: params.snapshot,
    },
  });
}

async function loadSettlementByTxDigest(txDigest: string) {
  return prisma.pendingEarnSettlement.findFirst({
    where: {
      OR: [
        { yieldTxDigest: txDigest },
        { principalTxDigest: txDigest },
      ],
    },
  });
}

function buildSignedBundle(txBytes: Uint8Array, signatures: string[]): SignedTxBundle {
  return {
    txDigest: TransactionDataBuilder.getDigestFromBytes(txBytes),
    txBytesBase64: Buffer.from(txBytes).toString('base64'),
    signatures,
  };
}

function decodeSignedBundle(params: {
  txDigest: string | null;
  txBytesBase64: string | null;
  signatures: string[];
}): SignedTxBundle | null {
  if (!params.txDigest || !params.txBytesBase64 || params.signatures.length === 0) {
    return null;
  }

  return {
    txDigest: params.txDigest,
    txBytesBase64: params.txBytesBase64,
    signatures: params.signatures,
  };
}

async function signManagerTransaction(txBytes: Uint8Array) {
  const managerKeypair = getStableLayerManagerKeypair();
  if (!managerKeypair) {
    throw new Error('StableLayer manager signer is not configured');
  }

  const signature = await managerKeypair.signTransaction(txBytes);
  return [signature.signature];
}

async function buildManagerSignedBundle(tx: Transaction) {
  const txBytes = await tx.build({ client: getSuiClient() });
  return buildSignedBundle(txBytes, await signManagerTransaction(txBytes));
}

async function buildUserSignedBundle(params: {
  authorization: StagedAuthorization;
  authorizationSignature: string;
}) {
  const txBytes = Uint8Array.from(Buffer.from(params.authorization.txBytesBase64, 'base64'));
  const signatures: string[] = [];
  const privy = getPrivyClient();
  const userSignature = await signSuiTransaction(
    privy,
    params.authorization.walletId,
    params.authorization.storedPublicKey,
    txBytes,
    { signatures: [params.authorizationSignature] },
  );
  signatures.push(userSignature);

  if (params.authorization.sponsored) {
    const gasKeypair = getGasStationKeypair();
    if (gasKeypair) {
      const gasSignature = await gasKeypair.signTransaction(txBytes);
      signatures.push(gasSignature.signature);
    }
  }

  return buildSignedBundle(txBytes, signatures);
}

async function executeSignedBundle(bundle: SignedTxBundle) {
  return getSuiClient().executeTransactionBlock({
    transactionBlock: Uint8Array.from(Buffer.from(bundle.txBytesBase64, 'base64')),
    signature: bundle.signatures,
    options: {
      showEffects: true,
      showBalanceChanges: true,
      showObjectChanges: true,
    },
  });
}

async function getEarnPosition(params: {
  xUserId: string;
  senderAddress: string;
  stableCoinType: string;
}) {
  const yieldSettlementMode = getYieldSettlementMode();
  const [{ availableUsdc, depositedUsdc }, accountingBase, globalState] = await Promise.all([
    getEarnBalances(params.senderAddress, params.stableCoinType),
    loadEarnAccountingState(params.xUserId),
    loadEarnGlobalState(params.stableCoinType),
  ]);

  const accounting = await ensureEarnAccountingBaseline({
    xUserId: params.xUserId,
    accounting: accountingBase,
    depositedUsdc,
  });

  const harvestedOutstandingUsdc = computePendingReward({
    balance: depositedUsdc,
    accPerShareE18: globalState.accPayoutPerShareUsdcE18,
    rewardDebt: accounting.rewardDebtPayoutUsdc,
  });
  const harvestedOutstandingRetainedUsdb = computePendingReward({
    balance: depositedUsdc,
    accPerShareE18: globalState.accRetainedPerShareUsdbE18,
    rewardDebt: accounting.rewardDebtRetainedUsdb,
  });

  let claimableYieldReliable = true;
  let globalClaimableRewardUsdb = 0n;
  let totalSupply = 0n;

  if (depositedUsdc > 0n) {
    try {
      const stableLayerClient = await getStableLayerClient(params.senderAddress);
      const [claimableRaw, totalSupplyRaw] = await Promise.all([
        inspectGlobalClaimableRewardUsdb({
          senderAddress: params.senderAddress,
          stableCoinType: params.stableCoinType,
        }),
        stableLayerClient.getTotalSupplyByCoinType(params.stableCoinType),
      ]);
      globalClaimableRewardUsdb = claimableRaw;
      totalSupply = parseBigIntLike(totalSupplyRaw as string | number | bigint);
    } catch (error) {
      claimableYieldReliable = false;
      console.warn('Failed to inspect global Earn claimable reward', {
        xUserId: params.xUserId,
        senderAddress: params.senderAddress,
        stableCoinType: params.stableCoinType,
        error,
      });
    }
  }

  let unharvestedEstimateUsdc = 0n;
  if (globalClaimableRewardUsdb > 0n && totalSupply > 0n && depositedUsdc > 0n) {
    const { userClaimUsdb } = splitRetainedYieldUsdb(globalClaimableRewardUsdb);
    unharvestedEstimateUsdc = (userClaimUsdb * depositedUsdc) / totalSupply;
  }

  return {
    accounting,
    globalState,
    availableUsdc,
    depositedUsdc,
    claimableYieldUsdc: harvestedOutstandingUsdc + unharvestedEstimateUsdc,
    claimableYieldReliable,
    harvestedOutstandingUsdc,
    harvestedOutstandingRetainedUsdb,
    globalClaimableRewardUsdb,
    totalSupply,
    yieldSettlementMode,
  } satisfies EarnPosition;
}

async function resolveRetainedAccountId(params: {
  xUserId: string;
  senderAddress: string;
  bucketClient: StableLayerEarnInternals['bucketClient'];
}) {
  const accounting = await prisma.earnAccounting.findUnique({
    where: { xUserId: params.xUserId },
    select: { retainedAccountId: true },
  });

  try {
    const accounts = await params.bucketClient.getUserAccounts({
      address: params.senderAddress,
    });

    const normalizedStoredAccountId = accounting?.retainedAccountId
      ? normalizeSuiAddress(accounting.retainedAccountId)
      : null;

    if (
      normalizedStoredAccountId &&
      accounts.some((account) => normalizeSuiAddress(account.id.id) === normalizedStoredAccountId)
    ) {
      return normalizedStoredAccountId;
    }

    const discoveredAccountId = findEarnRetainedAccountId(accounts);
    if (discoveredAccountId) {
      await prisma.earnAccounting.upsert({
        where: { xUserId: params.xUserId },
        update: { retainedAccountId: discoveredAccountId },
        create: {
          xUserId: params.xUserId,
          retainedAccountId: discoveredAccountId,
        },
      });
      return discoveredAccountId;
    }
  } catch (error) {
    console.warn('Failed to resolve retained Earn account from Bucket', {
      xUserId: params.xUserId,
      senderAddress: params.senderAddress,
      error,
    });
  }

  return accounting?.retainedAccountId ? normalizeSuiAddress(accounting.retainedAccountId) : null;
}

async function getEarnFrameworkPackageId(senderAddress: string) {
  const stableLayerClient = await getStableLayerClient(senderAddress);
  const internals = stableLayerClient as unknown as StableLayerEarnInternals;

  if (typeof internals.bucketClient?.getConfig !== 'function') {
    throw new Error(
      'stable-layer-sdk internals changed; Earn retained account resolution is unavailable',
    );
  }

  const { FRAMEWORK_PACKAGE_ID: frameworkPackageId } = await internals.bucketClient.getConfig();
  return frameworkPackageId;
}

async function buildSettlementPlan(params: {
  xUserId: string;
  action: 'claim' | 'withdraw';
  senderAddress: string;
  stableCoinType: string;
  amount: bigint;
}) {
  const position = await getEarnPosition({
    xUserId: params.xUserId,
    senderAddress: params.senderAddress,
    stableCoinType: params.stableCoinType,
  });

  if (params.action === 'withdraw' && position.depositedUsdc < params.amount) {
    throw new Error('Insufficient deposited balance');
  }

  if (position.yieldSettlementMode === 'disabled') {
    return {
      ...position,
      plan: {
        xUserId: params.xUserId,
        action: params.action,
        stableCoinType: params.stableCoinType,
        senderAddress: params.senderAddress,
        yieldSettlementMode: position.yieldSettlementMode,
        yieldSettled: false,
        preBalanceUsdc: position.depositedUsdc,
        postBalanceUsdc:
          params.action === 'withdraw'
            ? position.depositedUsdc - params.amount
            : position.depositedUsdc,
        userPayoutOwedUsdc: 0n,
        userRetainedOwedUsdb: 0n,
        harvestedRewardUsdb: 0n,
        harvestedPayoutUsdc: 0n,
        harvestedRetainedUsdb: 0n,
        nextAccPayoutPerShareUsdcE18: position.globalState.accPayoutPerShareUsdcE18,
        nextAccRetainedPerShareUsdbE18: position.globalState.accRetainedPerShareUsdbE18,
      } satisfies SettlementPlan,
    };
  }

  let harvestedRewardUsdb = position.globalClaimableRewardUsdb;
  let harvestedPayoutUsdc = 0n;
  let harvestedRetainedUsdb = 0n;
  let nextAccPayoutPerShareUsdcE18 = position.globalState.accPayoutPerShareUsdcE18;
  let nextAccRetainedPerShareUsdbE18 = position.globalState.accRetainedPerShareUsdbE18;

  if (harvestedRewardUsdb > 0n && position.totalSupply > 0n) {
    const split = splitRetainedYieldUsdb(harvestedRewardUsdb);
    harvestedPayoutUsdc = split.userClaimUsdb;
    harvestedRetainedUsdb = split.retainedUsdb;
    nextAccPayoutPerShareUsdcE18 += (harvestedPayoutUsdc * ACC_PRECISION) / position.totalSupply;
    nextAccRetainedPerShareUsdbE18 +=
      (harvestedRetainedUsdb * ACC_PRECISION) / position.totalSupply;
  } else {
    harvestedRewardUsdb = 0n;
  }

  const userPayoutOwedUsdc = computePendingReward({
    balance: position.depositedUsdc,
    accPerShareE18: nextAccPayoutPerShareUsdcE18,
    rewardDebt: position.accounting.rewardDebtPayoutUsdc,
  });
  const userRetainedOwedUsdb = computePendingReward({
    balance: position.depositedUsdc,
    accPerShareE18: nextAccRetainedPerShareUsdbE18,
    rewardDebt: position.accounting.rewardDebtRetainedUsdb,
  });

  const yieldSettled = userPayoutOwedUsdc > 0n || userRetainedOwedUsdb > 0n;

  return {
    ...position,
    plan: {
      xUserId: params.xUserId,
      action: params.action,
      stableCoinType: params.stableCoinType,
      senderAddress: params.senderAddress,
      yieldSettlementMode: position.yieldSettlementMode,
      yieldSettled,
      preBalanceUsdc: position.depositedUsdc,
      postBalanceUsdc:
        params.action === 'withdraw'
          ? position.depositedUsdc - params.amount
          : position.depositedUsdc,
      userPayoutOwedUsdc,
      userRetainedOwedUsdb,
      harvestedRewardUsdb,
      harvestedPayoutUsdc,
      harvestedRetainedUsdb,
      nextAccPayoutPerShareUsdcE18,
      nextAccRetainedPerShareUsdbE18,
    } satisfies SettlementPlan,
  };
}

async function buildYieldSettlementBundle(params: {
  plan: SettlementPlan;
}) {
  if (!params.plan.yieldSettled) {
    return null;
  }

  const managerKeypair = getStableLayerManagerKeypair();
  if (!managerKeypair) {
    throw new Error('StableLayer manager signer is not configured');
  }

  const managerAddress = managerKeypair.toSuiAddress();
  const stableLayerClient = await getStableLayerClient(managerAddress);
  const internals = stableLayerClient as unknown as StableLayerEarnInternals;
  if (
    typeof internals.bucketClient?.buildDepositToSavingPoolTransaction !== 'function' ||
    typeof internals.bucketClient?.buildPSMSwapOutTransaction !== 'function' ||
    typeof internals.bucketClient?.getConfig !== 'function' ||
    typeof internals.bucketClient?.getUserAccounts !== 'function' ||
    typeof internals.bucketClient?.getUsdbCoinType !== 'function'
  ) {
    throw new Error(
      'stable-layer-sdk internals changed; Earn yield settlement is unavailable',
    );
  }

  const tx = new Transaction();
  tx.setSender(managerAddress);

  let harvestedPayableUsdcCoin: TransactionObjectArgument | null = null;
  let harvestedRetainedUsdbCoin: TransactionObjectArgument | null = null;

  if (params.plan.harvestedRewardUsdb > 0n) {
    const rewardUsdbCoin = await stableLayerClient.buildClaimTx({
      tx,
      sender: managerAddress,
      stableCoinType: params.plan.stableCoinType,
      autoTransfer: false,
    });

    if (!rewardUsdbCoin) {
      throw new Error('StableLayer claim did not return a reward coin');
    }

    // Split user-specific portions from the USDB reward coin.
    // The accumulator values (userPayoutOwedUsdc, userRetainedOwedUsdb) are denominated
    // in USDB base units (9 decimals), NOT USDC base units (6 decimals).  The PSM swap
    // converts at dollar parity, producing ~1/1000 as many USDC base units.  To avoid an
    // InsufficientCoinBalance when splitting the post-swap USDC coin, we split the USDB
    // reward into per-user portions BEFORE the PSM swap, so the swap output equals exactly
    // the user's payout and can be transferred without further splitting.
    const userPayoutUsdb = params.plan.userPayoutOwedUsdc;
    const userRetainedUsdb = params.plan.userRetainedOwedUsdb;
    const userTotalUsdb = userPayoutUsdb + userRetainedUsdb;
    const hasExcess = params.plan.harvestedRewardUsdb > userTotalUsdb;

    if (userPayoutUsdb > 0n && (userRetainedUsdb > 0n || hasExcess)) {
      const [userPayoutUsdbCoin] = tx.splitCoins(rewardUsdbCoin, [userPayoutUsdb]);
      harvestedPayableUsdcCoin = await internals.bucketClient.buildPSMSwapOutTransaction(tx, {
        coinType: MAINNET_USDC_TYPE,
        usdbCoinOrAmount: userPayoutUsdbCoin,
      });
      harvestedRetainedUsdbCoin = rewardUsdbCoin;
    } else if (userPayoutUsdb > 0n) {
      harvestedPayableUsdcCoin = await internals.bucketClient.buildPSMSwapOutTransaction(tx, {
        coinType: MAINNET_USDC_TYPE,
        usdbCoinOrAmount: rewardUsdbCoin,
      });
    } else {
      harvestedRetainedUsdbCoin = rewardUsdbCoin;
    }
  }

  if (params.plan.userPayoutOwedUsdc > 0n) {
    if (harvestedPayableUsdcCoin) {
      tx.transferObjects([harvestedPayableUsdcCoin], params.plan.senderAddress);
    } else {
      const fallbackCoin = tx.add(
        coinWithBalance({
          type: MAINNET_USDC_TYPE,
          balance: params.plan.userPayoutOwedUsdc,
        }),
      ) as TransactionObjectArgument;
      tx.transferObjects([fallbackCoin], params.plan.senderAddress);
    }
  } else if (harvestedPayableUsdcCoin) {
    tx.transferObjects([harvestedPayableUsdcCoin], managerAddress);
  }

  if (params.plan.userRetainedOwedUsdb > 0n) {
    const existingRetainedAccountId = await resolveRetainedAccountId({
      xUserId: params.plan.xUserId,
      senderAddress: params.plan.senderAddress,
      bucketClient: internals.bucketClient,
    });

    let retainedAccountObject: TransactionObjectArgument | null = null;
    let retainedAccountObjectOrId: string | TransactionArgument | undefined = existingRetainedAccountId ?? undefined;

    if (!retainedAccountObjectOrId) {
      const { FRAMEWORK_PACKAGE_ID: frameworkPackageId } = await internals.bucketClient.getConfig();
      const aliasOption = tx.moveCall({
        target: '0x1::option::some',
        typeArguments: ['0x1::string::String'],
        arguments: [tx.pure.string(EARN_RETAINED_ACCOUNT_ALIAS)],
      });
      retainedAccountObject = tx.moveCall({
        target: `${frameworkPackageId}::account::new`,
        arguments: [aliasOption],
      });
      retainedAccountObjectOrId = retainedAccountObject;
    }

    let retainedDepositCoin: TransactionArgument;
    if (harvestedRetainedUsdbCoin) {
      if (params.plan.userRetainedOwedUsdb < params.plan.harvestedRetainedUsdb) {
        const [userRetainedCoin] = tx.splitCoins(
          harvestedRetainedUsdbCoin,
          [params.plan.userRetainedOwedUsdb],
        );
        retainedDepositCoin = userRetainedCoin;
      } else {
        retainedDepositCoin = harvestedRetainedUsdbCoin;
      }
    } else {
      const usdbCoinType = await internals.bucketClient.getUsdbCoinType();
      retainedDepositCoin = tx.add(
        coinWithBalance({
          type: usdbCoinType,
          balance: params.plan.userRetainedOwedUsdb,
        }),
      ) as TransactionObjectArgument;
    }

    await internals.bucketClient.buildDepositToSavingPoolTransaction(tx, {
      address: params.plan.senderAddress,
      accountObjectOrId: retainedAccountObjectOrId,
      lpType: stableLayerClient.getConstants().SAVING_TYPE,
      depositCoinOrAmount: retainedDepositCoin,
    });

    if (harvestedRetainedUsdbCoin && params.plan.userRetainedOwedUsdb < params.plan.harvestedRetainedUsdb) {
      tx.transferObjects([harvestedRetainedUsdbCoin], managerAddress);
    }

    if (retainedAccountObject) {
      tx.transferObjects([retainedAccountObject], params.plan.senderAddress);
    }
  } else if (harvestedRetainedUsdbCoin) {
    tx.transferObjects([harvestedRetainedUsdbCoin], managerAddress);
  }

  return buildManagerSignedBundle(tx);
}

async function updateEarnAccounting(
  db: Pick<EarnDb, 'earnAccounting'>,
  params: {
    xUserId: string;
    accounting: EarnAccountingState;
    rewardDebtPayoutUsdc?: bigint;
    rewardDebtRetainedUsdb?: bigint;
    claimedUsdcTotal?: bigint;
    retainedUsdbTotal?: bigint;
    lastKnownDepositedUsdc?: bigint;
    retainedAccountId?: string | null;
    lastSettledTxDigest?: string | null;
  },
) {
  await db.earnAccounting.upsert({
    where: { xUserId: params.xUserId },
    update: {
      ...(params.rewardDebtPayoutUsdc !== undefined
        ? { rewardDebtPayoutUsdc: serializeBigInt(params.rewardDebtPayoutUsdc) }
        : {}),
      ...(params.rewardDebtRetainedUsdb !== undefined
        ? { rewardDebtRetainedUsdb: serializeBigInt(params.rewardDebtRetainedUsdb) }
        : {}),
      ...(params.claimedUsdcTotal !== undefined ? { claimedUsdcTotal: params.claimedUsdcTotal } : {}),
      ...(params.retainedUsdbTotal !== undefined ? { retainedUsdbTotal: params.retainedUsdbTotal } : {}),
      ...(params.lastKnownDepositedUsdc !== undefined
        ? { lastKnownDepositedUsdc: params.lastKnownDepositedUsdc }
        : {}),
      ...(params.retainedAccountId !== undefined ? { retainedAccountId: params.retainedAccountId } : {}),
      ...(params.lastSettledTxDigest !== undefined
        ? { lastSettledTxDigest: params.lastSettledTxDigest }
        : {}),
    },
    create: {
      xUserId: params.xUserId,
      rewardDebtPayoutUsdc: serializeBigInt(
        params.rewardDebtPayoutUsdc ?? params.accounting.rewardDebtPayoutUsdc,
      ),
      rewardDebtRetainedUsdb: serializeBigInt(
        params.rewardDebtRetainedUsdb ?? params.accounting.rewardDebtRetainedUsdb,
      ),
      claimedUsdcTotal: params.claimedUsdcTotal ?? params.accounting.claimedUsdcTotal,
      retainedUsdbTotal: params.retainedUsdbTotal ?? params.accounting.retainedUsdbTotal,
      lastKnownDepositedUsdc:
        params.lastKnownDepositedUsdc ?? params.accounting.lastKnownDepositedUsdc,
      ...(params.retainedAccountId !== undefined && params.retainedAccountId !== null
        ? { retainedAccountId: params.retainedAccountId }
        : {}),
      ...(params.lastSettledTxDigest !== undefined && params.lastSettledTxDigest !== null
        ? { lastSettledTxDigest: params.lastSettledTxDigest }
        : {}),
    },
  });
}

async function updateEarnGlobalState(
  db: Pick<EarnDb, 'earnGlobalState'>,
  params: {
    stableCoinType: string;
    globalState: EarnGlobalState;
    nextAccPayoutPerShareUsdcE18?: bigint;
    nextAccRetainedPerShareUsdbE18?: bigint;
    lastHarvestTxDigest?: string | null;
    lastHarvestedRewardUsdb?: bigint;
    lastHarvestedPayoutUsdc?: bigint;
    lastHarvestedRetainedUsdb?: bigint;
  },
) {
  await db.earnGlobalState.upsert({
    where: { stableCoinType: params.stableCoinType },
    update: {
      ...(params.nextAccPayoutPerShareUsdcE18 !== undefined
        ? { accPayoutPerShareUsdcE18: serializeBigInt(params.nextAccPayoutPerShareUsdcE18) }
        : {}),
      ...(params.nextAccRetainedPerShareUsdbE18 !== undefined
        ? { accRetainedPerShareUsdbE18: serializeBigInt(params.nextAccRetainedPerShareUsdbE18) }
        : {}),
      ...(params.lastHarvestTxDigest !== undefined
        ? { lastHarvestTxDigest: params.lastHarvestTxDigest }
        : {}),
      ...(params.lastHarvestedRewardUsdb !== undefined
        ? { lastHarvestedRewardUsdb: params.lastHarvestedRewardUsdb }
        : {}),
      ...(params.lastHarvestedPayoutUsdc !== undefined
        ? { lastHarvestedPayoutUsdc: params.lastHarvestedPayoutUsdc }
        : {}),
      ...(params.lastHarvestedRetainedUsdb !== undefined
        ? { lastHarvestedRetainedUsdb: params.lastHarvestedRetainedUsdb }
        : {}),
    },
    create: {
      stableCoinType: params.stableCoinType,
      accPayoutPerShareUsdcE18: serializeBigInt(
        params.nextAccPayoutPerShareUsdcE18 ?? params.globalState.accPayoutPerShareUsdcE18,
      ),
      accRetainedPerShareUsdbE18: serializeBigInt(
        params.nextAccRetainedPerShareUsdbE18 ?? params.globalState.accRetainedPerShareUsdbE18,
      ),
      lastHarvestTxDigest:
        params.lastHarvestTxDigest ?? params.globalState.lastHarvestTxDigest,
      lastHarvestedRewardUsdb:
        params.lastHarvestedRewardUsdb ?? params.globalState.lastHarvestedRewardUsdb,
      lastHarvestedPayoutUsdc:
        params.lastHarvestedPayoutUsdc ?? params.globalState.lastHarvestedPayoutUsdc,
      lastHarvestedRetainedUsdb:
        params.lastHarvestedRetainedUsdb ?? params.globalState.lastHarvestedRetainedUsdb,
    },
  });
}

async function applyStakeSuccessBookkeeping(params: {
  xUserId: string;
  stableCoinType: string;
  amount: bigint;
  txDigest: string;
}) {
  const [accounting, globalState] = await Promise.all([
    loadEarnAccountingState(params.xUserId),
    loadEarnGlobalState(params.stableCoinType),
  ]);

  const rewardDebtPayoutUsdc =
    accounting.rewardDebtPayoutUsdc +
    scaleShare(params.amount, globalState.accPayoutPerShareUsdcE18);
  const rewardDebtRetainedUsdb =
    accounting.rewardDebtRetainedUsdb +
    scaleShare(params.amount, globalState.accRetainedPerShareUsdbE18);

  await updateEarnAccounting(prisma, {
    xUserId: params.xUserId,
    accounting,
    rewardDebtPayoutUsdc,
    rewardDebtRetainedUsdb,
    lastKnownDepositedUsdc: accounting.lastKnownDepositedUsdc + params.amount,
    lastSettledTxDigest: params.txDigest,
  });
}

async function applyYieldSettlementSuccess(params: {
  settlementId: string;
  xUserId: string;
  stableCoinType: string;
  snapshot: ReturnType<typeof parseSettlementSnapshot>;
  yieldTxDigest: string;
  nextStatus: 'confirmed' | 'principal_pending';
  retainedAccountId?: string | null;
}) {
  await prisma.$transaction(async (tx) => {
    const [accounting, globalState] = await Promise.all([
      tx.earnAccounting.findUnique({
        where: { xUserId: params.xUserId },
        select: {
          retainedAccountId: true,
          rewardDebtPayoutUsdc: true,
          rewardDebtRetainedUsdb: true,
          claimedUsdcTotal: true,
          retainedUsdbTotal: true,
          lastKnownDepositedUsdc: true,
        },
      }).then(parseEarnAccountingState),
      tx.earnGlobalState.findUnique({
        where: { stableCoinType: params.stableCoinType },
        select: {
          accPayoutPerShareUsdcE18: true,
          accRetainedPerShareUsdbE18: true,
          lastHarvestTxDigest: true,
          lastHarvestedRewardUsdb: true,
          lastHarvestedPayoutUsdc: true,
          lastHarvestedRetainedUsdb: true,
        },
      }).then(parseEarnGlobalState),
    ]);

    await updateEarnGlobalState(tx, {
      stableCoinType: params.stableCoinType,
      globalState,
      nextAccPayoutPerShareUsdcE18: params.snapshot.nextAccPayoutPerShareUsdcE18,
      nextAccRetainedPerShareUsdbE18: params.snapshot.nextAccRetainedPerShareUsdbE18,
      lastHarvestTxDigest: params.yieldTxDigest,
      lastHarvestedRewardUsdb: params.snapshot.harvestedRewardUsdb,
      lastHarvestedPayoutUsdc: params.snapshot.harvestedPayoutUsdc,
      lastHarvestedRetainedUsdb: params.snapshot.harvestedRetainedUsdb,
    });

    await updateEarnAccounting(tx, {
      xUserId: params.xUserId,
      accounting,
      rewardDebtPayoutUsdc: scaleShare(
        params.snapshot.preBalanceUsdc,
        params.snapshot.nextAccPayoutPerShareUsdcE18,
      ),
      rewardDebtRetainedUsdb: scaleShare(
        params.snapshot.preBalanceUsdc,
        params.snapshot.nextAccRetainedPerShareUsdbE18,
      ),
      claimedUsdcTotal: accounting.claimedUsdcTotal + params.snapshot.userPayoutOwedUsdc,
      retainedUsdbTotal: accounting.retainedUsdbTotal + params.snapshot.userRetainedOwedUsdb,
      lastKnownDepositedUsdc: params.snapshot.preBalanceUsdc,
      retainedAccountId:
        params.retainedAccountId !== undefined
          ? params.retainedAccountId
          : accounting.retainedAccountId,
      lastSettledTxDigest: params.yieldTxDigest,
    });

    await tx.pendingEarnSettlement.update({
      where: { id: params.settlementId },
      data: {
        status: params.nextStatus,
        lastErrorMessage: null,
      },
    });
  });
}

async function applyWithdrawPrincipalSuccess(params: {
  settlementId: string;
  xUserId: string;
  stableCoinType: string;
  snapshot: ReturnType<typeof parseSettlementSnapshot>;
  principalTxDigest: string;
}) {
  await prisma.$transaction(async (tx) => {
    const [accounting, globalState] = await Promise.all([
      tx.earnAccounting.findUnique({
        where: { xUserId: params.xUserId },
        select: {
          retainedAccountId: true,
          rewardDebtPayoutUsdc: true,
          rewardDebtRetainedUsdb: true,
          claimedUsdcTotal: true,
          retainedUsdbTotal: true,
          lastKnownDepositedUsdc: true,
        },
      }).then(parseEarnAccountingState),
      tx.earnGlobalState.findUnique({
        where: { stableCoinType: params.stableCoinType },
        select: {
          accPayoutPerShareUsdcE18: true,
          accRetainedPerShareUsdbE18: true,
          lastHarvestTxDigest: true,
          lastHarvestedRewardUsdb: true,
          lastHarvestedPayoutUsdc: true,
          lastHarvestedRetainedUsdb: true,
        },
      }).then(parseEarnGlobalState),
    ]);

    const withdrawnAmount = params.snapshot.preBalanceUsdc - params.snapshot.postBalanceUsdc;
    const rewardDebtPayoutUsdc = params.snapshot.yieldSettled
      ? scaleShare(
          params.snapshot.postBalanceUsdc,
          params.snapshot.nextAccPayoutPerShareUsdcE18,
        )
      : accounting.rewardDebtPayoutUsdc > scaleShare(withdrawnAmount, globalState.accPayoutPerShareUsdcE18)
          ? accounting.rewardDebtPayoutUsdc -
            scaleShare(withdrawnAmount, globalState.accPayoutPerShareUsdcE18)
          : 0n;
    const rewardDebtRetainedUsdb = params.snapshot.yieldSettled
      ? scaleShare(
          params.snapshot.postBalanceUsdc,
          params.snapshot.nextAccRetainedPerShareUsdbE18,
        )
      : accounting.rewardDebtRetainedUsdb >
            scaleShare(withdrawnAmount, globalState.accRetainedPerShareUsdbE18)
          ? accounting.rewardDebtRetainedUsdb -
            scaleShare(withdrawnAmount, globalState.accRetainedPerShareUsdbE18)
          : 0n;

    await updateEarnAccounting(tx, {
      xUserId: params.xUserId,
      accounting,
      rewardDebtPayoutUsdc,
      rewardDebtRetainedUsdb,
      lastKnownDepositedUsdc: params.snapshot.postBalanceUsdc,
      lastSettledTxDigest: params.principalTxDigest,
    });

    await tx.pendingEarnSettlement.update({
      where: { id: params.settlementId },
      data: {
        status: 'confirmed',
        lastErrorMessage: null,
      },
    });
  });
}

async function markSettlementFailure(params: {
  settlementId: string;
  status: 'failed' | 'partial';
  message: string;
}) {
  await prisma.pendingEarnSettlement.update({
    where: { id: params.settlementId },
    data: {
      status: params.status,
      lastErrorMessage: params.message,
    },
  });
}

async function loadRetainedAccountIdFromSuccess(params: {
  senderAddress: string;
  objectChanges: unknown[] | null | undefined;
}) {
  const frameworkPackageId = await getEarnFrameworkPackageId(params.senderAddress);
  return extractCreatedEarnRetainedAccountId(params.objectChanges, frameworkPackageId);
}

export function buildEarnAuthorizationRequest(walletId: string, txBytes: Uint8Array) {
  return buildPrivyRawSignAuthorizationRequest(walletId, txBytes);
}

export async function getEarnSummary(params: {
  xUserId: string;
}): Promise<EarnSummary> {
  const { stableCoinType } = assertEarnConfig();
  const walletBinding = await getWalletBinding(params.xUserId);
  const yieldSettlementMode = getYieldSettlementMode();

  if (!walletBinding?.suiAddress) {
    return zeroSummary(yieldSettlementMode);
  }

  const position = await getEarnPosition({
    xUserId: params.xUserId,
    senderAddress: walletBinding.suiAddress,
    stableCoinType,
  });
  const claimAvailability = getClaimAvailability({
    walletReady: Boolean(walletBinding.privyWalletId && walletBinding.suiPublicKey),
    claimableYieldUsdc: position.claimableYieldUsdc,
    yieldSettlementMode: position.yieldSettlementMode,
  });

  return {
    walletReady: Boolean(walletBinding.privyWalletId && walletBinding.suiPublicKey),
    availableUsdc: serializeBigInt(position.availableUsdc),
    depositedUsdc: serializeBigInt(position.depositedUsdc),
    claimableYieldUsdc: serializeBigInt(position.claimableYieldUsdc),
    claimableYieldReliable: position.claimableYieldReliable,
    yieldSettlementMode: position.yieldSettlementMode,
    claimAllowed: claimAvailability.claimAllowed,
    claimMinimumYieldUsdc: serializeBigInt(MIN_EARN_CLAIM_YIELD_USDC),
    claimBlockedReason: claimAvailability.claimBlockedReason,
  };
}

export async function previewEarnAction(params: {
  xUserId: string;
  action: EarnAction;
  amount?: string;
}): Promise<EarnPreview> {
  const { action, xUserId } = params;
  const { stableCoinType } = assertEarnConfig();
  const amount = parseBaseUnitAmount(params.amount, action);
  const walletBinding = await getWalletBinding(xUserId);
  assertWalletReady(walletBinding);

  const summary = await getEarnSummary({ xUserId });
  const availableUsdc = BigInt(summary.availableUsdc);
  const depositedUsdc = BigInt(summary.depositedUsdc);

  if (action === 'stake' && availableUsdc < amount) {
    throw new Error('Insufficient USDC balance');
  }

  if (action === 'withdraw' && depositedUsdc < amount) {
    throw new Error('Insufficient deposited balance');
  }

  let yieldReceivesUsdc = 0n;
  const principalReceivesUsdc = action === 'withdraw' ? amount : 0n;
  let yieldSettlementSkipped = false;

  if (action === 'claim' || action === 'withdraw') {
    const { plan } = await buildSettlementPlan({
      xUserId,
      action,
      senderAddress: walletBinding.suiAddress,
      stableCoinType,
      amount,
    });

    yieldReceivesUsdc = plan.userPayoutOwedUsdc;
    yieldSettlementSkipped = !plan.yieldSettled;

    if (action === 'claim') {
      if (summary.yieldSettlementMode === 'disabled') {
        throw new Error('Yield settlement is temporarily unavailable');
      }

      if (yieldReceivesUsdc <= 0n) {
        throw new Error('No claimable yield available');
      }

      if (yieldReceivesUsdc < MIN_EARN_CLAIM_YIELD_USDC) {
        throw new Error(CLAIM_MINIMUM_YIELD_MESSAGE);
      }
    }
  }

  const previewToken = await stagePreview({
    xUserId,
    action,
    amount: serializeBigInt(amount),
    yieldSettlementMode: summary.yieldSettlementMode,
    expectedYieldUsdc: serializeBigInt(yieldReceivesUsdc),
    expectedPrincipalUsdc: serializeBigInt(principalReceivesUsdc),
    ...(yieldSettlementSkipped ? { yieldSettlementSkipped: true } : {}),
  });

  return {
    ...summary,
    previewToken,
    action,
    amount: serializeBigInt(amount),
    principalReceivesUsdc: serializeBigInt(principalReceivesUsdc),
    yieldReceivesUsdc: serializeBigInt(yieldReceivesUsdc),
    userReceivesUsdc: serializeBigInt(principalReceivesUsdc + yieldReceivesUsdc),
    ...(yieldSettlementSkipped ? { yieldSettlementSkipped: true } : {}),
  };
}

async function executeStakeFlow(params: {
  xUserId: string;
  previewToken: string;
  walletBinding: {
    privyWalletId: string;
    suiAddress: string;
    suiPublicKey: string;
  };
  stableCoinType: string;
  preview: StagedPreview;
  authorizationSignature?: string;
}) {
  if (!params.authorizationSignature) {
    const buildResult = await buildUserEarnTransactionBytes({
      action: 'stake',
      senderAddress: params.walletBinding.suiAddress,
      stableCoinType: params.stableCoinType,
      amount: BigInt(params.preview.amount),
      sponsored: true,
    });

    await stageAuthorization(params.previewToken, {
      action: 'stake',
      amount: params.preview.amount,
      txBytesBase64: Buffer.from(buildResult.txBytes).toString('base64'),
      walletId: params.walletBinding.privyWalletId,
      storedPublicKey: params.walletBinding.suiPublicKey,
      sponsored: buildResult.sponsorApplied,
    });

    return {
      status: 'authorization_required',
      authorizationRequest: buildEarnAuthorizationRequest(
        params.walletBinding.privyWalletId,
        buildResult.txBytes,
      ),
    } satisfies EarnExecuteResult;
  }

  const authorization = await loadAuthorization(params.previewToken);
  if (!authorization) {
    throw new Error('Authorization expired. Please confirm the earn action again.');
  }

  await clearAuthorization(params.previewToken);
  const bundle = await buildUserSignedBundle({
    authorization,
    authorizationSignature: params.authorizationSignature,
  });

  await stagePendingEarn(bundle.txDigest, {
    xUserId: params.xUserId,
    action: 'stake',
    amount: authorization.amount,
    txBytesBase64: bundle.txBytesBase64,
    signatures: bundle.signatures,
  });

  try {
    const result = await executeSignedBundle(bundle);
    if (result.effects?.status.status === 'success') {
      await applyStakeSuccessBookkeeping({
        xUserId: params.xUserId,
        stableCoinType: params.stableCoinType,
        amount: BigInt(authorization.amount),
        txDigest: result.digest || bundle.txDigest,
      });
      await clearPendingEarn(bundle.txDigest);
      await clearPreview(params.previewToken);
      return {
        status: 'confirmed',
        action: 'stake',
        txDigest: result.digest || bundle.txDigest,
      } satisfies EarnExecuteResult;
    }

    await clearPendingEarn(bundle.txDigest);
    await clearPreview(params.previewToken);
    throw new Error(
      `Earn transaction failed on-chain: ${annotateNoValidGasCoinsError(
        result.effects?.status.error || 'Transaction failed on-chain',
      )}`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
      throw error;
    }

    console.error('Failed to execute Earn stake transaction; returning pending for confirm recovery', error);
  }

  return {
    status: 'pending',
    action: 'stake',
    txDigest: bundle.txDigest,
  } satisfies EarnExecuteResult;
}

async function executeClaimFlow(params: {
  xUserId: string;
  previewToken: string;
  walletBinding: {
    suiAddress: string;
  };
  stableCoinType: string;
}) {
  const harvestLock = await acquireRedisLock(`earn-harvest:${params.stableCoinType}`, HARVEST_LOCK_TTL_SEC);
  if (harvestLock.status !== 'acquired') {
    throw new Error('Yield settlement is already in progress. Please retry in a moment.');
  }

  try {
    const { plan } = await buildSettlementPlan({
      xUserId: params.xUserId,
      action: 'claim',
      senderAddress: params.walletBinding.suiAddress,
      stableCoinType: params.stableCoinType,
      amount: 0n,
    });

    if (plan.yieldSettlementMode === 'disabled') {
      throw new Error('Yield settlement is temporarily unavailable');
    }
    if (!plan.yieldSettled || plan.userPayoutOwedUsdc <= 0n) {
      throw new Error('No claimable yield available');
    }
    if (plan.userPayoutOwedUsdc < MIN_EARN_CLAIM_YIELD_USDC) {
      throw new Error(CLAIM_MINIMUM_YIELD_MESSAGE);
    }

    const yieldBundle = await buildYieldSettlementBundle({ plan });
    if (!yieldBundle) {
      throw new Error('No claimable yield available');
    }

    const settlement = await createPendingSettlement({
      xUserId: params.xUserId,
      action: 'claim',
      stableCoinType: params.stableCoinType,
      previewToken: params.previewToken,
      status: 'yield_pending',
      expectedYieldUsdc: plan.userPayoutOwedUsdc,
      expectedPrincipalUsdc: 0n,
      snapshot: serializeSettlementSnapshot(plan),
      yieldBundle,
    });

    try {
      const result = await executeSignedBundle(yieldBundle);
      if (result.effects?.status.status === 'success') {
        const retainedAccountId = await loadRetainedAccountIdFromSuccess({
          senderAddress: params.walletBinding.suiAddress,
          objectChanges: result.objectChanges,
        });
        await applyYieldSettlementSuccess({
          settlementId: settlement.id,
          xUserId: params.xUserId,
          stableCoinType: params.stableCoinType,
          snapshot: parseSettlementSnapshot(settlement.settlementSnapshot),
          yieldTxDigest: result.digest || yieldBundle.txDigest,
          nextStatus: 'confirmed',
          retainedAccountId,
        });
        await clearPreview(params.previewToken);
        return {
          status: 'confirmed',
          action: 'claim',
          txDigest: result.digest || yieldBundle.txDigest,
        } satisfies EarnExecuteResult;
      }

      const message = annotateNoValidGasCoinsError(
        result.effects?.status.error || 'Yield settlement failed on-chain',
      );
      await markSettlementFailure({
        settlementId: settlement.id,
        status: 'failed',
        message,
      });
      throw new Error(`Earn transaction failed on-chain: ${message}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
        throw error;
      }

      console.error('Failed to execute Earn claim settlement; returning pending for confirm recovery', error);
      return {
        status: 'pending',
        action: 'claim',
        txDigest: yieldBundle.txDigest,
      } satisfies EarnExecuteResult;
    }
  } finally {
    await harvestLock.release();
  }
}

async function executeWithdrawFlow(params: {
  xUserId: string;
  previewToken: string;
  walletBinding: {
    privyWalletId: string;
    suiAddress: string;
    suiPublicKey: string;
  };
  stableCoinType: string;
  preview: StagedPreview;
  authorizationSignature?: string;
}) {
  if (!params.authorizationSignature) {
    const buildResult = await buildUserEarnTransactionBytes({
      action: 'withdraw',
      senderAddress: params.walletBinding.suiAddress,
      stableCoinType: params.stableCoinType,
      amount: BigInt(params.preview.amount),
      sponsored: true,
    });

    await stageAuthorization(params.previewToken, {
      action: 'withdraw',
      amount: params.preview.amount,
      txBytesBase64: Buffer.from(buildResult.txBytes).toString('base64'),
      walletId: params.walletBinding.privyWalletId,
      storedPublicKey: params.walletBinding.suiPublicKey,
      sponsored: buildResult.sponsorApplied,
    });

    return {
      status: 'authorization_required',
      authorizationRequest: buildEarnAuthorizationRequest(
        params.walletBinding.privyWalletId,
        buildResult.txBytes,
      ),
    } satisfies EarnExecuteResult;
  }

  const authorization = await loadAuthorization(params.previewToken);
  if (!authorization) {
    throw new Error('Authorization expired. Please confirm the earn action again.');
  }

  await clearAuthorization(params.previewToken);
  const principalBundle = await buildUserSignedBundle({
    authorization,
    authorizationSignature: params.authorizationSignature,
  });

  const harvestLock = await acquireRedisLock(`earn-harvest:${params.stableCoinType}`, HARVEST_LOCK_TTL_SEC);
  if (harvestLock.status !== 'acquired') {
    throw new Error('Yield settlement is already in progress. Please retry in a moment.');
  }

  try {
    const { plan } = await buildSettlementPlan({
      xUserId: params.xUserId,
      action: 'withdraw',
      senderAddress: params.walletBinding.suiAddress,
      stableCoinType: params.stableCoinType,
      amount: BigInt(authorization.amount),
    });

    const previewedYieldMode = params.preview.yieldSettlementMode;
    const previewedYieldUsdc = BigInt(params.preview.expectedYieldUsdc);
    const liveYieldMode = plan.yieldSettled ? 'server_payout' : 'disabled';
    const liveYieldUsdc = plan.userPayoutOwedUsdc;
    if (
      liveYieldMode !== previewedYieldMode ||
      (previewedYieldUsdc > 0n && liveYieldUsdc !== previewedYieldUsdc)
    ) {
      throw new Error(
        'Settlement plan changed since preview. Please review the updated breakdown and try again.',
      );
    }

    const snapshot = serializeSettlementSnapshot(plan);

    if (!plan.yieldSettled) {
      const settlement = await createPendingSettlement({
        xUserId: params.xUserId,
        action: 'withdraw',
        stableCoinType: params.stableCoinType,
        previewToken: params.previewToken,
        status: 'principal_pending',
        expectedYieldUsdc: 0n,
        expectedPrincipalUsdc: BigInt(authorization.amount),
        snapshot,
        principalBundle,
      });

      try {
        const result = await executeSignedBundle(principalBundle);
        if (result.effects?.status.status === 'success') {
          await applyWithdrawPrincipalSuccess({
            settlementId: settlement.id,
            xUserId: params.xUserId,
            stableCoinType: params.stableCoinType,
            snapshot: parseSettlementSnapshot(settlement.settlementSnapshot),
            principalTxDigest: result.digest || principalBundle.txDigest,
          });
          await clearPreview(params.previewToken);
          return {
            status: 'confirmed',
            action: 'withdraw',
            txDigest: result.digest || principalBundle.txDigest,
          } satisfies EarnExecuteResult;
        }

        const message = annotateNoValidGasCoinsError(
          result.effects?.status.error || 'Withdraw failed on-chain',
        );
        await markSettlementFailure({
          settlementId: settlement.id,
          status: 'failed',
          message,
        });
        throw new Error(`Earn transaction failed on-chain: ${message}`);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
          throw error;
        }

        console.error('Failed to execute principal withdraw; returning pending for confirm recovery', error);
        return {
          status: 'pending',
          action: 'withdraw',
          txDigest: principalBundle.txDigest,
        } satisfies EarnExecuteResult;
      }
    }

    const yieldBundle = await buildYieldSettlementBundle({ plan });
    if (!yieldBundle) {
      throw new Error('Yield settlement is temporarily unavailable');
    }

    const settlement = await createPendingSettlement({
      xUserId: params.xUserId,
      action: 'withdraw',
      stableCoinType: params.stableCoinType,
      previewToken: params.previewToken,
      status: 'yield_pending',
      expectedYieldUsdc: plan.userPayoutOwedUsdc,
      expectedPrincipalUsdc: BigInt(authorization.amount),
      snapshot,
      yieldBundle,
      principalBundle,
    });

    try {
      const yieldResult = await executeSignedBundle(yieldBundle);
      if (yieldResult.effects?.status.status !== 'success') {
        const message = annotateNoValidGasCoinsError(
          yieldResult.effects?.status.error || 'Yield settlement failed on-chain',
        );
        await markSettlementFailure({
          settlementId: settlement.id,
          status: 'failed',
          message,
        });
        throw new Error(`Earn transaction failed on-chain: ${message}`);
      }

      const retainedAccountId = await loadRetainedAccountIdFromSuccess({
        senderAddress: params.walletBinding.suiAddress,
        objectChanges: yieldResult.objectChanges,
      });
      await applyYieldSettlementSuccess({
        settlementId: settlement.id,
        xUserId: params.xUserId,
        stableCoinType: params.stableCoinType,
        snapshot: parseSettlementSnapshot(settlement.settlementSnapshot),
        yieldTxDigest: yieldResult.digest || yieldBundle.txDigest,
        nextStatus: 'principal_pending',
        retainedAccountId,
      });

      try {
        const principalResult = await executeSignedBundle(principalBundle);
        if (principalResult.effects?.status.status === 'success') {
          await applyWithdrawPrincipalSuccess({
            settlementId: settlement.id,
            xUserId: params.xUserId,
            stableCoinType: params.stableCoinType,
            snapshot: parseSettlementSnapshot(settlement.settlementSnapshot),
            principalTxDigest: principalResult.digest || principalBundle.txDigest,
          });
          await clearPreview(params.previewToken);
          return {
            status: 'confirmed',
            action: 'withdraw',
            txDigest: principalResult.digest || principalBundle.txDigest,
          } satisfies EarnExecuteResult;
        }

        const message = annotateNoValidGasCoinsError(
          principalResult.effects?.status.error || 'Withdraw failed on-chain',
        );
        await markSettlementFailure({
          settlementId: settlement.id,
          status: 'partial',
          message,
        });
        await clearPreview(params.previewToken);
        return {
          status: 'partial',
          action: 'withdraw',
          txDigest: yieldResult.digest || yieldBundle.txDigest,
          message: SETTLEMENT_PARTIAL_MESSAGE,
        } satisfies EarnExecuteResult;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
          throw error;
        }

        console.error('Failed to execute principal withdraw after yield settlement; returning pending', error);
        return {
          status: 'pending',
          action: 'withdraw',
          txDigest: principalBundle.txDigest,
        } satisfies EarnExecuteResult;
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
        throw error;
      }

      console.error('Failed to execute withdraw yield settlement; returning pending for confirm recovery', error);
      return {
        status: 'pending',
        action: 'withdraw',
        txDigest: yieldBundle.txDigest,
      } satisfies EarnExecuteResult;
    }
  } finally {
    await harvestLock.release();
  }
}

export async function executeEarnAction(params: {
  xUserId: string;
  privyUserId: string;
  previewToken: string;
  authorizationSignature?: string;
}): Promise<EarnExecuteResult> {
  const preview = await loadPreview(params.previewToken);
  if (!preview || preview.xUserId !== params.xUserId) {
    throw new Error('Earn preview expired. Please review the action again.');
  }

  const { stableCoinType } = assertEarnConfig();
  const walletBinding = await getWalletBinding(params.xUserId);
  assertWalletReady(walletBinding);

  if (walletBinding.privyUserId !== params.privyUserId) {
    throw new Error('Wallet ownership could not be verified. Please set up your wallet first.');
  }

  if (preview.action === 'stake') {
    return executeStakeFlow({
      xUserId: params.xUserId,
      previewToken: params.previewToken,
      walletBinding,
      stableCoinType,
      preview,
      authorizationSignature: params.authorizationSignature,
    });
  }

  if (preview.action === 'claim') {
    await clearAuthorization(params.previewToken);
    return executeClaimFlow({
      xUserId: params.xUserId,
      previewToken: params.previewToken,
      walletBinding,
      stableCoinType,
    });
  }

  return executeWithdrawFlow({
    xUserId: params.xUserId,
    previewToken: params.previewToken,
    walletBinding,
    stableCoinType,
    preview,
    authorizationSignature: params.authorizationSignature,
  });
}

async function confirmPendingStake(params: {
  txDigest: string;
  pending: PendingEarnBundle;
}) {
  try {
    const tx = await getSuiClient().getTransactionBlock({
      digest: params.txDigest,
      options: {
        showEffects: true,
      },
    });

    if (tx.effects?.status.status === 'success') {
      await applyStakeSuccessBookkeeping({
        xUserId: params.pending.xUserId,
        stableCoinType: assertEarnConfig().stableCoinType,
        amount: BigInt(params.pending.amount),
        txDigest: tx.digest || params.txDigest,
      });
      await clearPendingEarn(params.txDigest);
      return {
        status: 'confirmed',
        txDigest: tx.digest || params.txDigest,
      } satisfies EarnConfirmResult;
    }

    if (tx.effects?.status.status === 'failure') {
      await clearPendingEarn(params.txDigest);
      throw new Error(
        `Earn transaction failed on-chain: ${annotateNoValidGasCoinsError(
          tx.effects.status.error || 'unknown error',
        )}`,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
      throw error;
    }
  }

  try {
    const result = await executeSignedBundle({
      txDigest: params.txDigest,
      txBytesBase64: params.pending.txBytesBase64,
      signatures: params.pending.signatures,
    });

    if (result.effects?.status.status === 'success') {
      await applyStakeSuccessBookkeeping({
        xUserId: params.pending.xUserId,
        stableCoinType: assertEarnConfig().stableCoinType,
        amount: BigInt(params.pending.amount),
        txDigest: result.digest || params.txDigest,
      });
      await clearPendingEarn(params.txDigest);
      return {
        status: 'confirmed',
        txDigest: result.digest || params.txDigest,
      } satisfies EarnConfirmResult;
    }

    await clearPendingEarn(params.txDigest);
    throw new Error(
      `Earn transaction failed on-chain: ${annotateNoValidGasCoinsError(
        result.effects?.status.error || 'unknown error',
      )}`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
      throw error;
    }

    console.warn('Earn stake confirmation retry is still pending', {
      txDigest: params.txDigest,
      error: getAnnotatedTransactionErrorMessage(error) || error,
    });
  }

  return {
    status: 'pending',
    txDigest: params.txDigest,
  } satisfies EarnConfirmResult;
}

async function confirmSettlement(params: {
  txDigest: string;
  settlement: Awaited<ReturnType<typeof loadSettlementByTxDigest>>;
}) {
  if (!params.settlement) {
    return {
      status: 'pending',
      txDigest: params.txDigest,
    } satisfies EarnConfirmResult;
  }

  const snapshot = parseSettlementSnapshot(params.settlement.settlementSnapshot);

  if (params.settlement.status === 'partial') {
    return {
      status: 'partial',
      txDigest: params.settlement.yieldTxDigest || params.txDigest,
      message: params.settlement.lastErrorMessage || SETTLEMENT_PARTIAL_MESSAGE,
    } satisfies EarnConfirmResult;
  }

  if (params.settlement.status === 'confirmed') {
    return {
      status: 'confirmed',
      txDigest:
        params.settlement.principalTxDigest ||
        params.settlement.yieldTxDigest ||
        params.txDigest,
    } satisfies EarnConfirmResult;
  }

  const yieldBundle = decodeSignedBundle({
    txDigest: params.settlement.yieldTxDigest,
    txBytesBase64: params.settlement.yieldTxBytesBase64,
    signatures: params.settlement.yieldSignatures,
  });
  const principalBundle = decodeSignedBundle({
    txDigest: params.settlement.principalTxDigest,
    txBytesBase64: params.settlement.principalTxBytesBase64,
    signatures: params.settlement.principalSignatures,
  });
  const walletBinding = await getWalletBinding(params.settlement.xUserId);
  const settlementSenderAddress = walletBinding?.suiAddress
    ? normalizeSuiAddress(walletBinding.suiAddress)
    : null;

  if (params.settlement.status === 'yield_pending' && yieldBundle) {
    let yieldSettledOnChain = false;
    try {
      const tx = await getSuiClient().getTransactionBlock({
        digest: yieldBundle.txDigest,
        options: {
          showEffects: true,
          showObjectChanges: true,
        },
      });

      if (tx.effects?.status.status === 'success') {
        const retainedAccountId = settlementSenderAddress
          ? await loadRetainedAccountIdFromSuccess({
              senderAddress: settlementSenderAddress,
              objectChanges: tx.objectChanges,
            }).catch(() => null)
          : null;
        await applyYieldSettlementSuccess({
          settlementId: params.settlement.id,
          xUserId: params.settlement.xUserId,
          stableCoinType: params.settlement.stableCoinType,
          snapshot,
          yieldTxDigest: tx.digest || yieldBundle.txDigest,
          nextStatus: params.settlement.action === 'claim' ? 'confirmed' : 'principal_pending',
          retainedAccountId,
        });
        yieldSettledOnChain = true;

        if (params.settlement.action === 'claim') {
          return {
            status: 'confirmed',
            txDigest: tx.digest || yieldBundle.txDigest,
          } satisfies EarnConfirmResult;
        }
      } else if (tx.effects?.status.status === 'failure') {
        const message = annotateNoValidGasCoinsError(
          tx.effects.status.error || 'Yield settlement failed on-chain',
        );
        await markSettlementFailure({
          settlementId: params.settlement.id,
          status: 'failed',
          message,
        });
        throw new Error(`Earn transaction failed on-chain: ${message}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
        throw error;
      }
    }

    if (!yieldSettledOnChain) try {
      const result = await executeSignedBundle(yieldBundle);
      if (result.effects?.status.status === 'success') {
        const retainedAccountId = settlementSenderAddress
          ? await loadRetainedAccountIdFromSuccess({
              senderAddress: settlementSenderAddress,
              objectChanges: result.objectChanges,
            }).catch(() => null)
          : null;
        await applyYieldSettlementSuccess({
          settlementId: params.settlement.id,
          xUserId: params.settlement.xUserId,
          stableCoinType: params.settlement.stableCoinType,
          snapshot,
          yieldTxDigest: result.digest || yieldBundle.txDigest,
          nextStatus: params.settlement.action === 'claim' ? 'confirmed' : 'principal_pending',
          retainedAccountId,
        });

        if (params.settlement.action === 'claim') {
          return {
            status: 'confirmed',
            txDigest: result.digest || yieldBundle.txDigest,
          } satisfies EarnConfirmResult;
        }
      } else {
        const message = annotateNoValidGasCoinsError(
          result.effects?.status.error || 'Yield settlement failed on-chain',
        );
        await markSettlementFailure({
          settlementId: params.settlement.id,
          status: 'failed',
          message,
        });
        throw new Error(`Earn transaction failed on-chain: ${message}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
        throw error;
      }

      console.warn('Earn yield confirmation retry is still pending', {
        txDigest: params.txDigest,
        error: getAnnotatedTransactionErrorMessage(error) || error,
      });
      return {
        status: 'pending',
        txDigest: yieldBundle.txDigest,
      } satisfies EarnConfirmResult;
    }
  }

  if (params.settlement.status === 'failed') {
    throw new Error(
      `Earn settlement failed: ${params.settlement.lastErrorMessage || 'Unknown error'}`,
    );
  }

  if (params.settlement.action === 'claim') {
    return {
      status: 'confirmed',
      txDigest: params.settlement.yieldTxDigest || params.txDigest,
    } satisfies EarnConfirmResult;
  }

  if (!principalBundle) {
    return {
      status: 'pending',
      txDigest: params.txDigest,
    } satisfies EarnConfirmResult;
  }

  try {
    const tx = await getSuiClient().getTransactionBlock({
      digest: principalBundle.txDigest,
      options: {
        showEffects: true,
      },
    });

    if (tx.effects?.status.status === 'success') {
      await applyWithdrawPrincipalSuccess({
        settlementId: params.settlement.id,
        xUserId: params.settlement.xUserId,
        stableCoinType: params.settlement.stableCoinType,
        snapshot,
        principalTxDigest: tx.digest || principalBundle.txDigest,
      });
      return {
        status: 'confirmed',
        txDigest: tx.digest || principalBundle.txDigest,
      } satisfies EarnConfirmResult;
    }

    if (tx.effects?.status.status === 'failure') {
      const message = annotateNoValidGasCoinsError(
        tx.effects.status.error || 'Withdraw failed on-chain',
      );
      await markSettlementFailure({
        settlementId: params.settlement.id,
        status: snapshot.yieldSettled ? 'partial' : 'failed',
        message,
      });
      if (snapshot.yieldSettled) {
        return {
          status: 'partial',
          txDigest: params.settlement.yieldTxDigest || params.txDigest,
          message: SETTLEMENT_PARTIAL_MESSAGE,
        } satisfies EarnConfirmResult;
      }

      throw new Error(`Earn transaction failed on-chain: ${message}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
      throw error;
    }
  }

  try {
    const result = await executeSignedBundle(principalBundle);
    if (result.effects?.status.status === 'success') {
      await applyWithdrawPrincipalSuccess({
        settlementId: params.settlement.id,
        xUserId: params.settlement.xUserId,
        stableCoinType: params.settlement.stableCoinType,
        snapshot,
        principalTxDigest: result.digest || principalBundle.txDigest,
      });
      return {
        status: 'confirmed',
        txDigest: result.digest || principalBundle.txDigest,
      } satisfies EarnConfirmResult;
    }

    const message = annotateNoValidGasCoinsError(
      result.effects?.status.error || 'Withdraw failed on-chain',
    );
    await markSettlementFailure({
      settlementId: params.settlement.id,
      status: snapshot.yieldSettled ? 'partial' : 'failed',
      message,
    });

    if (snapshot.yieldSettled) {
      return {
        status: 'partial',
        txDigest: params.settlement.yieldTxDigest || params.txDigest,
        message: SETTLEMENT_PARTIAL_MESSAGE,
      } satisfies EarnConfirmResult;
    }

    throw new Error(`Earn transaction failed on-chain: ${message}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Earn transaction failed on-chain:')) {
      throw error;
    }

    console.warn('Earn principal confirmation retry is still pending', {
      txDigest: params.txDigest,
      error: getAnnotatedTransactionErrorMessage(error) || error,
    });
  }

  return {
    status: 'pending',
    txDigest: principalBundle.txDigest,
  } satisfies EarnConfirmResult;
}

export async function confirmEarnAction(params: {
  txDigest: string;
}): Promise<EarnConfirmResult> {
  const settlement = await loadSettlementByTxDigest(params.txDigest);
  if (settlement) {
    return confirmSettlement({
      txDigest: params.txDigest,
      settlement,
    });
  }

  const pending = await loadPendingEarn(params.txDigest);
  if (pending?.action === 'stake') {
    return confirmPendingStake({
      txDigest: params.txDigest,
      pending,
    });
  }

  return {
    status: 'pending',
    txDigest: params.txDigest,
  };
}
