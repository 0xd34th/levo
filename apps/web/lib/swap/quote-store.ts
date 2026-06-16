import { randomUUID } from 'crypto';
import BN from 'bn.js';
import { getRedis } from '@/lib/rate-limit';

export interface StoredSwapQuote {
  senderAddress: string;
  coinTypeIn: string;
  coinTypeOut: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  slippageBps: number;
  provider: string;
  quote: unknown;
}

export interface StoredSwapAuthorization {
  txBytesBase64: string;
  walletId: string;
  storedPublicKey: string;
}

const swapQuoteMemory = new Map<string, { expiresAtMs: number; payload: StoredSwapQuote }>();
const swapAuthorizationMemory = new Map<string, { expiresAtMs: number; payload: StoredSwapAuthorization }>();
const JSON_MAP_MARKER = '__levoJsonMap';
const JSON_BN_MARKER = '__levoJsonBn';
const JSON_BIGINT_MARKER = '__levoJsonBigInt';

function swapQuoteKey(token: string) {
  return `swap-quote:${token}`;
}

function swapAuthorizationKey(token: string) {
  return `swap-auth:${token}`;
}

function cleanupExpiredMemory() {
  const now = Date.now();
  for (const [key, value] of swapQuoteMemory) {
    if (value.expiresAtMs <= now) swapQuoteMemory.delete(key);
  }
  for (const [key, value] of swapAuthorizationMemory) {
    if (value.expiresAtMs <= now) swapAuthorizationMemory.delete(key);
  }
}

function isBnValue(value: unknown): value is BN {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { constructor?: { isBN?: (candidate: unknown) => boolean } }).constructor?.isBN === 'function' &&
    (value as { constructor: { isBN: (candidate: unknown) => boolean } }).constructor.isBN(value)
  );
}

function encodeJsonValue(value: unknown): unknown {
  if (isBnValue(value)) {
    return {
      [JSON_BN_MARKER]: true,
      value: value.toString(10),
    };
  }
  if (typeof value === 'bigint') {
    return {
      [JSON_BIGINT_MARKER]: true,
      value: value.toString(10),
    };
  }
  if (value instanceof Map) {
    return {
      [JSON_MAP_MARKER]: true,
      entries: Array.from(value.entries(), ([key, entry]) => [
        encodeJsonValue(key),
        encodeJsonValue(entry),
      ]),
    };
  }
  if (Array.isArray(value)) {
    return value.map((entry) => encodeJsonValue(entry));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encodeJsonValue(entry)]),
    );
  }
  return value;
}

function serializeJson(value: unknown): string {
  return JSON.stringify(encodeJsonValue(value));
}

function deserializeJson<T>(raw: string): T {
  return JSON.parse(raw, (_key, entry) => {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>)[JSON_MAP_MARKER] === true &&
      Array.isArray((entry as Record<string, unknown>).entries)
    ) {
      return new Map((entry as { entries: Array<[unknown, unknown]> }).entries);
    }
    if (
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>)[JSON_BIGINT_MARKER] === true &&
      typeof (entry as Record<string, unknown>).value === 'string'
    ) {
      return BigInt((entry as { value: string }).value);
    }
    if (
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>)[JSON_BN_MARKER] === true &&
      typeof (entry as Record<string, unknown>).value === 'string'
    ) {
      return new BN((entry as { value: string }).value, 10);
    }
    return entry;
  }) as T;
}

export async function stageSwapQuote(payload: StoredSwapQuote, ttlSec: number) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  const redis = getRedis();

  if (redis.status === 'ready') {
    await redis.set(swapQuoteKey(token), serializeJson(payload), 'EX', ttlSec);
  } else {
    cleanupExpiredMemory();
    swapQuoteMemory.set(token, { expiresAtMs: expiresAt.getTime(), payload });
  }

  return { token, expiresAt };
}

export async function loadSwapQuote(token: string): Promise<StoredSwapQuote | null> {
  const redis = getRedis();
  if (redis.status === 'ready') {
    const raw = await redis.get(swapQuoteKey(token));
    if (!raw) return null;
    try {
      return deserializeJson<StoredSwapQuote>(raw);
    } catch {
      return null;
    }
  }

  cleanupExpiredMemory();
  return swapQuoteMemory.get(token)?.payload ?? null;
}

export async function stageSwapAuthorization(
  token: string,
  txBytes: Uint8Array,
  walletId: string,
  storedPublicKey: string,
  ttlSec: number,
) {
  const payload: StoredSwapAuthorization = {
    txBytesBase64: Buffer.from(txBytes).toString('base64'),
    walletId,
    storedPublicKey,
  };
  const redis = getRedis();

  if (redis.status === 'ready') {
    await redis.set(swapAuthorizationKey(token), serializeJson(payload), 'EX', ttlSec);
    return;
  }

  cleanupExpiredMemory();
  swapAuthorizationMemory.set(token, {
    expiresAtMs: Date.now() + ttlSec * 1000,
    payload,
  });
}

export async function loadSwapAuthorization(token: string): Promise<StoredSwapAuthorization | null> {
  const redis = getRedis();
  if (redis.status === 'ready') {
    const raw = await redis.get(swapAuthorizationKey(token));
    if (!raw) return null;
    try {
      return deserializeJson<StoredSwapAuthorization>(raw);
    } catch {
      return null;
    }
  }

  cleanupExpiredMemory();
  return swapAuthorizationMemory.get(token)?.payload ?? null;
}

export async function clearSwapAuthorization(token: string) {
  const redis = getRedis();
  if (redis.status === 'ready') {
    await redis.del(swapAuthorizationKey(token));
    return;
  }

  swapAuthorizationMemory.delete(token);
}
