/** Per-fingerprint per-day quota guards. */
import { getStore } from "./store";
import { env } from "@/lib/env";

const SECONDS_PER_DAY = 86400;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export type QuotaKind = "messages" | "bvCalls";

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
  const ok = used <= limit;
  return { ok, used, limit, remaining: Math.max(0, limit - used) };
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
