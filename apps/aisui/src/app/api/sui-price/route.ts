import { NextResponse } from "next/server";
import { runGetTokenMetrics } from "@/lib/tools/get-token-metrics";
import { getOkxSwapQuote } from "@/lib/sui/aggregators/okx";
import { env, okxConfigured } from "@/lib/env";

const USDC =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

/**
 * Top-bar SUI price chip. Tries BlockVision first; on failure (Free trial cap,
 * outage), falls through to a quoted spot price via OKX X Routing (1 SUI →
 * USDC, divided into the smallest unit). Always returns 200 — the chip is a
 * "nice to have" and a 502 noise-spam every 60s is worse than no chip.
 */
export async function GET() {
  try {
    const metrics = await runGetTokenMetrics({ coinType: "0x2::sui::SUI", window: "24H" });
    return NextResponse.json({
      symbol: metrics.symbol,
      price: metrics.price,
      priceChange24H: metrics.priceChange24H,
      source: "blockvision",
    });
  } catch {
    // Continue to OKX fallback below — we only land here when BV failed.
  }

  if (env.okxSwapEnabled() && okxConfigured()) {
    try {
      // 1 SUI = 1_000_000_000 (9 decimals); USDC has 6 decimals.
      const quote = await getOkxSwapQuote({
        tokenIn: "0x2::sui::SUI",
        tokenOut: USDC,
        amountIn: "1000000000",
        slippageBps: 50,
      });
      const usdcOut = Number(quote.amountOut) / 1_000_000;
      if (Number.isFinite(usdcOut) && usdcOut > 0) {
        return NextResponse.json({
          symbol: "SUI",
          price: usdcOut,
          source: "okx",
        });
      }
    } catch {
      /* both sources down — fall through to null */
    }
  }

  return NextResponse.json({ symbol: "SUI", price: null, source: "unavailable" });
}

export const runtime = "nodejs";
export const revalidate = 30;
