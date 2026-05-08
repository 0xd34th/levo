/**
 * Credits accounting. Backed by KV store (Upstash with memory fallback).
 *
 * - Anonymous users get DAILY_FREE_MESSAGES per day, identified by fingerprint.
 * - Paid credits live under `credits:user:{fingerprint}` and never expire.
 * - Fast mode is free; paid tiers will reuse this tracker when added back.
 */
import { getStore } from "@/lib/cache/store";
import { checkAndConsume, peek } from "@/lib/cache/quota";
import type { ModelMode } from "@/lib/llm/model-router";

export const MODE_COST: Record<ModelMode, number> = {
  fast: 0,
};

export type ConsumeResult =
  | { ok: true; freeRemaining: number; paidRemaining: number; usedFree: boolean }
  | { ok: false; reason: "free_exhausted" | "insufficient_credits"; freeRemaining: number; paidRemaining: number };

export async function consumeCredits(
  fingerprint: string,
  mode: ModelMode,
): Promise<ConsumeResult> {
  const store = getStore();
  const cost = MODE_COST[mode];

  if (cost === 0) {
    const free = await checkAndConsume(fingerprint, "messages", 1);
    if (!free.ok) {
      const paid = await store.get<number>(`credits:user:${fingerprint}`);
      return {
        ok: false,
        reason: "free_exhausted",
        freeRemaining: 0,
        paidRemaining: paid ?? 0,
      };
    }
    const paid = (await store.get<number>(`credits:user:${fingerprint}`)) ?? 0;
    return { ok: true, freeRemaining: free.remaining, paidRemaining: paid, usedFree: true };
  }

  const paidKey = `credits:user:${fingerprint}`;
  const paidBalance = (await store.get<number>(paidKey)) ?? 0;
  if (paidBalance < cost) {
    const free = await peek(fingerprint, "messages");
    return {
      ok: false,
      reason: "insufficient_credits",
      freeRemaining: free.remaining,
      paidRemaining: paidBalance,
    };
  }
  const newPaid = paidBalance - cost;
  await store.set(paidKey, newPaid);
  const free = await peek(fingerprint, "messages");
  return {
    ok: true,
    freeRemaining: free.remaining,
    paidRemaining: newPaid,
    usedFree: false,
  };
}

export async function grantCredits(fingerprint: string, amount: number): Promise<number> {
  const store = getStore();
  const key = `credits:user:${fingerprint}`;
  const cur = (await store.get<number>(key)) ?? 0;
  const next = cur + amount;
  await store.set(key, next);
  return next;
}

export async function getUsage(fingerprint: string): Promise<{
  freeRemaining: number;
  freeLimit: number;
  paidRemaining: number;
}> {
  const free = await peek(fingerprint, "messages");
  const paid = (await getStore().get<number>(`credits:user:${fingerprint}`)) ?? 0;
  return { freeRemaining: free.remaining, freeLimit: free.limit, paidRemaining: paid };
}
