import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
  formatAmount,
  getCoinLabel,
  isDisplaySupportedCoinType,
  normalizeCoinType,
  normalizeCoinTypeForDisplay,
  SUI_COIN_TYPE,
} from '@/lib/coins';
import { truncateAddress } from '@/lib/received-dashboard-client';
import { getSuiClient } from '@/lib/sui';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';

const MAX_CURSOR_SEEN_DIGESTS = 200;

export type WalletActivityDirection = 'incoming' | 'outgoing' | 'mixed';
export type WalletActivitySource = 'from' | 'to';

export interface WalletActivityItem {
  id: string;
  txDigest: string;
  createdAt: string;
  direction: WalletActivityDirection;
  coinType: string;
  amount: string;
  amountLabel: string;
  counterpartyLabel: string;
  counterpartySubLabel: string;
  counterpartyAvatarUrl: string | null;
  unsupportedCoin?: boolean;
}

export interface WalletActivityResponse {
  items: WalletActivityItem[];
  nextCursor: string | null;
}

export interface WalletActivityCursor {
  from: string | null;
  to: string | null;
  seenDigests: string[];
}

export interface WalletActivityTransaction {
  digest?: unknown;
  timestampMs?: unknown;
  transaction?: {
    data?: {
      sender?: unknown;
    };
  };
  effects?: {
    status?: {
      status?: unknown;
    };
  };
  balanceChanges?: Array<{
    owner?: unknown;
    coinType?: unknown;
    amount?: unknown;
  }>;
}

export interface WalletActivitySourcePage {
  source: WalletActivitySource;
  data: WalletActivityTransaction[];
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface WalletActivityLedgerRow {
  txDigest: string;
  senderAddress: string;
  recipientType: 'X_HANDLE' | 'SUI_ADDRESS';
  vaultAddress: string;
  xUser: {
    username: string;
    profilePicture: string | null;
  } | null;
}

interface FetchWalletActivityInput {
  address: string;
  cursor: WalletActivityCursor | null;
  limit: number;
}

interface SourceEntry {
  source: WalletActivitySource;
  tx: WalletActivityTransaction;
  digest: string;
  timestampMs: number;
}

interface AddressBalanceChange {
  ownerAddress: string;
  counterpartyAddress: string | null;
  rawCoinType: string;
  coinType: string;
  amount: bigint;
  supported: boolean;
}

export function encodeWalletActivityCursor(cursor: WalletActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function isWalletActivityCursor(value: unknown): value is WalletActivityCursor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const cursor = value as Partial<WalletActivityCursor>;
  return (
    (typeof cursor.from === 'string' || cursor.from === null) &&
    (typeof cursor.to === 'string' || cursor.to === null) &&
    Array.isArray(cursor.seenDigests) &&
    cursor.seenDigests.every((digest) => typeof digest === 'string' && digest.length > 0)
  );
}

export function decodeWalletActivityCursor(cursor: string): WalletActivityCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (!isWalletActivityCursor(decoded)) {
      return null;
    }

    return {
      from: decoded.from,
      to: decoded.to,
      seenDigests: decoded.seenDigests.slice(-MAX_CURSOR_SEEN_DIGESTS),
    };
  } catch {
    return null;
  }
}

function ownerAddress(owner: unknown): string | null {
  if (typeof owner !== 'object' || owner === null) {
    return null;
  }

  const address = (owner as { AddressOwner?: unknown }).AddressOwner;
  if (typeof address !== 'string') {
    return null;
  }

  try {
    return normalizeSuiAddress(address);
  } catch {
    return null;
  }
}

function normalizeAddress(address: string): string {
  return normalizeSuiAddress(address);
}

function timestampMs(tx: WalletActivityTransaction): number {
  const value = Number(tx.timestampMs);
  return Number.isFinite(value) ? value : 0;
}

function transactionSender(tx: WalletActivityTransaction): string | null {
  const sender = tx.transaction?.data?.sender;
  if (typeof sender !== 'string') {
    return null;
  }

  try {
    return normalizeSuiAddress(sender);
  } catch {
    return null;
  }
}

function collectAddressChanges(
  tx: WalletActivityTransaction,
  address: string,
): AddressBalanceChange[] {
  const targetAddress = normalizeAddress(address);
  const changes = Array.isArray(tx.balanceChanges) ? tx.balanceChanges : [];

  return changes.flatMap((change) => {
    const owner = ownerAddress(change.owner);
    if (owner !== targetAddress || typeof change.coinType !== 'string') {
      return [];
    }

    let amount: bigint;
    try {
      amount = BigInt(String(change.amount));
    } catch {
      return [];
    }

    if (amount === 0n) {
      return [];
    }

    const rawCoinType = normalizeCoinType(change.coinType);
    const coinType = normalizeCoinType(normalizeCoinTypeForDisplay(rawCoinType));
    return [{
      ownerAddress: owner,
      counterpartyAddress: findCounterpartyForChange(changes, owner, rawCoinType, amount),
      rawCoinType,
      coinType,
      amount,
      supported: isDisplaySupportedCoinType(coinType),
    }];
  });
}

function findCounterpartyForChange(
  changes: WalletActivityTransaction['balanceChanges'],
  owner: string,
  rawCoinType: string,
  amount: bigint,
): string | null {
  const oppositeSign = amount > 0n ? -1 : 1;
  for (const change of changes ?? []) {
    const candidateOwner = ownerAddress(change.owner);
    if (!candidateOwner || candidateOwner === owner || typeof change.coinType !== 'string') {
      continue;
    }

    if (normalizeCoinType(change.coinType) !== rawCoinType) {
      continue;
    }

    try {
      const candidateAmount = BigInt(String(change.amount));
      if ((candidateAmount > 0n ? 1 : -1) === oppositeSign) {
        return candidateOwner;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function classifyDirection(changes: AddressBalanceChange[]): WalletActivityDirection {
  const hasIncoming = changes.some((change) => change.amount > 0n);
  const hasOutgoing = changes.some((change) => change.amount < 0n);
  if (hasIncoming && hasOutgoing) return 'mixed';
  if (hasIncoming) return 'incoming';
  return 'outgoing';
}

function isSuiChange(change: AddressBalanceChange): boolean {
  return normalizeCoinType(change.coinType) === normalizeCoinType(SUI_COIN_TYPE);
}

function pickPrimaryChange(
  changes: AddressBalanceChange[],
  direction: WalletActivityDirection,
): AddressBalanceChange {
  const signFiltered = direction === 'incoming'
    ? changes.filter((change) => change.amount > 0n)
    : direction === 'outgoing'
      ? changes.filter((change) => change.amount < 0n)
      : changes;
  const candidates = signFiltered.length > 0 ? signFiltered : changes;
  const nonSui = candidates.filter((change) => !isSuiChange(change));
  const preferred = nonSui.length > 0 ? nonSui : candidates;

  return [...preferred].sort((left, right) => {
    const leftAbs = absolute(left.amount);
    const rightAbs = absolute(right.amount);
    if (leftAbs === rightAbs) return 0;
    return leftAbs > rightAbs ? -1 : 1;
  })[0]!;
}

function formatActivityAmount(
  changes: AddressBalanceChange[],
  primary: AddressBalanceChange,
  direction: WalletActivityDirection,
) {
  if (direction === 'mixed') {
    const supportedCoinLabels = new Set(
      changes
        .filter((change) => change.supported && !isSuiChange(change))
        .map((change) => getCoinLabel(change.coinType)),
    );
    if (supportedCoinLabels.size === 1) {
      return {
        amount: '0',
        amountLabel: `Mixed ${Array.from(supportedCoinLabels)[0]}`,
        unsupportedCoin: false,
      };
    }

    return {
      amount: '0',
      amountLabel: 'Mixed activity',
      unsupportedCoin: !primary.supported,
    };
  }

  const amount = absolute(primary.amount).toString();
  if (!primary.supported) {
    return {
      amount,
      amountLabel: `${amount} raw`,
      unsupportedCoin: true,
    };
  }

  return {
    amount,
    amountLabel: `${formatAmount(amount, primary.coinType)} ${getCoinLabel(primary.coinType)}`,
    unsupportedCoin: false,
  };
}

function counterpartyFromLedger(
  row: WalletActivityLedgerRow | undefined,
  address: string,
): Pick<WalletActivityItem, 'counterpartyLabel' | 'counterpartySubLabel' | 'counterpartyAvatarUrl'> | null {
  if (!row) {
    return null;
  }

  const targetAddress = normalizeAddress(address);
  const ledgerSender = normalizeAddress(row.senderAddress);
  if (ledgerSender === targetAddress) {
    if (row.recipientType === 'X_HANDLE' && row.xUser) {
      return {
        counterpartyLabel: `@${row.xUser.username}`,
        counterpartySubLabel: 'X recipient',
        counterpartyAvatarUrl:
          row.xUser.profilePicture && isTrustedProfilePictureUrl(row.xUser.profilePicture)
            ? row.xUser.profilePicture
            : null,
      };
    }

    return {
      counterpartyLabel: truncateAddress(row.vaultAddress),
      counterpartySubLabel: row.recipientType === 'SUI_ADDRESS' ? 'Sui address' : 'Recipient wallet',
      counterpartyAvatarUrl: null,
    };
  }

  return {
    counterpartyLabel: truncateAddress(row.senderAddress),
    counterpartySubLabel: 'Sender wallet',
    counterpartyAvatarUrl: null,
  };
}

function inferredCounterparty(
  tx: WalletActivityTransaction,
  changes: AddressBalanceChange[],
  primary: AddressBalanceChange,
  direction: WalletActivityDirection,
): Pick<WalletActivityItem, 'counterpartyLabel' | 'counterpartySubLabel' | 'counterpartyAvatarUrl'> {
  if (direction === 'mixed') {
    return {
      counterpartyLabel: 'Self / contract',
      counterpartySubLabel: 'Wallet activity',
      counterpartyAvatarUrl: null,
    };
  }

  const counterpartyAddress =
    primary.counterpartyAddress ??
    changes.find((change) => change.counterpartyAddress)?.counterpartyAddress ??
    transactionSender(tx);

  if (counterpartyAddress) {
    return {
      counterpartyLabel: truncateAddress(counterpartyAddress),
      counterpartySubLabel: direction === 'incoming' ? 'Sender wallet' : 'Recipient wallet',
      counterpartyAvatarUrl: null,
    };
  }

  return {
    counterpartyLabel: 'Sui transaction',
    counterpartySubLabel: 'Wallet activity',
    counterpartyAvatarUrl: null,
  };
}

function txToActivityItem(
  tx: WalletActivityTransaction,
  address: string,
  ledgerRowsByDigest: Map<string, WalletActivityLedgerRow>,
): WalletActivityItem | null {
  if (typeof tx.digest !== 'string' || !tx.digest) {
    return null;
  }

  const changes = collectAddressChanges(tx, address);
  if (changes.length === 0) {
    return null;
  }

  const direction = classifyDirection(changes);
  const primary = pickPrimaryChange(changes, direction);
  const amount = formatActivityAmount(changes, primary, direction);
  const ledgerCounterparty = counterpartyFromLedger(ledgerRowsByDigest.get(tx.digest), address);
  const counterparty = ledgerCounterparty ?? inferredCounterparty(tx, changes, primary, direction);

  return {
    id: tx.digest,
    txDigest: tx.digest,
    createdAt: new Date(timestampMs(tx)).toISOString(),
    direction,
    coinType: primary.coinType,
    amount: amount.amount,
    amountLabel: amount.amountLabel,
    counterpartyLabel: counterparty.counterpartyLabel,
    counterpartySubLabel: counterparty.counterpartySubLabel,
    counterpartyAvatarUrl: counterparty.counterpartyAvatarUrl,
    ...(amount.unsupportedCoin ? { unsupportedCoin: true } : {}),
  };
}

export function buildWalletActivityPage({
  address,
  limit,
  fromPage,
  toPage,
  ledgerRows,
  cursor = null,
}: {
  address: string;
  limit: number;
  fromPage: WalletActivitySourcePage;
  toPage: WalletActivitySourcePage;
  ledgerRows: WalletActivityLedgerRow[];
  cursor?: WalletActivityCursor | null;
}): WalletActivityResponse {
  const ledgerRowsByDigest = new Map(ledgerRows.map((row) => [row.txDigest, row]));
  const previousSeen = new Set(cursor?.seenDigests ?? []);
  const nextSeen = [...previousSeen];
  const pageSeen = new Set<string>();
  const consumed: Record<WalletActivitySource, string | null> = {
    from: cursor?.from ?? null,
    to: cursor?.to ?? null,
  };
  const entries: SourceEntry[] = [fromPage, toPage].flatMap((page) =>
    page.data.flatMap((tx) => {
      if (typeof tx.digest !== 'string' || !tx.digest) {
        return [];
      }
      return [{ source: page.source, tx, digest: tx.digest, timestampMs: timestampMs(tx) }];
    }),
  );
  entries.sort((left, right) => {
    if (right.timestampMs !== left.timestampMs) {
      return right.timestampMs - left.timestampMs;
    }
    return right.digest.localeCompare(left.digest);
  });

  const items: WalletActivityItem[] = [];
  let hasUnconsumed = false;

  for (const entry of entries) {
    if (previousSeen.has(entry.digest) || pageSeen.has(entry.digest)) {
      consumed[entry.source] = entry.digest;
      continue;
    }

    if (items.length >= limit) {
      hasUnconsumed = true;
      break;
    }

    const item = txToActivityItem(entry.tx, address, ledgerRowsByDigest);
    consumed[entry.source] = entry.digest;
    if (!item) {
      continue;
    }

    items.push(item);
    pageSeen.add(entry.digest);
    nextSeen.push(entry.digest);
  }

  const sourceHasMore = fromPage.hasNextPage || toPage.hasNextPage;
  const needsCursor = hasUnconsumed || sourceHasMore;
  const nextCursor = needsCursor
    ? encodeWalletActivityCursor({
        from: consumed.from,
        to: consumed.to,
        seenDigests: nextSeen.slice(-MAX_CURSOR_SEEN_DIGESTS),
      })
    : null;

  return { items, nextCursor };
}

async function queryActivitySource(
  source: WalletActivitySource,
  address: string,
  cursor: string | null,
  limit: number,
): Promise<WalletActivitySourcePage> {
  const client = getSuiClient() as unknown as {
    queryTransactionBlocks: (input: {
      filter: { FromAddress: string } | { ToAddress: string };
      cursor?: string | null;
      limit: number;
      order: 'ascending' | 'descending';
      options: {
        showBalanceChanges: boolean;
        showEffects: boolean;
        showInput: boolean;
      };
    }) => Promise<{
      data: WalletActivityTransaction[];
      hasNextPage: boolean;
      nextCursor?: string | null;
    }>;
  };

  const result = await client.queryTransactionBlocks({
    filter: source === 'from' ? { FromAddress: address } : { ToAddress: address },
    cursor,
    limit,
    order: 'descending',
    options: {
      showBalanceChanges: true,
      showEffects: true,
      showInput: true,
    },
  });

  return {
    source,
    data: result.data ?? [],
    hasNextPage: Boolean(result.hasNextPage),
    nextCursor: result.nextCursor ?? null,
  };
}

async function findLedgerRowsForDigests(digests: string[]): Promise<WalletActivityLedgerRow[]> {
  if (digests.length === 0) {
    return [];
  }

  const { prisma } = await import('@/lib/prisma');
  return prisma.paymentLedger.findMany({
    where: { txDigest: { in: digests } },
    select: {
      txDigest: true,
      senderAddress: true,
      recipientType: true,
      vaultAddress: true,
      xUser: {
        select: {
          username: true,
          profilePicture: true,
        },
      },
    },
  });
}

export async function fetchWalletActivity({
  address,
  cursor,
  limit,
}: FetchWalletActivityInput): Promise<WalletActivityResponse> {
  const queryLimit = Math.min(50, Math.max(limit + 1, limit * 2));
  const [fromPage, toPage] = await Promise.all([
    queryActivitySource('from', address, cursor?.from ?? null, queryLimit),
    queryActivitySource('to', address, cursor?.to ?? null, queryLimit),
  ]);
  const digests = Array.from(
    new Set([...fromPage.data, ...toPage.data].flatMap((tx) => (typeof tx.digest === 'string' ? [tx.digest] : []))),
  );
  const ledgerRows = await findLedgerRowsForDigests(digests);

  return buildWalletActivityPage({
    address,
    limit,
    fromPage,
    toPage,
    ledgerRows,
    cursor,
  });
}
