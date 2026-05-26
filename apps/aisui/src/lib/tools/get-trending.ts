import { tool } from "ai";
import { z } from "zod";
import { bvGet } from "@/lib/blockvision/client";
import type { BVCoinMarket, BVTrendingCoin, BVDexPool } from "@/lib/blockvision/types";

const SUI_COIN = "0x2::sui::SUI";
const BV_NATIVE_SUI_COIN =
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

export const getTrendingParams = z.object({
  window: z.enum(["1H", "24H", "7D"]).default("24H"),
  limit: z.number().int().min(3).max(50).default(15),
});

export type GetTrendingInput = z.infer<typeof getTrendingParams>;

export interface TrendingResult {
  window: string;
  source: "blockvision" | "unavailable";
  coins: BVTrendingCoin[];
  pools: Array<{
    poolId: string;
    protocol: string;
    pair: string;
    tvlUsd?: number;
    volume24HUsd?: number;
    apr?: number;
  }>;
  recentTrades?: unknown[];
  warning?: string;
}

type PoolsResp = BVDexPool[] | { pools?: BVDexPool[]; data?: BVDexPool[]; items?: BVDexPool[] };
type TradesResp = { data?: unknown[]; items?: unknown[] };

export async function runGetTrending(input: GetTrendingInput): Promise<TrendingResult> {
  const [marketSettled, poolsSettled, tradesSettled] = await Promise.allSettled([
    bvGet<BVCoinMarket>(
      "/coin/market/pro",
      { coinType: BV_NATIVE_SUI_COIN },
      { ttl: 60, swr: 180 },
    ),
    bvGet<PoolsResp>(
      "/coin/dex/pools",
      { coinType: BV_NATIVE_SUI_COIN },
      { ttl: 90, swr: 240 },
    ),
    bvGet<TradesResp>(
      "/coin/trades",
      { coinType: BV_NATIVE_SUI_COIN, limit: input.limit },
      { ttl: 60, swr: 180 },
    ),
  ]);

  const coins =
    marketSettled.status === "fulfilled"
      ? [marketToTrendingCoin(marketSettled.value)]
      : [];
  const pools =
    poolsSettled.status === "fulfilled"
      ? readPools(poolsSettled.value)
      : [];
  const recentTrades =
    tradesSettled.status === "fulfilled"
      ? (tradesSettled.value.data ?? tradesSettled.value.items ?? []).slice(0, input.limit)
      : [];

  const source = coins.length || pools.length || recentTrades.length ? "blockvision" : "unavailable";
  const warning =
    source === "unavailable"
      ? "Trending markets unavailable from BlockVision right now."
      : undefined;

  return {
    window: input.window,
    source,
    coins: coins.slice(0, input.limit),
    pools: pools
      .slice()
      .sort(
        (a, b) =>
          (readNumber(b, "volume24HUsd", "volume24H", "volume", "tvlUsd", "tvl") ?? 0) -
          (readNumber(a, "volume24HUsd", "volume24H", "volume", "tvlUsd", "tvl") ?? 0),
      )
      .slice(0, input.limit)
      .map(poolToResult),
    recentTrades,
    warning,
  };
}

function marketToTrendingCoin(market: BVCoinMarket): BVTrendingCoin {
  return {
    coinType: SUI_COIN,
    symbol: "SUI",
    name: "Sui",
    price: readMarketNumber(market, "price", "priceInUsd") ?? 0,
    priceChangePercentage24H: readMarketNumber(
      market,
      "priceChangePercentage24H",
      "market.hour24.priceChange",
    ),
    volume24H: readMarketNumber(market, "volume24H"),
    marketCap: readMarketNumber(market, "marketCap"),
  };
}

function readPools(raw: PoolsResp): BVDexPool[] {
  if (Array.isArray(raw)) return raw;
  return raw.pools ?? raw.data ?? raw.items ?? [];
}

function poolToResult(pool: BVDexPool) {
  const record = pool as unknown as Record<string, unknown>;
  return {
    poolId: String(record.poolId ?? record.objectId ?? ""),
    protocol: String(record.protocol ?? record.dex ?? "DEX"),
    pair: readPair(pool),
    tvlUsd: readNumber(pool, "tvlUsd", "tvl"),
    volume24HUsd: readNumber(pool, "volume24HUsd", "volume24H", "volume24h", "volume"),
    apr: readNumber(pool, "apr"),
  };
}

function readPair(pool: BVDexPool) {
  const record = pool as unknown as Record<string, unknown>;
  if (typeof record.pair === "string" && record.pair) return record.pair;
  if (Array.isArray(record.coinList)) {
    const pair = record.coinList.map((coin) => shortType(String(coin))).filter(Boolean).join("/");
    if (pair) return pair;
  }
  return `${pool.symbolA ?? shortType(pool.coinTypeA)}/${pool.symbolB ?? shortType(pool.coinTypeB)}`;
}

function shortType(s?: string) {
  if (!s) return "?";
  const parts = s.split("::");
  return parts[parts.length - 1] ?? s;
}

function readNumber(record: unknown, ...keys: string[]): number | undefined {
  if (!record || typeof record !== "object") return undefined;
  for (const key of keys) {
    const value = (record as Record<string, unknown>)[key];
    const number = coerceNumber(value);
    if (number !== undefined) return number;
  }
  return undefined;
}

function readMarketNumber(record: unknown, ...paths: string[]): number | undefined {
  for (const path of paths) {
    let current: unknown = record;
    for (const part of path.split(".")) {
      if (!current || typeof current !== "object") {
        current = undefined;
        break;
      }
      current = (current as Record<string, unknown>)[part];
    }
    const number = coerceNumber(current);
    if (number !== undefined) return number;
  }
  return undefined;
}

function coerceNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export const getTrendingTool = tool({
  description: "Fetch trending Sui coins and top DEX pools by volume in a window.",
  inputSchema: getTrendingParams,
  execute: runGetTrending,
});
