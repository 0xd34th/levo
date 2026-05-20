import {
  getCoinDecimals,
  getCoinLabel,
  isDisplaySupportedCoinType,
  normalizeCoinTypeForDisplay,
} from '@/lib/coins';
import { prisma } from '@/lib/prisma';
import {
  IncomingPaymentItem,
  IncomingPaymentsResponse,
  PublicLookupResponse,
  ReceivedBalance,
  ReceivedDashboardUser,
  IncomingPaymentSender,
  ReceivedRecipientSummary,
} from '@/lib/received-dashboard-types';
import { getSuiClient } from '@/lib/sui';
import { encodeTransactionHistoryCursor } from '@/lib/transaction-history-cursor';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';
import { parseXUserId, type XUserInfo } from '@/lib/twitter';
import { FRESH_X_USER_TTL_MS } from '@/lib/x-user-lookup';

const DEFAULT_DERIVATION_VERSION = 1;
const RECEIVED_SUMMARY_CACHE_TTL_MS = 30_000;
const RECEIVED_SUMMARY_CACHE_MAX_ENTRIES = 500;
const MAX_INCOMING_PAYMENT_SCAN_ITERATIONS = 10;

export const PUBLIC_LOOKUP_RECENT_PAYMENTS_LIMIT = 5;

interface IncomingPaymentsCursor {
  createdAt: string;
  id: string;
}

interface CachedReceivedRecipientSummary {
  expiresAt: number;
  value: ReceivedRecipientSummary;
}

interface IncomingPaymentRow {
  id: string;
  txDigest: string;
  senderAddress: string;
  coinType: string;
  amount: bigint;
  createdAt: Date;
}

const receivedSummaryCache = new Map<string, CachedReceivedRecipientSummary>();

async function getRecordedTotals(xUserId: string): Promise<ReceivedBalance[]> {
  const rows = await prisma.paymentLedger.groupBy({
    by: ['coinType'],
    where: { xUserId },
    _sum: { amount: true },
  });

  const totalsByDisplayCoinType = new Map<string, bigint>();

  for (const row of rows) {
    if (row._sum.amount == null || row._sum.amount <= 0n) {
      continue;
    }

    const displayCoinType = normalizeCoinTypeForDisplay(row.coinType);
    if (!isDisplaySupportedCoinType(displayCoinType)) {
      continue;
    }

    totalsByDisplayCoinType.set(
      displayCoinType,
      (totalsByDisplayCoinType.get(displayCoinType) ?? 0n) + row._sum.amount,
    );
  }

  return Array.from(totalsByDisplayCoinType.entries()).map(([coinType, amount]) => ({
    coinType,
    symbol: getCoinLabel(coinType),
    decimals: getCoinDecimals(coinType),
    amount: amount.toString(),
  }));
}

function sanitizeProfilePictureUrl(url: string | null): string | null {
  return url && isTrustedProfilePictureUrl(url) ? url : null;
}

function mapIncomingPayment(row: IncomingPaymentRow): IncomingPaymentItem | null {
  const displayCoinType = normalizeCoinTypeForDisplay(row.coinType);

  if (!isDisplaySupportedCoinType(displayCoinType)) {
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
    sender: null,
    coinType: displayCoinType,
    symbol: getCoinLabel(displayCoinType),
    decimals: getCoinDecimals(displayCoinType),
    amount: row.amount.toString(),
    createdAt: row.createdAt.toISOString(),
  };
}

async function attachIncomingPaymentSenders(
  items: IncomingPaymentItem[],
): Promise<IncomingPaymentItem[]> {
  const senderAddresses = Array.from(
    new Set(items.map((item) => item.senderAddress)),
  );

  if (senderAddresses.length === 0) {
    return items;
  }

  const senderRows = await prisma.xUser.findMany({
    where: {
      suiAddress: {
        in: senderAddresses,
      },
    },
    select: {
      suiAddress: true,
      username: true,
      profilePicture: true,
    },
  });

  const senderByAddress = new Map<string, IncomingPaymentSender>();
  for (const row of senderRows) {
    if (!row.suiAddress) {
      continue;
    }

    senderByAddress.set(row.suiAddress, {
      username: row.username,
      profilePicture: sanitizeProfilePictureUrl(row.profilePicture),
    });
  }

  return items.map((item) => ({
    ...item,
    sender: senderByAddress.get(item.senderAddress) ?? null,
  }));
}

export function toReceivedDashboardUser(userInfo: XUserInfo): ReceivedDashboardUser {
  return {
    xUserId: userInfo.xUserId,
    username: userInfo.username,
    profilePicture: sanitizeProfilePictureUrl(userInfo.profilePicture),
    isBlueVerified: userInfo.isBlueVerified,
  };
}

function pruneReceivedSummaryCache(now = Date.now()) {
  for (const [cacheKey, entry] of receivedSummaryCache) {
    if (entry.expiresAt <= now) {
      receivedSummaryCache.delete(cacheKey);
    }
  }

  while (receivedSummaryCache.size > RECEIVED_SUMMARY_CACHE_MAX_ENTRIES) {
    const oldestKey = receivedSummaryCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    receivedSummaryCache.delete(oldestKey);
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

function cacheReceivedRecipientSummary(
  xUserId: string,
  derivationVersion: number,
  value: ReceivedRecipientSummary,
) {
  const cacheKey = `${xUserId}:${derivationVersion}`;
  const now = Date.now();
  pruneReceivedSummaryCache(now);
  receivedSummaryCache.delete(cacheKey);
  receivedSummaryCache.set(cacheKey, {
    expiresAt: now + RECEIVED_SUMMARY_CACHE_TTL_MS,
    value,
  });
}

async function getCachedReceivedRecipientSummary(
  xUserId: string,
  derivationVersion: number,
): Promise<ReceivedRecipientSummary> {
  const cacheKey = `${xUserId}:${derivationVersion}`;
  const cached = receivedSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    receivedSummaryCache.delete(cacheKey);
    receivedSummaryCache.set(cacheKey, cached);
    return cached.value;
  }

  receivedSummaryCache.delete(cacheKey);

  const value = await getReceivedRecipientSummary(
    xUserId,
    derivationVersion,
  );
  cacheReceivedRecipientSummary(xUserId, derivationVersion, value);
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

export async function getReceivedRecipientSummary(
  xUserId: string,
  derivationVersion = DEFAULT_DERIVATION_VERSION,
): Promise<ReceivedRecipientSummary> {
  const normalizedXUserId = parseXUserId(xUserId);
  if (!normalizedXUserId) {
    throw new Error('Invalid X user id');
  }

  const [xUser, recordedTotals] = await Promise.all([
    prisma.xUser.findUnique({
      where: { xUserId: normalizedXUserId },
      select: {
        suiAddress: true,
      },
    }),
    getRecordedTotals(normalizedXUserId),
  ]);

  const recipientAddress = xUser?.suiAddress ?? null;
  if (!recipientAddress) {
    return {
      derivationVersion,
      recipientAddress: null,
      walletReady: false,
      pendingBalances: [],
      recordedTotals,
    };
  }

  const balances = await getSuiClient().getAllBalances({ owner: recipientAddress });
  const pendingBalances = balances
    .filter((balance) => BigInt(balance.totalBalance) > 0n)
    .map((balance) => ({
      ...balance,
      displayCoinType: normalizeCoinTypeForDisplay(balance.coinType),
    }))
    .filter((balance) => {
      if (isDisplaySupportedCoinType(balance.displayCoinType)) {
        return true;
      }

      console.warn('Ignoring unsupported coin type in received dashboard balance', {
        coinType: balance.coinType,
        recipientAddress,
      });
      return false;
    })
    .sort((a, b) => a.displayCoinType.localeCompare(b.displayCoinType))
    .map((balance) => ({
      coinType: balance.displayCoinType,
      symbol: getCoinLabel(balance.displayCoinType),
      decimals: getCoinDecimals(balance.displayCoinType),
      amount: balance.totalBalance,
    }));

  return {
    derivationVersion,
    recipientAddress,
    walletReady: true,
    pendingBalances,
    recordedTotals,
  };
}

export async function getIncomingPaymentsPage(
  xUserId: string,
  limit: number,
  cursor: IncomingPaymentsCursor | null = null,
  includeSenders = true,
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
    items: includeSenders ? await attachIncomingPaymentSenders(items) : items,
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
  derivationVersion = DEFAULT_DERIVATION_VERSION,
): Promise<PublicLookupResponse> {
  const [recipient, payments] = await Promise.all([
    getReceivedRecipientSummary(userInfo.xUserId, derivationVersion),
    getIncomingPaymentsPage(
      userInfo.xUserId,
      PUBLIC_LOOKUP_RECENT_PAYMENTS_LIMIT,
      null,
      false,
    ),
  ]);

  return {
    ...toReceivedDashboardUser(userInfo),
    ...recipient,
    recentIncomingPayments: payments.items,
  };
}

export async function buildIncomingPaymentsResponse(
  userInfo: XUserInfo,
  limit: number,
  cursor: IncomingPaymentsCursor | null = null,
  derivationVersion = DEFAULT_DERIVATION_VERSION,
): Promise<IncomingPaymentsResponse> {
  const recipientPromise = cursor
    ? getCachedReceivedRecipientSummary(
        userInfo.xUserId,
        derivationVersion,
      )
    : getReceivedRecipientSummary(
        userInfo.xUserId,
        derivationVersion,
      ).then((value) => {
        cacheReceivedRecipientSummary(
          userInfo.xUserId,
          derivationVersion,
          value,
        );
        return value;
      });

  const [recipient, payments] = await Promise.all([
    recipientPromise,
    getIncomingPaymentsPage(userInfo.xUserId, limit, cursor),
  ]);

  return {
    ...toReceivedDashboardUser(userInfo),
    ...recipient,
    items: payments.items,
    nextCursor: payments.nextCursor,
  };
}
