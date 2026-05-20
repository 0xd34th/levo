import { Transaction, type TransactionArgument } from '@mysten/sui/transactions';
import { StableLayerClient } from 'stable-layer-sdk';

type StableLayerInternals = {
  bucketClient: {
    treasury: (tx: unknown) => unknown;
    aggregatePrices: (
      tx: unknown,
      params: { coinTypes: string[] },
    ) => Promise<[TransactionArgument, ...TransactionArgument[]]>;
    checkWithdrawResponse: (
      tx: unknown,
      params: { lpType: string; withdrawResponse: unknown },
    ) => Promise<void> | void;
  };
  getBucketPSMPool: (tx: unknown) => Promise<TransactionArgument>;
  getBucketSavingPool: (tx: unknown) => Promise<TransactionArgument>;
  releaseRewards: (tx: unknown) => Promise<void>;
};

const MAINNET_NETWORK = 'mainnet' as const;
const MAX_STABLE_LAYER_CLIENTS = 200;
const STABLE_LAYER_CLIENT_TTL_MS = 5 * 60_000;
const SUPPORTED_STABLE_LAYER_SDK_VERSION = '3.1.0';

interface CachedStableLayerClient {
  client: Promise<StableLayerClient>;
  expiresAt: number;
}

const stableLayerClients = new Map<string, CachedStableLayerClient>();

function pruneStableLayerClients(now = Date.now()) {
  for (const [cacheKey, entry] of stableLayerClients) {
    if (entry.expiresAt <= now) {
      stableLayerClients.delete(cacheKey);
    }
  }

  while (stableLayerClients.size > MAX_STABLE_LAYER_CLIENTS) {
    const oldestKey = stableLayerClients.keys().next().value;
    if (!oldestKey) {
      break;
    }
    stableLayerClients.delete(oldestKey);
  }
}

function assertStableLayerInternals(client: StableLayerClient): StableLayerInternals {
  const maybeInternals = client as unknown as Partial<StableLayerInternals>;
  const bucketClient = maybeInternals.bucketClient;

  if (
    !bucketClient ||
    typeof bucketClient.treasury !== 'function' ||
    typeof bucketClient.aggregatePrices !== 'function' ||
    typeof bucketClient.checkWithdrawResponse !== 'function' ||
    typeof maybeInternals.getBucketPSMPool !== 'function' ||
    typeof maybeInternals.getBucketSavingPool !== 'function' ||
    typeof maybeInternals.releaseRewards !== 'function'
  ) {
    throw new Error(
      `stable-layer-sdk internals changed; apps/web/lib/stable-layer.ts currently supports ${SUPPORTED_STABLE_LAYER_SDK_VERSION}`,
    );
  }

  return maybeInternals as StableLayerInternals;
}

export function getStableLayerConstants() {
  return StableLayerClient.getConstants(MAINNET_NETWORK);
}

export function isMainnetStableLayerConfigReady() {
  return Boolean(process.env.LEVO_USD_COIN_TYPE?.trim());
}

export async function getStableLayerClient(senderAddress: string) {
  const cacheKey = senderAddress.trim().toLowerCase();
  const now = Date.now();
  pruneStableLayerClients(now);

  const existingClient = stableLayerClients.get(cacheKey);
  if (existingClient && existingClient.expiresAt > now) {
    stableLayerClients.delete(cacheKey);
    stableLayerClients.set(cacheKey, existingClient);
    return existingClient.client;
  }

  const clientPromise = StableLayerClient.initialize({
    network: MAINNET_NETWORK,
    sender: senderAddress,
    ...(process.env.SUI_RPC_URL?.trim()
      ? { baseUrl: process.env.SUI_RPC_URL.trim() }
      : {}),
  });

  stableLayerClients.set(cacheKey, {
    client: clientPromise,
    expiresAt: now + STABLE_LAYER_CLIENT_TTL_MS,
  });
  pruneStableLayerClients(now);

  void clientPromise.catch(() => {
    const cachedEntry = stableLayerClients.get(cacheKey);
    if (cachedEntry?.client === clientPromise) {
      stableLayerClients.delete(cacheKey);
    }
  });

  return clientPromise;
}

export async function buildMintIntoVaultTx(params: {
  tx: Transaction;
  senderAddress: string;
  stableCoinType: string;
  usdcCoin: TransactionArgument;
  amount: bigint;
  vaultAddress: string;
}) {
  const { tx, senderAddress, stableCoinType, usdcCoin, amount, vaultAddress } = params;
  const client = await getStableLayerClient(senderAddress);
  const stableCoin = await client.buildMintTx({
    tx,
    stableCoinType,
    usdcCoin,
    amount,
    sender: senderAddress,
    autoTransfer: false,
  });

  if (!stableCoin) {
    throw new Error('StableLayer mint did not return a stable coin result');
  }

  tx.transferObjects([stableCoin], vaultAddress);
}

export async function buildBurnFromStableCoinTx(params: {
  tx: Transaction;
  senderAddress: string;
  stableCoinType: string;
  stableCoin: TransactionArgument;
}) {
  const { tx, senderAddress, stableCoinType, stableCoin } = params;
  const client = await getStableLayerClient(senderAddress);
  const internals = assertStableLayerInternals(client);
  const constants = getStableLayerConstants();

  await internals.releaseRewards(tx);

  const burnRequest = tx.moveCall({
    target: `${constants.STABLE_LAYER_PACKAGE_ID}::stable_layer::request_burn`,
    typeArguments: [stableCoinType, constants.USDC_TYPE],
    arguments: [
      tx.object(constants.STABLE_REGISTRY),
      stableCoin,
    ],
  });

  const [uPrice] = await internals.bucketClient.aggregatePrices(tx, {
    coinTypes: [constants.USDC_TYPE],
  });

  const withdrawResponse = tx.moveCall({
    target: `${constants.STABLE_VAULT_FARM_PACKAGE_ID}::stable_vault_farm::pay`,
    typeArguments: [
      constants.STABLE_LP_TYPE,
      constants.USDC_TYPE,
      stableCoinType,
      constants.YUSDB_TYPE,
      constants.SAVING_TYPE,
    ],
    arguments: [
      tx.object(constants.STABLE_VAULT_FARM),
      burnRequest,
      tx.object(constants.STABLE_VAULT),
      await Promise.resolve(internals.bucketClient.treasury(tx)) as TransactionArgument,
      await internals.getBucketPSMPool(tx),
      await internals.getBucketSavingPool(tx),
      tx.object(constants.YIELD_VAULT),
      uPrice,
      tx.object('0x6'),
    ],
  });

  await Promise.resolve(
    internals.bucketClient.checkWithdrawResponse(tx, {
      lpType: constants.SAVING_TYPE,
      withdrawResponse,
    }),
  );

  return tx.moveCall({
    target: `${constants.STABLE_LAYER_PACKAGE_ID}::stable_layer::fulfill_burn`,
    typeArguments: [stableCoinType, constants.USDC_TYPE],
    arguments: [
      tx.object(constants.STABLE_REGISTRY),
      burnRequest,
    ],
  });
}
