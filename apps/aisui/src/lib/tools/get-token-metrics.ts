import { tool } from "ai";
import { z } from "zod";
import { bvGet } from "@/lib/blockvision/client";
import { bvFallbackDecision } from "@/lib/blockvision/fallback";
import type { BVCoinMarket, BVOhlcvPoint } from "@/lib/blockvision/types";
import { resolveCoinMetadata } from "@/lib/sui/coin-metadata";

const SUI_COIN = "0x2::sui::SUI";

export const getTokenMetricsParams = z.object({
  coinType: z
    .string()
    .min(3)
    .describe(
      "Sui coin type, e.g. 0x2::sui::SUI. If user said just 'SUI' or 'Sui', pass 0x2::sui::SUI.",
    ),
  window: z
    .enum(["1H", "24H", "7D", "30D"])
    .default("24H")
    .describe("Chart window (defaults to 24H)."),
});

export type GetTokenMetricsInput = z.infer<typeof getTokenMetricsParams>;

export type TokenMetricsSource = "blockvision" | "partial";

export interface TokenMetricsResult {
  coinType: string;
  symbol: string;
  name: string;
  decimals: number;
  logo?: string;
  verified?: boolean;
  scamFlag?: number;
  price: number;
  /** Where the live price came from (in the partial case, only metadata was resolved). */
  priceSource: TokenMetricsSource;
  priceChange24H?: number;
  priceChange1H?: number;
  priceChange7D?: number;
  priceChange30D?: number;
  marketCap?: number;
  fdv?: number;
  volume24H?: number;
  liquidity?: number;
  holders?: number;
  totalSupply?: string;
  circulatingSupply?: string;
  ohlcv: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
  window: string;
  /** Per-section status so the UI / LLM know what's missing without guessing. */
  unavailable?: { market?: boolean; ohlcv?: boolean };
  fallbackReason?: string;
  warnings: string[];
}

export async function runGetTokenMetrics(
  input: GetTokenMetricsInput,
): Promise<TokenMetricsResult> {
  const coinType = input.coinType === "SUI" ? SUI_COIN : input.coinType;
  const warnings: string[] = [];

  // 1. Metadata — resolveCoinMetadata already cascades BV → Sui RPC, so this
  //    succeeds whenever the coin actually exists on-chain.
  const meta = await resolveCoinMetadata(coinType);

  // 2. Market metrics + OHLCV — both come from BV; degrade gracefully on failure.
  const [marketSettled, ohlcvSettled] = await Promise.allSettled([
    bvGet<BVCoinMarket>("/coin/market/pro", { coinType }, { ttl: 60, swr: 120 }),
    bvGet<BVOhlcvPoint[] | { items?: BVOhlcvPoint[] }>(
      "/coin/ohlcv",
      { coinType, period: input.window },
      { ttl: 120, swr: 300 },
    ),
  ]);

  const marketUnavailable = marketSettled.status === "rejected";
  const ohlcvUnavailable = ohlcvSettled.status === "rejected";
  const market = marketSettled.status === "fulfilled" ? marketSettled.value : null;
  const ohlcvRaw = ohlcvSettled.status === "fulfilled" ? ohlcvSettled.value : null;

  let fallbackReason: string | undefined;
  if (marketUnavailable) {
    const decision = bvFallbackDecision(marketSettled.reason);
    if (decision.ok) fallbackReason = decision.reason;
    warnings.push(`Market metrics from BlockVision unavailable (${decision.ok ? decision.reason : "unknown"}).`);
  }
  if (ohlcvUnavailable) {
    warnings.push(`OHLCV chart from BlockVision unavailable.`);
  }

  const marketPrice = market ? readNumber(market.price, market.priceInUsd) : 0;

  // 3. Spot price — sourced from BlockVision; if unavailable, surface
  //    `priceSource: "partial"` so the LLM does not hallucinate a number.
  const price = marketPrice;
  const priceSource: TokenMetricsSource = market && Number.isFinite(price) && price > 0
    ? "blockvision"
    : "partial";

  const series = Array.isArray(ohlcvRaw) ? ohlcvRaw : (ohlcvRaw?.items ?? []);

  return {
    coinType,
    symbol: meta.symbol,
    name: meta.name ?? meta.symbol,
    decimals: meta.decimals,
    logo: meta.logo,
    verified: meta.verified,
    scamFlag: meta.scamFlag,
    price,
    priceSource,
    priceChange24H: readOptionalNumber(
      market?.priceChangePercentage24H,
      market?.market?.hour24?.priceChange,
    ),
    priceChange1H: readOptionalNumber(
      market?.priceChangePercentage1H,
      market?.market?.hour1?.priceChange,
    ),
    priceChange7D: readOptionalNumber(
      market?.priceChangePercentage7D,
      market?.market?.day7?.priceChange,
    ),
    priceChange30D: readOptionalNumber(
      market?.priceChangePercentage30D,
      market?.market?.day30?.priceChange,
    ),
    marketCap: readOptionalNumber(market?.marketCap),
    fdv: readOptionalNumber(market?.fullyDilutedValue, market?.fdvInUsd),
    volume24H: readOptionalNumber(market?.volume24H),
    liquidity: readOptionalNumber(market?.liquidity, market?.liquidityInUsd),
    holders: undefined,
    totalSupply: market?.supply,
    circulatingSupply: market?.circulating,
    window: input.window,
    unavailable:
      marketUnavailable || ohlcvUnavailable
        ? { market: marketUnavailable || undefined, ohlcv: ohlcvUnavailable || undefined }
        : undefined,
    fallbackReason,
    warnings,
    ohlcv: series.map((p) => ({
      t: p.timestamp,
      o: p.open,
      h: p.high,
      l: p.low,
      c: p.close,
      v: p.volume,
    })),
  };
}

function readNumber(...values: Array<number | string | undefined>): number {
  return readOptionalNumber(...values) ?? 0;
}

function readOptionalNumber(...values: Array<number | string | undefined>): number | undefined {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export const getTokenMetricsTool = tool({
  description:
    "Fetch live price, market metrics, and OHLCV chart for a Sui coin. Use for any 'how is <token>' / 'price' / 'market' question. Always returns a valid result; check `unavailable` and `priceSource` to see what's missing.",
  inputSchema: getTokenMetricsParams,
  execute: runGetTokenMetrics,
});
