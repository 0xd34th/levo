import { Transaction } from '@mysten/sui/transactions';
import type { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { getSuiClient } from './sui';

const MIST_PER_SUI = 1_000_000_000n;
const SUI_COIN_TYPE = '0x2::sui::SUI';

export const GAS_STATION_STATUS_COMMAND = 'pnpm --dir apps/web gas-station:status';
export const GAS_STATION_MERGE_COMMAND = 'pnpm --dir apps/web gas-station:merge';
export const DEFAULT_MIN_TOTAL_BALANCE_MIST = 200_000_000n;
export const DEFAULT_MAX_COIN_COUNT = 32;

export interface GasStationCoin {
  coinObjectId: string;
  balance: bigint;
  digest: string;
  version: string;
}

export interface GasStationHealthSummary {
  address: string;
  coinCount: number;
  totalBalance: bigint;
  largestCoinBalance: bigint;
  smallestCoinBalance: bigint;
  warnings: string[];
}

interface CoinPageResponse {
  data: Array<{
    coinObjectId: string;
    balance: string;
    digest: string;
    version: string | number;
  }>;
  hasNextPage?: boolean | null;
  nextCursor?: string | null;
}

interface GasStationReadClient {
  getCoins(params: {
    owner: string;
    coinType: string;
    cursor?: string | null;
  }): Promise<CoinPageResponse>;
}

interface GasStationExecuteClient extends GasStationReadClient {
  executeTransactionBlock(params: {
    transactionBlock: Uint8Array;
    signature: string;
    options?: {
      showEffects?: boolean;
    };
  }): Promise<{
    digest?: string | null;
  }>;
}

function formatMistAsSui(amount: bigint): string {
  const whole = amount / MIST_PER_SUI;
  const fractional = ((amount % MIST_PER_SUI) * 10_000n) / MIST_PER_SUI;
  return `${whole}.${fractional.toString().padStart(4, '0')}`;
}

function pluralizeCoins(count: number) {
  return count === 1 ? 'coin' : 'coins';
}

export function buildGasStationRecoveryHint(address: string | null): string {
  const addressMessage = address
    ? `Gas station address: ${address}.`
    : 'Gas station address: unavailable.';

  return `${addressMessage} Check sponsor SUI balance/fragmentation with "${GAS_STATION_STATUS_COMMAND}"; if needed, merge coins with "${GAS_STATION_MERGE_COMMAND}".`;
}

export async function listGasStationSuiCoins(
  address: string,
  client: GasStationReadClient = getSuiClient(),
): Promise<GasStationCoin[]> {
  const coins: GasStationCoin[] = [];
  let cursor: string | null | undefined = null;

  do {
    const page = await client.getCoins({
      owner: address,
      coinType: SUI_COIN_TYPE,
      ...(cursor ? { cursor } : {}),
    });

    coins.push(...page.data.map((coin) => ({
      coinObjectId: coin.coinObjectId,
      balance: BigInt(coin.balance),
      digest: coin.digest,
      version: String(coin.version),
    })));

    cursor = page.hasNextPage ? page.nextCursor ?? null : null;
  } while (cursor);

  return coins;
}

export function summarizeGasStationCoins(params: {
  address: string;
  coins: GasStationCoin[];
  minTotalBalanceMist?: bigint;
  maxCoinCount?: number;
}): GasStationHealthSummary {
  const {
    address,
    coins,
    minTotalBalanceMist = DEFAULT_MIN_TOTAL_BALANCE_MIST,
    maxCoinCount = DEFAULT_MAX_COIN_COUNT,
  } = params;

  const balances = coins.map((coin) => coin.balance);
  const totalBalance = balances.reduce((sum, balance) => sum + balance, 0n);
  const largestCoinBalance = balances.reduce((max, balance) => (balance > max ? balance : max), 0n);
  const smallestCoinBalance = balances.reduce((min, balance) => (balance < min ? balance : min), largestCoinBalance);
  const warnings: string[] = [];

  if (coins.length === 0) {
    warnings.push('No sponsor SUI coins are available. Refill the gas station before retrying sponsored sends.');
  }

  if (totalBalance < minTotalBalanceMist) {
    warnings.push(
      `Total sponsor balance is below the recommended threshold of ${formatMistAsSui(minTotalBalanceMist)} SUI.`,
    );
  }

  if (coins.length > maxCoinCount) {
    warnings.push(
      `Coin fragmentation is high (${coins.length} SUI coins). Consider merging them during a quiet period.`,
    );
  }

  return {
    address,
    coinCount: coins.length,
    totalBalance,
    largestCoinBalance,
    smallestCoinBalance,
    warnings,
  };
}

export async function getGasStationHealthSummary(
  address: string,
  client: GasStationReadClient = getSuiClient(),
): Promise<GasStationHealthSummary> {
  const coins = await listGasStationSuiCoins(address, client);
  return summarizeGasStationCoins({ address, coins });
}

export function formatGasStationHealthSummary(summary: GasStationHealthSummary): string[] {
  const lines = [
    `Address: ${summary.address}`,
    `Total SUI: ${formatMistAsSui(summary.totalBalance)} (${summary.coinCount} ${pluralizeCoins(summary.coinCount)}; largest ${formatMistAsSui(summary.largestCoinBalance)}, smallest ${formatMistAsSui(summary.smallestCoinBalance)})`,
  ];

  for (const warning of summary.warnings) {
    lines.push(`Warning: ${warning}`);
  }

  lines.push(
    `Commands: ${GAS_STATION_STATUS_COMMAND} | ${GAS_STATION_MERGE_COMMAND}`,
  );

  return lines;
}

export async function mergeGasStationCoins(params: {
  address: string;
  coins: GasStationCoin[];
  client: GasStationExecuteClient;
  keypair: Pick<Ed25519Keypair, 'signTransaction'>;
}) {
  const { address, client, keypair } = params;
  const sortedCoins = [...params.coins].sort((left, right) =>
    right.balance === left.balance
      ? left.coinObjectId.localeCompare(right.coinObjectId)
      : right.balance > left.balance ? 1 : -1,
  );

  if (sortedCoins.length < 2) {
    throw new Error('Need at least two SUI coins to merge.');
  }

  const [primaryCoin, ...coinsToMerge] = sortedCoins;
  const tx = new Transaction();
  tx.setSender(address);
  tx.setGasOwner(address);
  tx.setGasPayment([
    {
      objectId: primaryCoin.coinObjectId,
      digest: primaryCoin.digest,
      version: primaryCoin.version,
    },
  ]);
  tx.mergeCoins(
    tx.gas,
    coinsToMerge.map((coin) => tx.object(coin.coinObjectId)),
  );

  const txBytes = await tx.build({ client: client as never });
  const { signature } = await keypair.signTransaction(txBytes);
  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature,
    options: {
      showEffects: true,
    },
  });

  if (!result.digest) {
    throw new Error('Gas station merge did not return a transaction digest.');
  }

  return {
    primaryCoinObjectId: primaryCoin.coinObjectId,
    mergedCount: coinsToMerge.length,
    txDigest: result.digest,
  };
}
