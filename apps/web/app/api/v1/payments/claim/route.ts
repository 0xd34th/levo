import { NextRequest } from 'next/server';
import { z } from 'zod';
import { type TransactionArgument, Transaction } from '@mysten/sui/transactions';
import { getClientIp, noStoreJson, verifySameOrigin } from '@/lib/api';
import { getGasStationKeypair } from '@/lib/gas-station';
import { requestAttestation } from '@/lib/nautilus';
import { prisma } from '@/lib/prisma';
import {
  getPrivyClient,
  verifyPrivyXAuth,
} from '@/lib/privy-auth';
import {
  buildPrivyRawSignAuthorizationRequest,
  signSuiTransaction,
} from '@/lib/privy-wallet';
import {
  getConfiguredLevoUsdCoinType,
  isStableLayerEnabled,
} from '@/lib/coins';
import { getRedis, rateLimit } from '@/lib/rate-limit';
import { acquireRedisLock } from '@/lib/redis-lock';
import { type ClaimErrorDetails, type ClaimErrorStage } from '@/lib/claim-error-details';
import { buildBurnFromStableCoinTx } from '@/lib/stable-layer';
import { deriveVaultAddress, getSuiClient } from '@/lib/sui';
import { parseXUserId } from '@/lib/twitter';
import { getVaultOwnershipState } from '@/lib/vault-ownership';

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? '';
const VAULT_REGISTRY_ID = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID ?? '';
const ENCLAVE_REGISTRY_ID = process.env.ENCLAVE_REGISTRY_ID ?? '';
const MAX_CLAIM_COIN_OBJECTS = 200;
const MAX_CLAIM_COIN_PAGES = 20;
const AUTHORIZATION_BUNDLE_TTL_SEC = 120;
const CLAIM_SPONSORED_GAS_BUDGET_MIST = 50_000_000;
const STABLE_LAYER_DUST_RESERVE_RAW = 1n;
const STABLE_LAYER_REDEEMABLE_MINIMUM_ERROR =
  'Current vault balance is below StableLayer\'s redeemable minimum. Wait for more funds before claiming.';

const RequestSchema = z.object({
  authorizationSignature: z.string().min(1).optional(),
});

const PendingClaimAuthorizationBundleSchema = z.object({
  txBytesBase64: z.string().min(1),
  walletId: z.string().min(1),
  storedPublicKey: z.string().min(1),
  stableLayerDebugContext: z.object({
    debugId: z.string().min(1),
    xUserId: z.string().min(1),
    vaultAddress: z.string().min(1),
    claimFlow: z.enum(['CLAIM', 'WITHDRAW']),
    signingAddress: z.string().min(1),
    stableCoinType: z.string().min(1),
    storedStableLayerBalanceRaw: z.string().min(1),
    incomingStableLayerBalanceRaw: z.string().min(1),
    totalStableLayerBalanceRaw: z.string().min(1),
    stableLayerWithdrawAmountRaw: z.string().min(1),
    incomingStableLayerCoinCount: z.number().int().nonnegative(),
    incomingStableLayerCoins: z.array(
      z.object({
        objectId: z.string().min(1),
        balanceRaw: z.string().min(1),
      }),
    ),
  }).nullable().optional(),
});

type PendingClaimAuthorizationBundle = z.infer<typeof PendingClaimAuthorizationBundleSchema>;

class VaultCoinLimitError extends Error {}
class VaultCoinPageLimitError extends Error {}

type ClaimableVaultCoin = {
  objectId: string;
  version: string;
  digest: string;
  coinType: string;
  balance: bigint;
};

type ClaimFlow = 'CLAIM' | 'WITHDRAW';

type StableLayerIncomingCoinDebug = {
  objectId: string;
  balanceRaw: string;
};

type StableLayerClaimDebugContext = {
  debugId: string;
  xUserId: string;
  vaultAddress: string;
  claimFlow: ClaimFlow;
  signingAddress: string;
  stableCoinType: string;
  storedStableLayerBalanceRaw: string;
  incomingStableLayerBalanceRaw: string;
  totalStableLayerBalanceRaw: string;
  stableLayerWithdrawAmountRaw: string;
  incomingStableLayerCoinCount: number;
  incomingStableLayerCoins: StableLayerIncomingCoinDebug[];
};

type StableLayerClaimFailureCode =
  | 'stable_layer_withdraw_amount_zero'
  | 'stable_layer_balance_split'
  | 'stable_layer_compose_failed'
  | 'stable_layer_build_failed'
  | 'stable_layer_preflight_failed'
  | 'stable_layer_execute_failed';

function createClaimDebugId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractStableLayerErrorMessage(error: unknown): string | null {
  const candidates: unknown[] = [error];
  const seen = new Set<unknown>();

  while (candidates.length > 0) {
    const current = candidates.pop();
    if (current == null || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
      continue;
    }

    if (current instanceof Error) {
      candidates.push(current.message, current.cause);
      continue;
    }

    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      candidates.push(
        record.message,
        record.error,
        record.cause,
        record.executionError,
        record.status,
      );
    }
  }

  return null;
}

function buildStableLayerClaimDetails(
  debugContext: StableLayerClaimDebugContext,
  params: {
    stage: ClaimErrorStage;
    reason: string;
    rawChainError: string | null;
  },
): ClaimErrorDetails {
  return {
    stage: params.stage,
    reason: params.reason,
    rawChainError: params.rawChainError,
    totalStableLayerBalanceRaw: debugContext.totalStableLayerBalanceRaw,
    storedStableLayerBalanceRaw: debugContext.storedStableLayerBalanceRaw,
    incomingStableLayerBalanceRaw: debugContext.incomingStableLayerBalanceRaw,
    stableLayerWithdrawAmountRaw: debugContext.stableLayerWithdrawAmountRaw,
    incomingStableLayerCoinCount: debugContext.incomingStableLayerCoinCount,
  };
}

function logStableLayerClaimFailure(
  message: string,
  params: {
    code: StableLayerClaimFailureCode;
    stage: ClaimErrorStage;
    reason: string;
    error?: unknown;
    rawChainError?: string | null;
    debugContext: StableLayerClaimDebugContext;
  },
) {
  const { code, stage, reason, error, rawChainError, debugContext } = params;
  console.error(message, {
    debugId: debugContext.debugId,
    code,
    stage,
    reason,
    rawChainError: rawChainError ?? null,
    isBalanceSplitError: isStableLayerBalanceSplitError(rawChainError ?? error),
    xUserId: debugContext.xUserId,
    vaultAddress: debugContext.vaultAddress,
    claimFlow: debugContext.claimFlow,
    signingAddress: debugContext.signingAddress,
    stableCoinType: debugContext.stableCoinType,
    storedStableLayerBalanceRaw: debugContext.storedStableLayerBalanceRaw,
    incomingStableLayerBalanceRaw: debugContext.incomingStableLayerBalanceRaw,
    totalStableLayerBalanceRaw: debugContext.totalStableLayerBalanceRaw,
    stableLayerWithdrawAmountRaw: debugContext.stableLayerWithdrawAmountRaw,
    incomingStableLayerCoinCount: debugContext.incomingStableLayerCoinCount,
    incomingStableLayerCoins: debugContext.incomingStableLayerCoins,
    error,
  });
}

function buildStableLayerClaimFailureResponse(params: {
  status: number;
  error: string;
  code: StableLayerClaimFailureCode;
  stage: ClaimErrorStage;
  reason: string;
  rawChainError?: string | null;
  debugContext: StableLayerClaimDebugContext;
}) {
  const details = buildStableLayerClaimDetails(params.debugContext, {
    stage: params.stage,
    reason: params.reason,
    rawChainError: params.rawChainError ?? null,
  });

  return noStoreJson(
    {
      error: params.error,
      code: params.code,
      debugId: params.debugContext.debugId,
      details,
    },
    { status: params.status },
  );
}

function buildStableLayerRedeemableMinimumResponse(params: {
  stage: ClaimErrorStage;
  reason: string;
  rawChainError?: string | null;
  debugContext: StableLayerClaimDebugContext;
}) {
  return buildStableLayerClaimFailureResponse({
    status: 409,
    error: STABLE_LAYER_REDEEMABLE_MINIMUM_ERROR,
    code: 'stable_layer_balance_split',
    stage: params.stage,
    reason: params.reason,
    rawChainError: params.rawChainError,
    debugContext: params.debugContext,
  });
}

function extractCoinBalance(rawContent: unknown): bigint | null {
  if (!rawContent || typeof rawContent !== 'object') {
    return null;
  }

  const fields = (rawContent as { fields?: Record<string, unknown> }).fields;
  const directBalance = fields?.balance;
  if (
    typeof directBalance === 'string' ||
    typeof directBalance === 'number' ||
    typeof directBalance === 'bigint'
  ) {
    return BigInt(directBalance);
  }

  const wrappedValue =
    fields?.value as
      | { balance?: string | number | bigint; fields?: { balance?: string | number | bigint } }
      | undefined;
  const wrappedBalance = wrappedValue?.fields?.balance ?? wrappedValue?.balance;
  if (
    typeof wrappedBalance === 'string' ||
    typeof wrappedBalance === 'number' ||
    typeof wrappedBalance === 'bigint'
  ) {
    return BigInt(wrappedBalance);
  }

  return null;
}

function isStableLayerBalanceSplitError(error: unknown) {
  const candidates: unknown[] = [error];
  const seen = new Set<unknown>();

  while (candidates.length > 0) {
    const current = candidates.pop();
    if (current == null || seen.has(current)) {
      continue;
    }
    seen.add(current);

    if (typeof current === 'string') {
      const normalized = current.toLowerCase();
      if (
        /0x0*2::balance::split/.test(normalized) ||
        /name:\s*identifier\("balance"\).*function_name:\s*some\("split"\)/.test(normalized)
      ) {
        return true;
      }
      continue;
    }

    if (current instanceof Error) {
      candidates.push(current.message, current.cause);
      continue;
    }

    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      candidates.push(
        record.message,
        record.error,
        record.cause,
        record.executionError,
      );
    }
  }

  return false;
}

function getPendingClaimAuthorizationKey(xUserId: string) {
  return `pending-claim-auth:${xUserId}`;
}

async function stagePendingClaimAuthorization(
  xUserId: string,
  txBytes: Uint8Array,
  walletId: string,
  storedPublicKey: string,
  stableLayerDebugContext: StableLayerClaimDebugContext | null,
) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    throw new Error('Pending claim store unavailable');
  }

  const payload: PendingClaimAuthorizationBundle = {
    txBytesBase64: Buffer.from(txBytes).toString('base64'),
    walletId,
    storedPublicKey,
    stableLayerDebugContext,
  };

  await redis.set(
    getPendingClaimAuthorizationKey(xUserId),
    JSON.stringify(payload),
    'EX',
    AUTHORIZATION_BUNDLE_TTL_SEC,
  );
}

async function loadPendingClaimAuthorization(
  xUserId: string,
): Promise<PendingClaimAuthorizationBundle | null> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return null;
  }

  try {
    const raw = await redis.get(getPendingClaimAuthorizationKey(xUserId));
    if (!raw) {
      return null;
    }

    const parsed = PendingClaimAuthorizationBundleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Failed to load pending claim authorization bundle', { xUserId, error });
    return null;
  }
}

async function clearPendingClaimAuthorization(xUserId: string) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return;
  }

  try {
    await redis.del(getPendingClaimAuthorizationKey(xUserId));
  } catch (error) {
    console.warn('Failed to clear pending claim authorization bundle', { xUserId, error });
  }
}

async function getAllVaultCoins(
  client: ReturnType<typeof getSuiClient>,
  vaultAddress: string,
): Promise<ClaimableVaultCoin[]> {
  const coins: ClaimableVaultCoin[] = [];
  let cursor: string | null | undefined = null;
  let pageCount = 0;

  do {
    pageCount += 1;
    if (pageCount > MAX_CLAIM_COIN_PAGES) {
      throw new VaultCoinPageLimitError(
        'Vault contains too many assets to scan in one claim right now.',
      );
    }

    const page = await client.getOwnedObjects({
      owner: vaultAddress,
      cursor,
      options: { showType: true, showContent: true },
    });

    for (const obj of page.data) {
      const objectType = obj.data?.type;
      const objectId = obj.data?.objectId;
      const version = obj.data?.version;
      const digest = obj.data?.digest;
      const balance = extractCoinBalance(obj.data?.content);
      if (
        !objectId ||
        !version ||
        !digest ||
        typeof objectType !== 'string' ||
        !objectType.startsWith('0x2::coin::Coin<') ||
        !objectType.endsWith('>') ||
        balance === null
      ) {
        continue;
      }

      const coinTypeMatch = objectType.match(/^0x2::coin::Coin<(.+)>$/);
      if (!coinTypeMatch?.[1]) {
        continue;
      }

      coins.push({
        objectId,
        version: typeof version === 'string' ? version : String(version),
        digest,
        coinType: coinTypeMatch[1],
        balance,
      });
    }
    if (coins.length > MAX_CLAIM_COIN_OBJECTS) {
      throw new VaultCoinLimitError(
        'Vault contains too many deposits to claim in one transaction right now.',
      );
    }
    cursor = page.nextCursor;

    if (!page.hasNextPage) {
      break;
    }
  } while (cursor);

  return coins;
}

async function getStoredVaultCoinBalance(
  client: ReturnType<typeof getSuiClient>,
  vaultAddress: string,
  coinType: string,
): Promise<bigint> {
  let cursor: string | null | undefined = null;
  let pageCount = 0;
  const expectedKeyType = `${PACKAGE_ID}::x_vault::BalanceKey<${coinType}>`;

  do {
    pageCount += 1;
    if (pageCount > MAX_CLAIM_COIN_PAGES) {
      throw new VaultCoinPageLimitError(
        'Vault contains too many assets to scan in one claim right now.',
      );
    }

    const page = await client.getDynamicFields({
      parentId: vaultAddress,
      cursor,
    });

    const field = page.data.find((entry) => entry.name?.type === expectedKeyType);
    if (field?.objectId) {
      const object = await client.getObject({
        id: field.objectId,
        options: { showContent: true },
      });
      return extractCoinBalance(object.data?.content) ?? 0n;
    }

    cursor = page.nextCursor;
    if (!page.hasNextPage) {
      break;
    }
  } while (cursor);

  return 0n;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson({ error: 'Invalid input' }, { status: 400 });
  }

  const { authorizationSignature } = parsed.data;

  // 1. Rate limit
  const ip = getClientIp(req);
  const rl = await rateLimit(`claim:${ip}`, 60, 5);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  // 2. Verify Privy auth
  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;

  const xUserId = parseXUserId(auth.identity.xUserId);
  if (!xUserId) {
    return noStoreJson(
      { error: 'Invalid X user identifier' },
      { status: 400 },
    );
  }

  // 3. Check config
  if (!PACKAGE_ID || !VAULT_REGISTRY_ID || !ENCLAVE_REGISTRY_ID) {
    return noStoreJson({ error: 'Server configuration error' }, { status: 500 });
  }

  const claimLock = await acquireRedisLock(`claim:${xUserId}`, 60);
  if (claimLock.status !== 'acquired') {
    if (claimLock.status === 'busy') {
      return noStoreJson(
        { error: 'Claim already in progress. Check your wallet in a moment.' },
        { status: 409 },
      );
    }

    return noStoreJson(
      { error: 'Claims are temporarily unavailable. Please retry shortly.' },
      { status: 503 },
    );
  }

  try {
    // 4. Get user's embedded wallet
    const xUser = await prisma.xUser.findUnique({
      where: { xUserId },
      select: {
        privyUserId: true,
        privyWalletId: true,
        suiAddress: true,
        suiPublicKey: true,
      },
    });

    if (!xUser?.privyWalletId || !xUser.suiAddress || !xUser.suiPublicKey) {
      return noStoreJson(
        { error: 'No embedded wallet found. Please set up your wallet first.' },
        { status: 400 },
      );
    }

    if (!xUser.privyUserId || xUser.privyUserId !== auth.identity.privyUserId) {
      return noStoreJson(
        { error: 'Wallet ownership could not be verified. Please set up your wallet first.' },
        { status: 403 },
      );
    }

    const client = getSuiClient();
    const vaultAddress = deriveVaultAddress(VAULT_REGISTRY_ID, BigInt(xUserId));
    let ownership;
    try {
      ownership = await getVaultOwnershipState({
        client,
        vaultAddress,
        canonicalAddress: xUser.suiAddress,
      });
    } catch (error) {
      console.error('Failed to query vault ownership', error);
      return noStoreJson({ error: 'Failed to query vault status' }, { status: 500 });
    }

    if (ownership.kind === 'OWNED_BY_OTHER') {
      return noStoreJson(
        { error: 'This vault is currently controlled by a different wallet and cannot be claimed from this app.' },
        { status: 409 },
      );
    }

    const claimFlow: ClaimFlow =
      ownership.kind === 'OWNED_BY_CANONICAL'
        ? 'WITHDRAW'
        : 'CLAIM';
    const signingAddress = xUser.suiAddress;
    const signingWalletId = xUser.privyWalletId;
    const signingPublicKey = xUser.suiPublicKey;

    if (!signingPublicKey) {
      return noStoreJson(
        { error: 'Wallet ownership could not be verified. Please set up your wallet first.' },
        { status: 403 },
      );
    }

    let attestation: Awaited<ReturnType<typeof requestAttestation>> | null = null;
    if (claimFlow === 'CLAIM') {
      try {
        attestation = await requestAttestation({
          xUserId,
          suiAddress: xUser.suiAddress,
        });
      } catch (error) {
        console.error('Attestation request failed', error);
        return noStoreJson(
          { error: 'Failed to obtain attestation. Please try again.' },
          { status: 502 },
        );
      }
    }

    let coins;
    try {
      coins = await getAllVaultCoins(client, vaultAddress);
    } catch (error) {
      if (error instanceof VaultCoinLimitError) {
        return noStoreJson({ error: error.message }, { status: 409 });
      }
      if (error instanceof VaultCoinPageLimitError) {
        return noStoreJson({ error: error.message }, { status: 409 });
      }
      console.error('Failed to fetch vault coins', error);
      return noStoreJson({ error: 'Failed to query vault status' }, { status: 500 });
    }

    const configuredLevoUsdCoinType = getConfiguredLevoUsdCoinType();
    let storedStableLayerBalance = 0n;
    if (isStableLayerEnabled() && configuredLevoUsdCoinType) {
      try {
        storedStableLayerBalance = await getStoredVaultCoinBalance(
          client,
          vaultAddress,
          configuredLevoUsdCoinType,
        );
      } catch (error) {
        if (error instanceof VaultCoinPageLimitError) {
          return noStoreJson({ error: error.message }, { status: 409 });
        }
        console.error('Failed to query stored vault balances', {
          vaultAddress,
          coinType: configuredLevoUsdCoinType,
          error,
        });
        return noStoreJson({ error: 'Failed to query vault status' }, { status: 500 });
      }
    }

    if (coins.length === 0 && storedStableLayerBalance === 0n) {
      return noStoreJson({ error: 'No funds to claim in the vault' }, { status: 400 });
    }

    // 7. Build claim PTB or load the staged authorization bundle
    let gasKeypair: ReturnType<typeof getGasStationKeypair>;
    try {
      gasKeypair = getGasStationKeypair();
    } catch (error) {
      console.error('Failed to initialize gas station keypair', error);
      return noStoreJson({ error: 'Gas sponsorship is misconfigured' }, { status: 500 });
    }
    let txBytes: Uint8Array;
    let walletId = signingWalletId;
    let storedPublicKey = signingPublicKey;
    let stableLayerDebugContext: StableLayerClaimDebugContext | null = null;

    if (authorizationSignature) {
      const authorizationBundle = await loadPendingClaimAuthorization(auth.identity.xUserId);
      if (!authorizationBundle) {
        return noStoreJson(
          { error: 'Authorization expired. Please start the claim again.' },
          { status: 409 },
        );
      }

      await clearPendingClaimAuthorization(auth.identity.xUserId);

      txBytes = Uint8Array.from(Buffer.from(authorizationBundle.txBytesBase64, 'base64'));
      walletId = authorizationBundle.walletId;
      storedPublicKey = authorizationBundle.storedPublicKey;
      stableLayerDebugContext = authorizationBundle.stableLayerDebugContext ?? null;
    } else {
      const tx = new Transaction();
      tx.setSender(signingAddress);

      if (gasKeypair) {
        tx.setGasOwner(gasKeypair.toSuiAddress());
        tx.setGasBudget(CLAIM_SPONSORED_GAS_BUDGET_MIST);
      }

      let vault: TransactionArgument;
      if (claimFlow === 'CLAIM') {
        console.log('[claim] attestation params:', {
          xUserId: attestation?.xUserId.toString(),
          suiAddress: attestation?.suiAddress,
          nonce: attestation?.nonce.toString(),
          expiresAt: attestation?.expiresAt.toString(),
          signatureHex: attestation
            ? Buffer.from(attestation.signature).toString('hex')
            : null,
          signatureLen: attestation?.signature.length ?? 0,
          registryId: ENCLAVE_REGISTRY_ID,
        });

        [vault] = tx.moveCall({
          target: `${PACKAGE_ID}::x_vault::claim_vault`,
          arguments: [
            tx.object(VAULT_REGISTRY_ID),
            tx.object(ENCLAVE_REGISTRY_ID),
            tx.pure.u64(attestation!.xUserId),
            tx.pure.address(attestation!.suiAddress),
            tx.pure.u64(attestation!.nonce),
            tx.pure.u64(attestation!.expiresAt),
            tx.pure.vector('u8', Array.from(attestation!.signature)),
            tx.object('0x6'),
          ],
        });
      } else {
        vault = tx.object(vaultAddress);
      }

      const claimableCoins: ClaimableVaultCoin[] = [];
      const incomingBalanceByType = new Map<string, bigint>();
      const coinTypes = new Set<string>();
      for (const coinObj of coins) {
        claimableCoins.push(coinObj);
        coinTypes.add(coinObj.coinType);
        incomingBalanceByType.set(
          coinObj.coinType,
          (incomingBalanceByType.get(coinObj.coinType) ?? 0n) + coinObj.balance,
        );
      }

      if (storedStableLayerBalance > 0n && configuredLevoUsdCoinType) {
        coinTypes.add(configuredLevoUsdCoinType);
      }

      if (claimableCoins.length === 0 && storedStableLayerBalance === 0n) {
        return noStoreJson({ error: 'No claimable funds found in the vault' }, { status: 400 });
      }

      for (const claimableCoin of claimableCoins) {
        tx.moveCall({
          target: `${PACKAGE_ID}::x_vault::sweep_coin_to_vault`,
          typeArguments: [claimableCoin.coinType],
          arguments: [
            tx.object(VAULT_REGISTRY_ID),
            vault,
            tx.receivingRef({
              objectId: claimableCoin.objectId,
              version: claimableCoin.version,
              digest: claimableCoin.digest,
            }),
          ],
        });
      }

      const stableLayerIncomingCoins =
        configuredLevoUsdCoinType
          ? claimableCoins
            .filter((coin) => coin.coinType === configuredLevoUsdCoinType)
            .map((coin) => ({
              objectId: coin.objectId,
              balanceRaw: coin.balance.toString(),
            }))
          : [];
      const incomingStableLayerBalance =
        configuredLevoUsdCoinType
          ? (incomingBalanceByType.get(configuredLevoUsdCoinType) ?? 0n)
          : 0n;
      const totalStableLayerBalance =
        configuredLevoUsdCoinType
          ? incomingStableLayerBalance + storedStableLayerBalance
          : 0n;
      const stableLayerWithdrawAmount =
        totalStableLayerBalance > STABLE_LAYER_DUST_RESERVE_RAW
          ? totalStableLayerBalance - STABLE_LAYER_DUST_RESERVE_RAW
          : 0n;
      stableLayerDebugContext =
        configuredLevoUsdCoinType
          ? {
              debugId: createClaimDebugId(),
              xUserId,
              vaultAddress,
              claimFlow,
              signingAddress,
              stableCoinType: configuredLevoUsdCoinType,
              storedStableLayerBalanceRaw: storedStableLayerBalance.toString(),
              incomingStableLayerBalanceRaw: incomingStableLayerBalance.toString(),
              totalStableLayerBalanceRaw: totalStableLayerBalance.toString(),
              stableLayerWithdrawAmountRaw: stableLayerWithdrawAmount.toString(),
              incomingStableLayerCoinCount: stableLayerIncomingCoins.length,
              incomingStableLayerCoins: stableLayerIncomingCoins,
            } satisfies StableLayerClaimDebugContext
          : null;
      let hasClaimableWithdrawal = false;

      for (const innerCoinType of coinTypes) {
        if (
          isStableLayerEnabled() &&
          configuredLevoUsdCoinType &&
          innerCoinType === configuredLevoUsdCoinType
        ) {
          if (stableLayerWithdrawAmount === 0n) {
            continue;
          }

          const [withdrawn] = tx.moveCall({
            target: `${PACKAGE_ID}::x_vault::withdraw`,
            typeArguments: [innerCoinType],
            arguments: [
              tx.object(VAULT_REGISTRY_ID),
              vault,
              tx.pure.u64(stableLayerWithdrawAmount),
            ],
          });

          hasClaimableWithdrawal = true;
          try {
            const usdcCoin = await buildBurnFromStableCoinTx({
              tx,
              senderAddress: signingAddress,
              stableCoinType: innerCoinType,
              stableCoin: withdrawn,
            });
            tx.transferObjects([usdcCoin], xUser.suiAddress);
          } catch (error) {
            const rawChainError = extractStableLayerErrorMessage(error);
            if (stableLayerDebugContext) {
              logStableLayerClaimFailure(
                'Failed to compose StableLayer burn transaction',
                {
                  code: 'stable_layer_compose_failed',
                  stage: 'compose_burn',
                  reason: 'StableLayer burn transaction composition failed.',
                  error,
                  rawChainError,
                  debugContext: stableLayerDebugContext,
                },
              );
              return buildStableLayerClaimFailureResponse({
                status: 503,
                error: 'Claims are temporarily unavailable. Please retry shortly.',
                code: 'stable_layer_compose_failed',
                stage: 'compose_burn',
                reason: 'StableLayer burn transaction composition failed.',
                rawChainError,
                debugContext: stableLayerDebugContext,
              });
            }
            console.error('Failed to compose StableLayer burn transaction', error);
            return noStoreJson(
              { error: 'Claims are temporarily unavailable. Please retry shortly.' },
              { status: 503 },
            );
          }
        } else {
          const [withdrawn] = tx.moveCall({
            target: `${PACKAGE_ID}::x_vault::withdraw_all`,
            typeArguments: [innerCoinType],
            arguments: [
              tx.object(VAULT_REGISTRY_ID),
              vault,
            ],
          });

          hasClaimableWithdrawal = true;
          tx.transferObjects([withdrawn], xUser.suiAddress);
        }
      }

      if (!hasClaimableWithdrawal) {
        if (totalStableLayerBalance > 0n) {
          if (stableLayerDebugContext) {
            logStableLayerClaimFailure(
              'StableLayer claim resolved to zero withdraw amount',
              {
                code: 'stable_layer_withdraw_amount_zero',
                stage: 'precheck',
                reason: 'StableLayer withdraw amount resolved to zero after reserve logic.',
                debugContext: stableLayerDebugContext,
              },
            );
            return buildStableLayerClaimFailureResponse({
              status: 409,
              error: STABLE_LAYER_REDEEMABLE_MINIMUM_ERROR,
              code: 'stable_layer_withdraw_amount_zero',
              stage: 'precheck',
              reason: 'StableLayer withdraw amount resolved to zero after reserve logic.',
              debugContext: stableLayerDebugContext,
            });
          }
          return noStoreJson(
            { error: STABLE_LAYER_REDEEMABLE_MINIMUM_ERROR },
            { status: 409 },
          );
        }

        return noStoreJson({ error: 'No claimable funds found in the vault' }, { status: 400 });
      }

      if (claimFlow === 'CLAIM') {
        // XVault has no `store`; use the module helper instead of PTB transferObjects.
        tx.moveCall({
          target: `${PACKAGE_ID}::x_vault::transfer_vault`,
          arguments: [vault],
        });
      }

      try {
        txBytes = await tx.build({ client });
      } catch (error) {
        const rawChainError = extractStableLayerErrorMessage(error);
        if (stableLayerDebugContext) {
          const isBalanceSplit = isStableLayerBalanceSplitError(error);
          logStableLayerClaimFailure(
            'Failed to build claim transaction',
            {
              code: isBalanceSplit
                ? 'stable_layer_balance_split'
                : 'stable_layer_build_failed',
              stage: 'build',
              reason: isBalanceSplit
                ? 'StableLayer redeem hit a balance split failure while building the transaction.'
                : 'StableLayer redeem failed while building the claim transaction.',
              error,
              rawChainError,
              debugContext: stableLayerDebugContext,
            },
          );
          if (isBalanceSplit) {
            return buildStableLayerRedeemableMinimumResponse({
              stage: 'build',
              reason: 'StableLayer redeem hit a balance split failure while building the transaction.',
              rawChainError,
              debugContext: stableLayerDebugContext,
            });
          }
          return buildStableLayerClaimFailureResponse({
            status: 400,
            error: 'Failed to build claim transaction',
            code: 'stable_layer_build_failed',
            stage: 'build',
            reason: 'StableLayer redeem failed while building the claim transaction.',
            rawChainError,
            debugContext: stableLayerDebugContext,
          });
        }
        console.error('Failed to build claim transaction', error);
        return noStoreJson(
          { error: 'Failed to build claim transaction' },
          { status: 400 },
        );
      }

      try {
        const preflight = await client.dryRunTransactionBlock({
          transactionBlock: txBytes,
        });

        if (preflight.effects?.status.status !== 'success') {
          const rawChainError = extractStableLayerErrorMessage(preflight.effects?.status.error);
          if (stableLayerDebugContext) {
            const isBalanceSplit = isStableLayerBalanceSplitError(preflight.effects?.status.error);
            logStableLayerClaimFailure(
              'Claim preflight dry-run failed',
              {
                code: isBalanceSplit
                  ? 'stable_layer_balance_split'
                  : 'stable_layer_preflight_failed',
                stage: 'preflight',
                reason: isBalanceSplit
                  ? 'StableLayer redeem hit a balance split failure during dry-run.'
                  : 'StableLayer redeem failed during dry-run.',
                error: preflight.effects?.status,
                rawChainError,
                debugContext: stableLayerDebugContext,
              },
            );
            if (isBalanceSplit) {
              return buildStableLayerRedeemableMinimumResponse({
                stage: 'preflight',
                reason: 'StableLayer redeem hit a balance split failure during dry-run.',
                rawChainError,
                debugContext: stableLayerDebugContext,
              });
            }
            return buildStableLayerClaimFailureResponse({
              status: 503,
              error: 'Claims are temporarily unavailable. Please retry shortly.',
              code: 'stable_layer_preflight_failed',
              stage: 'preflight',
              reason: 'StableLayer redeem failed during dry-run.',
              rawChainError,
              debugContext: stableLayerDebugContext,
            });
          }
          console.error('Claim preflight dry-run failed', {
            xUserId,
            vaultAddress,
            status: preflight.effects?.status,
          });
          return noStoreJson(
            { error: 'Claims are temporarily unavailable. Please retry shortly.' },
            { status: 503 },
          );
        }
      } catch (error) {
        if (stableLayerDebugContext) {
          const rawChainError = extractStableLayerErrorMessage(error);
          logStableLayerClaimFailure(
            'Failed to preflight claim transaction',
            {
              code: 'stable_layer_preflight_failed',
              stage: 'preflight',
              reason: 'Claim preflight could not complete.',
              error,
              rawChainError,
              debugContext: stableLayerDebugContext,
            },
          );
          return buildStableLayerClaimFailureResponse({
            status: 503,
            error: 'Claims are temporarily unavailable. Please retry shortly.',
            code: 'stable_layer_preflight_failed',
            stage: 'preflight',
            reason: 'Claim preflight could not complete.',
            rawChainError,
            debugContext: stableLayerDebugContext,
          });
        }
        console.error('Failed to preflight claim transaction', error);
        return noStoreJson(
          { error: 'Claims are temporarily unavailable. Please retry shortly.' },
          { status: 503 },
        );
      }

      try {
        await stagePendingClaimAuthorization(
          auth.identity.xUserId,
          txBytes,
          walletId,
          storedPublicKey,
          stableLayerDebugContext,
        );
      } catch (error) {
        console.error('Failed to stage claim authorization request', error);
        return noStoreJson(
          { error: 'Claims are temporarily unavailable. Please retry shortly.' },
          { status: 503 },
        );
      }

      try {
        const authorizationRequest = buildPrivyRawSignAuthorizationRequest(
          walletId,
          txBytes,
        );
        return noStoreJson({
          status: 'authorization_required',
          authorizationRequest,
        });
      } catch (error) {
        console.error('Failed to build Privy claim authorization request', error);
        return noStoreJson({ error: 'Server configuration error' }, { status: 500 });
      }
    }

    let senderSignature: string;
    try {
      const privy = getPrivyClient();
      senderSignature = await signSuiTransaction(
        privy,
        walletId,
        storedPublicKey,
        txBytes,
        { signatures: [authorizationSignature] },
      );
    } catch (error) {
      console.error('Failed to sign claim transaction', error);
      return noStoreJson({ error: 'Failed to sign transaction' }, { status: 500 });
    }

    const signatures: string[] = [senderSignature];
    if (gasKeypair) {
      try {
        const gasSignatureResult = await gasKeypair.signTransaction(txBytes);
        signatures.push(gasSignatureResult.signature);
      } catch (error) {
        console.error('Failed to sign gas-sponsored claim transaction', error);
        return noStoreJson({ error: 'Gas sponsorship failed' }, { status: 503 });
      }
    }

    // 9. Execute
    let txDigest: string;
    try {
      const result = await client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signatures,
        options: { showEffects: true },
      });

      if (result.effects?.status.status !== 'success') {
        const rawChainError = extractStableLayerErrorMessage(result.effects?.status.error);
        if (stableLayerDebugContext) {
          const isBalanceSplit = isStableLayerBalanceSplitError(result.effects?.status.error);
          logStableLayerClaimFailure(
            'Claim transaction failed on-chain',
            {
              code: isBalanceSplit
                ? 'stable_layer_balance_split'
                : 'stable_layer_execute_failed',
              stage: 'execute',
              reason: isBalanceSplit
                ? 'StableLayer redeem hit a balance split failure on-chain.'
                : 'Claim transaction failed on-chain.',
              error: result.effects?.status,
              rawChainError,
              debugContext: stableLayerDebugContext,
            },
          );
          if (isBalanceSplit) {
            return buildStableLayerRedeemableMinimumResponse({
              stage: 'execute',
              reason: 'StableLayer redeem hit a balance split failure on-chain.',
              rawChainError,
              debugContext: stableLayerDebugContext,
            });
          }
          return buildStableLayerClaimFailureResponse({
            status: 409,
            error: 'Claim transaction failed on-chain. Please try again.',
            code: 'stable_layer_execute_failed',
            stage: 'execute',
            reason: 'Claim transaction failed on-chain.',
            rawChainError,
            debugContext: stableLayerDebugContext,
          });
        }
        console.error('Claim transaction failed on-chain', {
          xUserId,
          vaultAddress,
          txDigest: result.digest,
          status: result.effects?.status,
        });
        return noStoreJson(
          { error: 'Claim transaction failed on-chain. Please try again.' },
          { status: 409 },
        );
      }

      txDigest = result.digest;
    } catch (error) {
      if (stableLayerDebugContext) {
        const rawChainError = extractStableLayerErrorMessage(error);
        logStableLayerClaimFailure(
          'Failed to execute claim transaction',
          {
            code: 'stable_layer_execute_failed',
            stage: 'execute',
            reason: 'Claim execution did not complete.',
            error,
            rawChainError,
            debugContext: stableLayerDebugContext,
          },
        );
        return buildStableLayerClaimFailureResponse({
          status: 500,
          error: 'Claim execution did not complete. Please try again.',
          code: 'stable_layer_execute_failed',
          stage: 'execute',
          reason: 'Claim execution did not complete.',
          rawChainError,
          debugContext: stableLayerDebugContext,
        });
      }
      console.error('Failed to execute claim transaction', error);
      return noStoreJson(
        { error: 'Claim execution did not complete. Please try again.' },
        { status: 500 },
      );
    }

    return noStoreJson({
      status: 'claimed',
      txDigest,
      vaultAddress,
      owner: xUser.suiAddress,
    });
  } finally {
    await claimLock.release();
  }
}
