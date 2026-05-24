import { randomUUID } from 'crypto';
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

export async function stageSwapQuote(payload: StoredSwapQuote, ttlSec: number) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + ttlSec * 1000);
  const redis = getRedis();

  if (redis.status === 'ready') {
    await redis.set(swapQuoteKey(token), JSON.stringify(payload), 'EX', ttlSec);
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
      return JSON.parse(raw) as StoredSwapQuote;
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
    await redis.set(swapAuthorizationKey(token), JSON.stringify(payload), 'EX', ttlSec);
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
      return JSON.parse(raw) as StoredSwapAuthorization;
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
