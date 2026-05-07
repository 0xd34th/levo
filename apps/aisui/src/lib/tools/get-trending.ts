import { tool } from "ai";
import { z } from "zod";
import { bvGet } from "@/lib/blockvision/client";
import type { BVTrendingCoin, BVDexPool } from "@/lib/blockvision/types";

export const getTrendingParams = z.object({
  window: z.enum(["1H", "24H", "7D"]).default("24H"),
  limit: z.number().int().min(3).max(50).default(15),
});

export type GetTrendingInput = z.infer<typeof getTrendingParams>;

export interface TrendingResult {
  window: string;
  coins: BVTrendingCoin[];
  pools: Array<{
    poolId: string;
    protocol: string;
    pair: string;
    tvlUsd?: number;
    volume24HUsd?: number;
    apr?: number;
  }>;
}

export async function runGetTrending(input: GetTrendingInput): Promise<TrendingResult> {
  type CoinsResp = { coins?: BVTrendingCoin[]; data?: BVTrendingCoin[] };
  type PoolsResp = { pools?: BVDexPool[]; data?: BVDexPool[] };
  const [coinsRaw, poolsRaw] = await Promise.all([
    bvGet<CoinsResp>(
      "/coin/trending",
      { period: input.window, pageSize: input.limit },
      { ttl: 60, swr: 180 },
    ).catch<CoinsResp>(() => ({ coins: [] })),
    bvGet<PoolsResp>(
      "/coin/dex/pools",
      { sort: "volume24h", pageSize: input.limit },
      { ttl: 90, swr: 240 },
    ).catch<PoolsResp>(() => ({ pools: [] })),
  ]);

  const coins = coinsRaw.coins ?? coinsRaw.data ?? [];
  const pools = poolsRaw.pools ?? poolsRaw.data ?? [];

  return {
    window: input.window,
    coins: coins.slice(0, input.limit),
    pools: pools.slice(0, input.limit).map((p: BVDexPool) => ({
      poolId: p.poolId,
      protocol: p.protocol,
      pair: `${p.symbolA ?? shortType(p.coinTypeA)}/${p.symbolB ?? shortType(p.coinTypeB)}`,
      tvlUsd: p.tvlUsd,
      volume24HUsd: p.volume24HUsd,
      apr: p.apr,
    })),
  };
}

function shortType(s?: string) {
  if (!s) return "?";
  const parts = s.split("::");
  return parts[parts.length - 1] ?? s;
}

export const getTrendingTool = tool({
  description: "Fetch trending Sui coins and top DEX pools by volume in a window.",
  inputSchema: getTrendingParams,
  execute: runGetTrending,
});
