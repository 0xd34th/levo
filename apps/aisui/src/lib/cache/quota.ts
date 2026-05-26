/** Per-fingerprint per-day quota guards. */
import { env } from "@/lib/env";
import { getStore } from "./store";

const SECONDS_PER_DAY = 86_400;

export type QuotaKind = "messages" | "bvCalls";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function limitFor(kind: QuotaKind): number {
  switch (kind) {
    case "messages":
      return env.dailyFreeMessages();
    case "bvCalls":
      return env.dailyFreeBvCalls();
  }
}

export async function checkAndConsume(
  fingerprint: string,
  kind: QuotaKind,
  amount = 1,
): Promise<{ ok: boolean; used: number; limit: number; remaining: number }> {
  const limit = limitFor(kind);
  const key = `quota:${kind}:${fingerprint}:${todayKey()}`;
  const used = await getStore().incrBy(key, amount, SECONDS_PER_DAY);
  return { ok: used <= limit, used, limit, remaining: Math.max(0, limit - used) };
}

export async function peek(
  fingerprint: string,
  kind: QuotaKind,
): Promise<{ used: number; limit: number; remaining: number }> {
  const limit = limitFor(kind);
  const key = `quota:${kind}:${fingerprint}:${todayKey()}`;
  const used = (await getStore().get<number>(key)) ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}
