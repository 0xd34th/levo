import { NextResponse } from "next/server";
import { runGetTokenMetrics } from "@/lib/tools/get-token-metrics";

/**
 * Top-bar SUI price chip. Always returns 200 — the chip is a "nice to have"
 * and a 502 noise-spam every 60s is worse than no chip.
 */
export async function GET() {
  try {
    const metrics = await runGetTokenMetrics({ coinType: "0x2::sui::SUI", window: "24H" });
    if (metrics.priceSource === "blockvision") {
      return NextResponse.json({
        symbol: metrics.symbol,
        price: metrics.price,
        priceChange24H: metrics.priceChange24H,
        source: "blockvision",
      });
    }
  } catch {
    /* fall through */
  }
  return NextResponse.json({ symbol: "SUI", price: null, source: "unavailable" });
}

export const runtime = "nodejs";
export const revalidate = 30;
