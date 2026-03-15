import type { SuiObjectResponse } from '@mysten/sui/jsonRpc';
import {
  getCoinDecimals,
  getCoinLabel,
  isDisplaySupportedCoinType,
} from '@/lib/coins';
import { prisma } from '@/lib/prisma';
import {
  IncomingPaymentItem,
  IncomingPaymentsResponse,
  PublicLookupResponse,
  RECEIVED_CLAIM_STATUS_MODEL,
  ReceivedDashboardUser,
  ReceivedVaultSummary,
} from '@/lib/received-dashboard-types';
import { deriveVaultAddress, getSuiClient } from '@/lib/sui';
import { encodeTransactionHistoryCursor } from '@/lib/transaction-history-cursor';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';
import { parseXUserId, type XUserInfo } from '@/lib/twitter';
import { FRESH_X_USER_TTL_MS } from '@/lib/x-user-lookup';

const DEFAULT_DERIVATION_VERSION = 1;
const RECEIVED_VAULT_SUMMARY_CACHE_TTL_MS = 30_000;
const RECEIVED_VAULT_SUMMARY_CACHE_MAX_ENTRIES = 500;
const MAX_INCOMING_PAYMENT_SCAN_ITERATIONS = 10;

export const PUBLIC_LOOKUP_RECENT_PAYMENTS_LIMIT = 5;

interface IncomingPaymentsCursor {
  createdAt: string;
  id: string;
}

interface CachedReceivedVaultSummary {
  expiresAt: number;
  value: ReceivedVaultSummary;
}

interface IncomingPaymentRow {
  id: string;
  txDigest: string;
  senderAddress: string;
  coinType: string;
  amount: bigint;
  createdAt: Date;
}

const receivedVaultSummaryCache = new Map<string, CachedReceivedVaultSummary>();

function sanitizeProfilePictureUrl(url: string | null): string | null {
  return url && isTrustedProfilePictureUrl(url) ? url : null;
}

function mapIncomingPayment(row: IncomingPaymentRow): IncomingPaymentItem | null {
  if (!isDisplaySupportedCoinType(row.coinType)) {
    console.warn('Ignoring unsupported coin type in received dashboard payment', {
      coinType: row.coinType,
      paymentId: row.id,
      txDigest: row.txDigest,
    });
    return null;
  }

  return {
    id: row.id,
    txDigest: row.txDigest,
    senderAddress: row.senderAddress,
    coinType: row.coinType,
    symbol: getCoinLabel(row.coinType),
    decimals: getCoinDecimals(row.coinType),
    amount: row.amount.toString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toReceivedDashboardUser(userInfo: XUserInfo): ReceivedDashboardUser {
  return {
    xUserId: userInfo.xUserId,
    username: userInfo.username,
    profilePicture: sanitizeProfilePictureUrl(userInfo.profilePicture),
    isBlueVerified: userInfo.isBlueVerified,
  };
}

function pruneReceivedVaultSummaryCache(now = Date.now()) {
  for (const [cacheKey, entry] of receivedVaultSummaryCache) {
    if (entry.expiresAt <= now) {
      receivedVaultSummaryCache.delete(cacheKey);
    }
  }

  while (receivedVaultSummaryCache.size > RECEIVED_VAULT_SUMMARY_CACHE_MAX_ENTRIES) {
    const oldestKey = receivedVaultSummaryCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    receivedVaultSummaryCache.delete(oldestKey);
  }
}

export async function persistReceivedDashboardXUser(
  userInfo: XUserInfo,
): Promise<number> {
  const sanitizedProfilePicture = sanitizeProfilePictureUrl(userInfo.profilePicture);
  const existingUser = await prisma.xUser.findUnique({
    where: { xUserId: userInfo.xUserId },
    select: {
      derivationVersion: true,
      updatedAt: true,
      username: true,
      profilePicture: true,
      isBlueVerified: true,
    },
  });

  if (
    existingUser &&
    existingUser.updatedAt >= new Date(Date.now() - FRESH_X_USER_TTL_MS) &&
    existingUser.username === userInfo.username &&
    existingUser.profilePicture === sanitizedProfilePicture &&
    existingUser.isBlueVerified === userInfo.isBlueVerified
  ) {
    return existingUser.derivationVersion;
  }

  try {
    const row = await prisma.xUser.upsert({
      where: { xUserId: userInfo.xUserId },
      update: {
        username: userInfo.username,
        profilePicture: sanitizedProfilePicture,
        isBlueVerified: userInfo.isBlueVerified,
      },
      create: {
        xUserId: userInfo.xUserId,
        username: userInfo.username,
        profilePicture: sanitizedProfilePicture,
        isBlueVerified: userInfo.isBlueVerified,
        derivationVersion: DEFAULT_DERIVATION_VERSION,
      },
      select: {
        derivationVersion: true,
      },
    });

    return row.derivationVersion;
  } catch (error) {
    console.error('Failed to persist received dashboard X user metadata', error);
    return existingUser?.derivationVersion ?? DEFAULT_DERIVATION_VERSION;
  }
}

function cacheReceivedVaultSummary(
  xUserId: string,
  registryId: string,
  derivationVersion: number,
  value: ReceivedVaultSummary,
) {
  const cacheKey = `${xUserId}:${registryId}:${derivationVersion}`;
  const now = Date.now();
  pruneReceivedVaultSummaryCache(now);
  receivedVaultSummaryCache.delete(cacheKey);
  receivedVaultSummaryCache.set(cacheKey, {
    expiresAt: now + RECEIVED_VAULT_SUMMARY_CACHE_TTL_MS,
    value,
  });
}

async function getCachedReceivedVaultSummary(
  xUserId: string,
  registryId: string,
  derivationVersion: number,
): Promise<ReceivedVaultSummary> {
  const cacheKey = `${xUserId}:${registryId}:${derivationVersion}`;
  const cached = receivedVaultSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    receivedVaultSummaryCache.delete(cacheKey);
    receivedVaultSummaryCache.set(cacheKey, cached);
    return cached.value;
  }

  receivedVaultSummaryCache.delete(cacheKey);

  const value = await getReceivedVaultSummary(
    xUserId,
    registryId,
    derivationVersion,
  );
  cacheReceivedVaultSummary(xUserId, registryId, derivationVersion, value);
  return value;
}

async function findIncomingPaymentRows(
  xUserId: string,
  take: number,
  cursor: IncomingPaymentsCursor | null = null,
) {
  const cursorCreatedAt = cursor ? new Date(cursor.createdAt) : null;

  return prisma.paymentLedger.findMany({
    where: cursor && cursorCreatedAt
      ? {
          xUserId,
          OR: [
            { createdAt: { lt: cursorCreatedAt } },
            { createdAt: cursorCreatedAt, id: { lt: cursor.id } },
          ],
        }
      : { xUserId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: {
      id: true,
      txDigest: true,
      senderAddress: true,
      coinType: true,
      amount: true,
      createdAt: true,
    },
  });
}

/**
 * There is no persisted claim record yet, so claim status is derived directly
 * from chain state: if the deterministic XVault object exists at the derived
 * vault address, the vault is treated as claimed; otherwise it is unclaimed.
 */
export async function getReceivedVaultSummary(
  xUserId: string,
  registryId: string,
  derivationVersion = DEFAULT_DERIVATION_VERSION,
): Promise<ReceivedVaultSummary> {
  const normalizedXUserId = parseXUserId(xUserId);
  if (!normalizedXUserId) {
    throw new Error('Invalid X user id');
  }

  const vaultAddress = deriveVaultAddress(registryId, BigInt(normalizedXUserId));
  const client = getSuiClient();

  const [objectResponse, balances] = await Promise.all([
    client.getObject({
      id: vaultAddress,
      options: { showType: true },
    }),
    client.getAllBalances({ owner: vaultAddress }),
  ]);

  const typedObjectResponse: SuiObjectResponse = objectResponse;
  const vaultExists = typedObjectResponse.data != null;
  const objectErrorCode = typedObjectResponse.error?.code ?? null;

  if (!vaultExists && objectErrorCode && objectErrorCode !== 'notExists' && objectErrorCode !== 'deleted') {
    throw new Error(`Unexpected vault lookup error: ${objectErrorCode}`);
  }

  return {
    derivationVersion,
    vaultAddress,
    vaultExists,
    claimStatus: vaultExists
      ? 'CLAIMED'
      : objectErrorCode === 'deleted'
        ? 'PREVIOUSLY_CLAIMED'
        : 'UNCLAIMED',
    claimStatusModel: RECEIVED_CLAIM_STATUS_MODEL,
    pendingBalances: balances
      .filter((balance) => BigInt(balance.totalBalance) > 0n)
      .filter((balance) => {
        if (isDisplaySupportedCoinType(balance.coinType)) {
          return true;
        }

        console.warn('Ignoring unsupported coin type in received dashboard balance', {
          coinType: balance.coinType,
          vaultAddress,
        });
        return false;
      })
      .sort((a, b) => a.coinType.localeCompare(b.coinType))
      .map((balance) => ({
        coinType: balance.coinType,
        symbol: getCoinLabel(balance.coinType),
        decimals: getCoinDecimals(balance.coinType),
        amount: balance.totalBalance,
      })),
  };
}

export async function getIncomingPaymentsPage(
  xUserId: string,
  limit: number,
  cursor: IncomingPaymentsCursor | null = null,
): Promise<{
  items: IncomingPaymentItem[];
  nextCursor: string | null;
}> {
  const mappedItems: IncomingPaymentItem[] = [];
  let scanCursor = cursor;
  let exhausted = false;
  let iterations = 0;
  let lastScannedRow: IncomingPaymentRow | null = null;

  while (
    mappedItems.length <= limit &&
    !exhausted &&
    iterations < MAX_INCOMING_PAYMENT_SCAN_ITERATIONS
  ) {
    iterations += 1;
    const remaining = limit + 1 - mappedItems.length;
    const rows = await findIncomingPaymentRows(xUserId, remaining, scanCursor);
    exhausted = rows.length < remaining;
    lastScannedRow = rows[rows.length - 1] ?? lastScannedRow;

    for (const row of rows) {
      const mapped = mapIncomingPayment(row);
      if (mapped) {
        mappedItems.push(mapped);
      }
    }

    if (!exhausted && mappedItems.length <= limit) {
      const lastRow = rows[rows.length - 1];
      scanCursor = lastRow
        ? {
            createdAt: lastRow.createdAt.toISOString(),
            id: lastRow.id,
          }
        : null;
    }
  }

  const hasMore = mappedItems.length > limit;
  const items = hasMore ? mappedItems.slice(0, limit) : mappedItems;
  const lastItem = items[items.length - 1];
  const hitScanLimit =
    !hasMore &&
    !exhausted &&
    iterations === MAX_INCOMING_PAYMENT_SCAN_ITERATIONS &&
    Boolean(lastScannedRow);
  const nextCursorSource = hasMore
    ? lastItem
    : hitScanLimit && lastScannedRow
      ? {
          createdAt: lastScannedRow.createdAt.toISOString(),
          id: lastScannedRow.id,
        }
      : null;

  return {
    items,
    nextCursor: nextCursorSource
      ? encodeTransactionHistoryCursor({
          createdAt: nextCursorSource.createdAt,
          id: nextCursorSource.id,
        })
      : null,
  };
}

export async function buildPublicLookupResponse(
  userInfo: XUserInfo,
  registryId: string,
  derivationVersion = DEFAULT_DERIVATION_VERSION,
): Promise<PublicLookupResponse> {
  const [vault, payments] = await Promise.all([
    getReceivedVaultSummary(userInfo.xUserId, registryId, derivationVersion),
    getIncomingPaymentsPage(
      userInfo.xUserId,
      PUBLIC_LOOKUP_RECENT_PAYMENTS_LIMIT,
    ),
  ]);

  return {
    ...toReceivedDashboardUser(userInfo),
    ...vault,
    recentIncomingPayments: payments.items,
  };
}

export async function buildIncomingPaymentsResponse(
  userInfo: XUserInfo,
  registryId: string,
  limit: number,
  cursor: IncomingPaymentsCursor | null = null,
  derivationVersion = DEFAULT_DERIVATION_VERSION,
): Promise<IncomingPaymentsResponse> {
  const vaultPromise = cursor
    ? getCachedReceivedVaultSummary(
        userInfo.xUserId,
        registryId,
        derivationVersion,
      )
    : getReceivedVaultSummary(
        userInfo.xUserId,
        registryId,
        derivationVersion,
      ).then((value) => {
        cacheReceivedVaultSummary(
          userInfo.xUserId,
          registryId,
          derivationVersion,
          value,
        );
        return value;
      });
  const [vault, payments] = await Promise.all([
    vaultPromise,
    getIncomingPaymentsPage(userInfo.xUserId, limit, cursor),
  ]);

  return {
    ...toReceivedDashboardUser(userInfo),
    ...vault,
    items: payments.items,
    nextCursor: payments.nextCursor,
  };
}
