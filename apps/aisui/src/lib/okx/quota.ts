/** Per-fingerprint OKX API quota guard. Mirrors cache/quota.ts pattern. */
import { getStore } from "@/lib/cache/store";
import { env } from "@/lib/env";

const SECONDS_PER_DAY = 86400;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkAndConsumeOkxQuota(
  fingerprint: string,
  amount = 1,
): Promise<{ ok: boolean; used: number; limit: number; remaining: number }> {
  const limit = env.dailyFreeOkxCalls();
  const key = `quota:okxCalls:${fingerprint}:${todayKey()}`;
  const used = await getStore().incrBy(key, amount, SECONDS_PER_DAY);
  const ok = used <= limit;
  return { ok, used, limit, remaining: Math.max(0, limit - used) };
}

export async function peekOkxQuota(
  fingerprint: string,
): Promise<{ used: number; limit: number; remaining: number }> {
  const limit = env.dailyFreeOkxCalls();
  const key = `quota:okxCalls:${fingerprint}:${todayKey()}`;
  const used = (await getStore().get<number>(key)) ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}
