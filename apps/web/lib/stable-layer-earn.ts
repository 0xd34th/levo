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
import { getRedis } from '@/lib/rate-limit';
import { getStableLayerClient } from '@/lib/stable-layer';
import { getSuiClient } from '@/lib/sui';

export type EarnAction = 'stake' | 'claim' | 'withdraw';

export interface EarnSummary {
  walletReady: boolean;
  availableUsdc: string;
  depositedUsdc: string;
  claimableYieldUsdc: string;
}

export interface EarnPreview extends EarnSummary {
  previewToken: string;
  action: EarnAction;
  amount: string;
  userReceivesUsdc: string;
}

export type EarnExecuteResult =
  | {
      status: 'authorization_required';
      authorizationRequest: ReturnType<typeof buildPrivyRawSignAuthorizationRequest>;
    }
  | {
      status: 'confirmed' | 'pending';
      action: EarnAction;
      txDigest: string;
    };

export interface EarnConfirmResult {
  status: 'confirmed' | 'pending';
  txDigest: string;
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

export const EARN_RETAINED_ACCOUNT_ALIAS = 'levo-earn-retained';
const CLAIM_REWARD_DRY_RUN_FAILURE =
  'StableLayerClient.getClaimRewardUsdbAmount: dry-run did not succeed; cannot infer claimable USDB.';

const PREVIEW_TTL_SEC = 10 * 60;
const AUTHORIZATION_TTL_SEC = 5 * 60;
const PENDING_EARN_TTL_SEC = 15 * 60;

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
});

const StagedAuthorizationSchema = z.object({
  action: z.enum(['stake', 'claim', 'withdraw']),
  txBytesBase64: z.string().min(1),
  walletId: z.string().min(1),
  storedPublicKey: z.string().min(1),
});

const PendingEarnBundleSchema = z.object({
  xUserId: z.string().min(1),
  action: z.enum(['stake', 'claim', 'withdraw']),
  txBytesBase64: z.string().min(1),
  signatures: z.array(z.string().min(1)).min(1),
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

function zeroSummary(): EarnSummary {
  return {
    walletReady: false,
    availableUsdc: '0',
    depositedUsdc: '0',
    claimableYieldUsdc: '0',
  };
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

function parseBaseUnitAmount(amount: string | undefined, action: EarnAction): bigint {
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

export function splitRetainedYieldUsdb(amount: bigint) {
  const userClaimUsdb = (amount * 9n) / 10n;
  const retainedUsdb = amount - userClaimUsdb;

  return {
    userClaimUsdb,
    retainedUsdb,
  };
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

export function findEarnRetainedAccountId(accounts: BucketUserAccount[]): string | null {
  const retainedAccount = accounts.find((account) => account.alias === EARN_RETAINED_ACCOUNT_ALIAS);
  return retainedAccount ? normalizeSuiAddress(retainedAccount.id.id) : null;
}

export function extractCreatedEarnRetainedAccountId(
  objectChanges: unknown[] | null | undefined,
  frameworkPackageId: string,
): string | null {
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

    if (candidate.type !== 'created') {
      continue;
    }

    if (
      typeof candidate.objectId === 'string' &&
      typeof candidate.objectType === 'string' &&
      normalizeObjectTypeTag(candidate.objectType) === `${normalizedFrameworkPackageId}::account::Account`
    ) {
      return normalizeSuiAddress(candidate.objectId);
    }
  }

  return null;
}

function isClaimRewardDryRunInferenceFailure(error: unknown) {
  return error instanceof Error && error.message.includes(CLAIM_REWARD_DRY_RUN_FAILURE);
}

export async function resolveClaimableRewardUsdb(params: {
  action: EarnAction;
  fetchClaimRewardUsdbAmount: () => Promise<bigint>;
}) {
  try {
    return await params.fetchClaimRewardUsdbAmount();
  } catch (error) {
    if (params.action === 'withdraw' && isClaimRewardDryRunInferenceFailure(error)) {
      console.warn('StableLayer claim reward dry-run failed during withdraw; continuing without yield settlement', {
        error,
      });
      return 0n;
    }

    throw error;
  }
}

function getBalanceOwnerAddress(change: unknown): string | null {
  if (typeof change !== 'object' || change === null) {
    return null;
  }

  if ('address' in change && typeof change.address === 'string') {
    return normalizeSuiAddress(change.address);
  }

  if ('owner' in change && typeof change.owner === 'object' && change.owner !== null) {
    const owner = change.owner as { AddressOwner?: string };
    if (typeof owner.AddressOwner === 'string') {
      return normalizeSuiAddress(owner.AddressOwner);
    }
  }

  return null;
}

function sumPositiveCoinBalanceChanges(params: {
  balanceChanges: unknown[];
  ownerAddress: string;
  coinType: string;
}) {
  const normalizedOwner = normalizeSuiAddress(params.ownerAddress);

  return params.balanceChanges.reduce<bigint>((sum, change) => {
    if (typeof change !== 'object' || change === null) {
      return sum;
    }

    const candidate = change as {
      amount?: string;
      coinType?: string;
    };

    if (candidate.coinType !== params.coinType || typeof candidate.amount !== 'string') {
      return sum;
    }

    const ownerAddress = getBalanceOwnerAddress(change);
    if (ownerAddress !== normalizedOwner) {
      return sum;
    }

    const amount = BigInt(candidate.amount);
    return amount > 0n ? sum + amount : sum;
  }, 0n);
}

async function getWalletBinding(xUserId: string) {
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

async function persistEarnAccounting(params: {
  xUserId: string;
  retainedAccountId?: string | null;
  lastSettledTxDigest?: string | null;
}) {
  const updateData: {
    retainedAccountId?: string;
    lastSettledTxDigest?: string;
  } = {};

  if (params.retainedAccountId) {
    updateData.retainedAccountId = normalizeSuiAddress(params.retainedAccountId);
  }

  if (params.lastSettledTxDigest) {
    updateData.lastSettledTxDigest = params.lastSettledTxDigest;
  }

  if (Object.keys(updateData).length === 0) {
    return;
  }

  await prisma.earnAccounting.upsert({
    where: {
      xUserId: params.xUserId,
    },
    update: updateData,
    create: {
      xUserId: params.xUserId,
      ...updateData,
    },
  });
}

async function resolveRetainedAccountId(params: {
  xUserId: string;
  senderAddress: string;
  bucketClient: StableLayerEarnInternals['bucketClient'];
}) {
  const accounting = await prisma.earnAccounting.findUnique({
    where: {
      xUserId: params.xUserId,
    },
    select: {
      retainedAccountId: true,
    },
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
      await persistEarnAccounting({
        xUserId: params.xUserId,
        retainedAccountId: discoveredAccountId,
      });
      return discoveredAccountId;
    }
  } catch (error) {
    console.warn('Failed to resolve retained Earn account from Bucket', {
      xUserId: params.xUserId,
      senderAddress: params.senderAddress,
      error,
    });

    if (accounting?.retainedAccountId) {
      return normalizeSuiAddress(accounting.retainedAccountId);
    }
  }

  // Stored ID exists but was not found in a successful Bucket response (stale/incomplete list).
  // Trust the persisted ID to avoid creating a duplicate retained account.
  if (accounting?.retainedAccountId) {
    return normalizeSuiAddress(accounting.retainedAccountId);
  }

  return null;
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

function assertWalletReady(
  walletBinding: z.infer<typeof WalletBindingSchema> | null,
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

async function buildEarnTransaction(params: {
  xUserId: string;
  action: EarnAction;
  senderAddress: string;
  stableCoinType: string;
  amount: bigint;
  sponsored: boolean;
}) {
  const { action, amount, senderAddress, stableCoinType, sponsored, xUserId } = params;
  const tx = new Transaction();
  tx.setSender(senderAddress);

  if (sponsored) {
    const gasKeypair = getGasStationKeypair();
    if (gasKeypair) {
      tx.setGasOwner(gasKeypair.toSuiAddress());
    }
  }

  const stableLayerClient = await getStableLayerClient(senderAddress);
  const internals = stableLayerClient as unknown as StableLayerEarnInternals;

  if (
    typeof internals.bucketClient?.buildDepositToSavingPoolTransaction !== 'function' ||
    typeof internals.bucketClient?.buildPSMSwapOutTransaction !== 'function' ||
    typeof internals.bucketClient?.getConfig !== 'function' ||
    typeof internals.bucketClient?.getUserAccounts !== 'function'
  ) {
    throw new Error(
      'stable-layer-sdk internals changed; Earn currently requires Bucket PSM access',
    );
  }

  if (action === 'stake') {
    const usdcCoin = tx.add(
      coinWithBalance({
        type: MAINNET_USDC_TYPE,
        balance: amount,
      }),
    );

    await stableLayerClient.buildMintTx({
      tx,
      sender: senderAddress,
      stableCoinType,
      usdcCoin,
      amount,
      autoTransfer: true,
    });

    return tx;
  }

  let rewardUsdcCoin: TransactionObjectArgument | null = null;

  const claimableRewardUsdb = await resolveClaimableRewardUsdb({
    action,
    fetchClaimRewardUsdbAmount: () => stableLayerClient.getClaimRewardUsdbAmount({
      stableCoinType,
      sender: senderAddress,
    }),
  });

  if (claimableRewardUsdb > 0n) {
    const { retainedUsdb, userClaimUsdb } = splitRetainedYieldUsdb(claimableRewardUsdb);
    const rewardUsdbCoin = await stableLayerClient.buildClaimTx({
      tx,
      sender: senderAddress,
      stableCoinType,
      autoTransfer: false,
    });

    if (!rewardUsdbCoin) {
      throw new Error('StableLayer claim did not return a reward coin');
    }

    let retainedAccountObject: TransactionObjectArgument | null = null;
    let retainedAccountObjectOrId: string | TransactionArgument | undefined;

    if (retainedUsdb > 0n) {
      const existingRetainedAccountId = await resolveRetainedAccountId({
        xUserId,
        senderAddress,
        bucketClient: internals.bucketClient,
      });

      if (existingRetainedAccountId) {
        retainedAccountObjectOrId = existingRetainedAccountId;
      } else {
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

      const retainedUsdbCoin = rewardUsdbCoin;

      if (userClaimUsdb > 0n) {
        const [userRewardUsdbCoin] = tx.splitCoins(rewardUsdbCoin, [userClaimUsdb]);
        rewardUsdcCoin = await internals.bucketClient.buildPSMSwapOutTransaction(tx, {
          coinType: MAINNET_USDC_TYPE,
          usdbCoinOrAmount: userRewardUsdbCoin,
        });
      }

      await internals.bucketClient.buildDepositToSavingPoolTransaction(tx, {
        address: senderAddress,
        accountObjectOrId: retainedAccountObjectOrId,
        lpType: stableLayerClient.getConstants().SAVING_TYPE,
        depositCoinOrAmount: retainedUsdbCoin,
      });

      if (retainedAccountObject) {
        tx.transferObjects([retainedAccountObject], senderAddress);
      }
    } else {
      rewardUsdcCoin = await internals.bucketClient.buildPSMSwapOutTransaction(tx, {
        coinType: MAINNET_USDC_TYPE,
        usdbCoinOrAmount: rewardUsdbCoin,
      });
    }

    if (rewardUsdcCoin) {
      tx.transferObjects([rewardUsdcCoin], senderAddress);
    }
  } else if (action === 'claim') {
    throw new Error('No claimable yield available');
  }

  if (action === 'claim' && rewardUsdcCoin === null) {
    throw new Error('No claimable yield available');
  } else if (action === 'claim') {
    // Claim path only settles yield; principal remains deposited.
  }

  if (action === 'withdraw') {
    const principalUsdcCoin = await stableLayerClient.buildBurnTx({
      tx,
      sender: senderAddress,
      stableCoinType,
      amount,
      autoTransfer: false,
    });

    if (!principalUsdcCoin) {
      throw new Error('StableLayer withdraw did not return USDC');
    }

    tx.transferObjects([principalUsdcCoin as TransactionObjectArgument], senderAddress);
  }

  return tx;
}

async function buildEarnTransactionBytes(params: {
  xUserId: string;
  action: EarnAction;
  senderAddress: string;
  stableCoinType: string;
  amount: bigint;
  sponsored: boolean;
}) {
  const tx = await buildEarnTransaction(params);
  return tx.build({ client: getSuiClient() });
}

async function simulateEarnAction(params: {
  xUserId: string;
  action: EarnAction;
  senderAddress: string;
  stableCoinType: string;
  amount: bigint;
}) {
  const txBytes = await buildEarnTransactionBytes({
    ...params,
    sponsored: false,
  });
  const result = await getSuiClient().dryRunTransactionBlock({
    transactionBlock: txBytes,
  });

  const balanceChanges = result.balanceChanges ?? [];

  return {
    userReceivesUsdc: sumPositiveCoinBalanceChanges({
      balanceChanges,
      ownerAddress: params.senderAddress,
      coinType: MAINNET_USDC_TYPE,
    }),
  };
}

async function stagePreview(preview: StagedPreview) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    throw new Error('Earn preview store unavailable');
  }

  const previewToken = randomUUID();
  await redis.set(
    getPreviewKey(previewToken),
    JSON.stringify(preview),
    'EX',
    PREVIEW_TTL_SEC,
  );

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
  const redis = getRedis();
  if (redis.status !== 'ready') {
    throw new Error('Earn pending store unavailable');
  }

  await redis.set(
    getPendingEarnKey(txDigest),
    JSON.stringify(payload),
    'EX',
    PENDING_EARN_TTL_SEC,
  );
}

async function loadPendingEarn(txDigest: string): Promise<PendingEarnBundle | null> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return null;
  }

  try {
    const raw = await redis.get(getPendingEarnKey(txDigest));
    if (!raw) {
      return null;
    }

    const parsed = PendingEarnBundleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Failed to load pending Earn bundle', { txDigest, error });
    return null;
  }
}

async function clearPendingEarn(txDigest: string) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return;
  }

  try {
    await redis.del(getPendingEarnKey(txDigest));
  } catch (error) {
    console.warn('Failed to clear pending Earn bundle', { txDigest, error });
  }
}

export function buildEarnAuthorizationRequest(walletId: string, txBytes: Uint8Array) {
  return buildPrivyRawSignAuthorizationRequest(walletId, txBytes);
}

export async function getEarnSummary(params: {
  xUserId: string;
}): Promise<EarnSummary> {
  const { stableCoinType } = assertEarnConfig();
  const walletBinding = await getWalletBinding(params.xUserId);

  if (!walletBinding?.suiAddress) {
    return zeroSummary();
  }

  const { availableUsdc, depositedUsdc } = await getEarnBalances(
    walletBinding.suiAddress,
    stableCoinType,
  );

  let claimableYieldUsdc = 0n;
  if (depositedUsdc > 0n) {
    try {
      const claimPreview = await simulateEarnAction({
        xUserId: params.xUserId,
        action: 'claim',
        senderAddress: walletBinding.suiAddress,
        stableCoinType,
        amount: 0n,
      });
      claimableYieldUsdc = claimPreview.userReceivesUsdc;
    } catch (error) {
      console.warn('Failed to simulate claimable StableLayer yield', {
        xUserId: params.xUserId,
        error,
      });
    }
  }

  return {
    walletReady: Boolean(walletBinding.privyWalletId && walletBinding.suiPublicKey),
    availableUsdc: availableUsdc.toString(),
    depositedUsdc: depositedUsdc.toString(),
    claimableYieldUsdc: claimableYieldUsdc.toString(),
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

  let previewValues = {
    userReceivesUsdc: 0n,
  };

  if (action === 'claim' || action === 'withdraw') {
    previewValues = await simulateEarnAction({
      xUserId,
      action,
      senderAddress: walletBinding.suiAddress,
      stableCoinType,
      amount,
    });
  }

  const previewToken = await stagePreview({
    xUserId,
    action,
    amount: amount.toString(),
  });

  return {
    ...summary,
    previewToken,
    action,
    amount: amount.toString(),
    userReceivesUsdc: previewValues.userReceivesUsdc.toString(),
  };
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

  let txBytes: Uint8Array;
  let action = preview.action;

  if (!params.authorizationSignature) {
    txBytes = await buildEarnTransactionBytes({
      xUserId: params.xUserId,
      action,
      senderAddress: walletBinding.suiAddress,
      stableCoinType,
      amount: BigInt(preview.amount),
      sponsored: true,
    });

    await stageAuthorization(params.previewToken, {
      action,
      txBytesBase64: Buffer.from(txBytes).toString('base64'),
      walletId: walletBinding.privyWalletId,
      storedPublicKey: walletBinding.suiPublicKey,
    });

    return {
      status: 'authorization_required',
      authorizationRequest: buildEarnAuthorizationRequest(
        walletBinding.privyWalletId,
        txBytes,
      ),
    };
  }

  const authorization = await loadAuthorization(params.previewToken);
  if (!authorization) {
    throw new Error('Authorization expired. Please confirm the earn action again.');
  }

  await clearAuthorization(params.previewToken);
  action = authorization.action;
  txBytes = Uint8Array.from(Buffer.from(authorization.txBytesBase64, 'base64'));

  const signatures: string[] = [];
  const privy = getPrivyClient();
  const userSignature = await signSuiTransaction(
    privy,
    authorization.walletId,
    authorization.storedPublicKey,
    txBytes,
    { signatures: [params.authorizationSignature] },
  );
  signatures.push(userSignature);

  const gasKeypair = getGasStationKeypair();
  if (gasKeypair) {
    const gasSignature = await gasKeypair.signTransaction(txBytes);
    signatures.push(gasSignature.signature);
  }

  const txDigest = TransactionDataBuilder.getDigestFromBytes(txBytes);
  await stagePendingEarn(txDigest, {
    xUserId: params.xUserId,
    action,
    txBytesBase64: authorization.txBytesBase64,
    signatures,
  });

  try {
    const result = await getSuiClient().executeTransactionBlock({
      transactionBlock: txBytes,
      signature: signatures,
      options: {
        showEffects: true,
        showBalanceChanges: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status.status === 'success') {
      try {
        const frameworkPackageId = await getEarnFrameworkPackageId(walletBinding.suiAddress);
        const createdRetainedAccountId = extractCreatedEarnRetainedAccountId(
          result.objectChanges,
          frameworkPackageId,
        );
        await persistEarnAccounting({
          xUserId: params.xUserId,
          retainedAccountId: createdRetainedAccountId,
          lastSettledTxDigest: result.digest || txDigest,
        });
      } catch (bookkeepingError) {
        console.error('Earn bookkeeping failed after successful settlement', bookkeepingError);
      }
      await clearPendingEarn(txDigest);
      await clearPreview(params.previewToken);
      return {
        status: 'confirmed',
        action,
        txDigest: result.digest || txDigest,
      };
    }
  } catch (error) {
    console.error('Failed to execute Earn transaction', error);
  }

  return {
    status: 'pending',
    action,
    txDigest,
  };
}

export async function confirmEarnAction(params: {
  txDigest: string;
}): Promise<EarnConfirmResult> {
  const pending = await loadPendingEarn(params.txDigest);

  try {
    const tx = await getSuiClient().getTransactionBlock({
      digest: params.txDigest,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    if (tx.effects?.status.status === 'success') {
      if (pending?.xUserId) {
        try {
          const walletBinding = await getWalletBinding(pending.xUserId);
          const frameworkPackageId = walletBinding?.suiAddress
            ? await getEarnFrameworkPackageId(walletBinding.suiAddress)
            : null;
          const createdRetainedAccountId = frameworkPackageId
            ? extractCreatedEarnRetainedAccountId(tx.objectChanges, frameworkPackageId)
            : null;
          await persistEarnAccounting({
            xUserId: pending.xUserId,
            retainedAccountId: createdRetainedAccountId,
            lastSettledTxDigest: tx.digest || params.txDigest,
          });
        } catch (bookkeepingError) {
          console.error('Earn bookkeeping failed after confirmed transaction', bookkeepingError);
        }
      }
      await clearPendingEarn(params.txDigest);
      return {
        status: 'confirmed',
        txDigest: params.txDigest,
      };
    }
  } catch {
    // Fall through to pending recovery.
  }

  if (!pending) {
    return {
      status: 'pending',
      txDigest: params.txDigest,
    };
  }

  try {
    const result = await getSuiClient().executeTransactionBlock({
      transactionBlock: Uint8Array.from(Buffer.from(pending.txBytesBase64, 'base64')),
      signature: pending.signatures,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status.status === 'success') {
      try {
        const walletBinding = await getWalletBinding(pending.xUserId);
        const frameworkPackageId = walletBinding?.suiAddress
          ? await getEarnFrameworkPackageId(walletBinding.suiAddress)
          : null;
        const createdRetainedAccountId = frameworkPackageId
          ? extractCreatedEarnRetainedAccountId(result.objectChanges, frameworkPackageId)
          : null;
        await persistEarnAccounting({
          xUserId: pending.xUserId,
          retainedAccountId: createdRetainedAccountId,
          lastSettledTxDigest: result.digest || params.txDigest,
        });
      } catch (bookkeepingError) {
        console.error('Earn bookkeeping failed after confirmed retry', bookkeepingError);
      }
      await clearPendingEarn(params.txDigest);
      return {
        status: 'confirmed',
        txDigest: result.digest || params.txDigest,
      };
    }
  } catch (error) {
    console.warn('Earn confirmation retry is still pending', {
      txDigest: params.txDigest,
      error,
    });
  }

  return {
    status: 'pending',
    txDigest: params.txDigest,
  };
}
