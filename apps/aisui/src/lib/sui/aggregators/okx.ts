/**
 * OKX DEX aggregator integration for Sui (V6 API).
 *
 * Endpoints:
 *  - /api/v6/dex/aggregator/quote — quote-only, no tx
 *  - /api/v6/dex/aggregator/swap  — quote + tx bytes (requires userWalletAddress)
 *
 * For Sui (chainIndex=784) the swap endpoint returns a serialised PTB under
 * `tx.txData` (sometimes `txBytes`), ready to sign with @mysten/dapp-kit.
 *
 * V6 quoting differences vs the deprecated V5:
 *  - `slippage` → `slippagePercent` (value is a percent string, e.g. "0.5")
 *  - `priceImpactPercentage` → `priceImpactPercent`
 *  - hop list uses `dexProtocol.{dexName,percent}`, not `router.bridgeName`
 *  - response wraps the quote in `data[0]` (V5 was sometimes a bare object)
 */
import { okxGet } from "@/lib/okx/client";
import { OKX_CHAIN } from "@/lib/okx/chain";
import { OkxApiError, type OkxDexQuoteRaw, type OkxSwapTxRaw } from "@/lib/okx/types";
import { env } from "@/lib/env";
import {
  SwapError,
  type SwapQuote,
  type SwapQuoteRequest,
  type SwapTxPayload,
} from "./types";

const QUOTE_PATH = "/api/v6/dex/aggregator/quote";
const SWAP_PATH = "/api/v6/dex/aggregator/swap";

interface OkxAggregatorResponse {
  /** Some envelopes nest the quote under `routerResult`; V6 puts it at root. */
  routerResult?: OkxDexQuoteRaw;
  tx?: OkxSwapTxRaw;
}

function bpsToPercentString(bps: number): string {
  // V6 expects slippage as a percent string. 50 bps → "0.5".
  return (bps / 100).toFixed(4).replace(/\.?0+$/, "") || "0";
}

function pickQuote(raw: unknown): { node: OkxAggregatorResponse | null; root: OkxDexQuoteRaw | null } {
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      return {
        node: first as OkxAggregatorResponse,
        root: ((first as OkxAggregatorResponse).routerResult ?? (first as unknown as OkxDexQuoteRaw)) ?? null,
      };
    }
    return { node: null, root: null };
  }
  if (raw && typeof raw === "object") {
    const node = raw as OkxAggregatorResponse;
    return { node, root: node.routerResult ?? (node as unknown as OkxDexQuoteRaw) };
  }
  return { node: null, root: null };
}

function extractTxBytes(tx: OkxSwapTxRaw | undefined): string | undefined {
  if (!tx) return undefined;
  return tx.txBytes ?? tx.txData ?? tx.data;
}

function mapRoutes(quote: OkxDexQuoteRaw): SwapQuote["routes"] {
  if (!Array.isArray(quote.dexRouterList)) return undefined;
  return quote.dexRouterList
    .map((entry) => {
      const e = entry as { dexProtocol?: { dexName?: string; percent?: string }; router?: string };
      const protocol =
        typeof e.dexProtocol?.dexName === "string"
          ? e.dexProtocol.dexName
          : typeof e.router === "string"
            ? e.router
            : "OKX";
      const portion = e.dexProtocol?.percent ? Number.parseFloat(e.dexProtocol.percent) : undefined;
      return { protocol, portion: Number.isFinite(portion) ? portion : undefined } as {
        protocol: string;
        portion?: number;
      };
    })
    .slice(0, 6);
}

function readPriceImpact(quote: OkxDexQuoteRaw): number | undefined {
  // V6 uses priceImpactPercent; V5 used priceImpactPercentage. Accept either.
  const raw = quote.priceImpactPercent ?? quote.priceImpactPercentage;
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function getOkxSwapQuote(req: SwapQuoteRequest): Promise<SwapQuote> {
  if (!env.okxSwapEnabled()) {
    throw new SwapError("OKX swap aggregator is disabled", { source: "okx", code: "disabled" });
  }
  const slippageBps = req.slippageBps ?? 50;

  // Without a sender we can only ask for a quote. With one we prefer /swap so
  // the response already contains tx bytes (no extra round-trip on submit).
  const path = req.sender ? SWAP_PATH : QUOTE_PATH;
  const params: Record<string, string> = {
    chainIndex: OKX_CHAIN.SUI,
    fromTokenAddress: req.tokenIn,
    toTokenAddress: req.tokenOut,
    amount: req.amountIn,
    slippagePercent: bpsToPercentString(slippageBps),
  };
  if (req.sender) params.userWalletAddress = req.sender;

  let raw: unknown;
  try {
    raw = await okxGet<unknown>(path, params, { ttl: 15, swr: 30 });
  } catch (err) {
    if (err instanceof OkxApiError) {
      throw new SwapError(err.message, { source: "okx", code: err.code });
    }
    throw err instanceof Error
      ? new SwapError(err.message, { source: "okx", code: "fetch_failed" })
      : new SwapError("OKX swap fetch failed", { source: "okx", code: "fetch_failed" });
  }

  const { node, root } = pickQuote(raw);
  const quote = root ?? node?.routerResult ?? null;
  if (!quote || !quote.toTokenAmount) {
    throw new SwapError("OKX quote missing toTokenAmount", { source: "okx", code: "quote_invalid" });
  }

  const amountOut = quote.toTokenAmount;
  const minOut = applyMinSlippage(amountOut, slippageBps);

  return {
    source: "okx",
    tokenIn: req.tokenIn,
    tokenOut: req.tokenOut,
    amountIn: req.amountIn,
    amountOut,
    amountOutMin: minOut,
    priceImpactPct: readPriceImpact(quote),
    routes: mapRoutes(quote),
    slippageBps,
    txBytes: extractTxBytes(node?.tx),
    rawQuote: raw,
  };
}

/** OKX quote returns no min-out, so derive it from the slippage tolerance. */
function applyMinSlippage(amountOut: string, slippageBps: number): string {
  if (!/^\d+$/.test(amountOut)) return amountOut;
  const out = BigInt(amountOut);
  const num = BigInt(10000 - slippageBps);
  const denom = BigInt(10000);
  const min = (out * num) / denom;
  return min.toString();
}

export async function buildOkxSwapTx(args: {
  quote: SwapQuote;
  sender: string;
}): Promise<SwapTxPayload> {
  if (args.quote.txBytes && args.quote.tokenIn && args.quote.tokenOut) {
    return {
      source: "okx",
      sender: args.sender,
      txBytes: args.quote.txBytes,
      quote: args.quote,
    };
  }
  const refreshed = await getOkxSwapQuote({
    tokenIn: args.quote.tokenIn,
    tokenOut: args.quote.tokenOut,
    amountIn: args.quote.amountIn,
    slippageBps: args.quote.slippageBps,
    sender: args.sender,
  });
  if (!refreshed.txBytes) {
    throw new SwapError("OKX swap response missing tx bytes", {
      source: "okx",
      code: "build_invalid",
    });
  }
  return {
    source: "okx",
    sender: args.sender,
    txBytes: refreshed.txBytes,
    quote: refreshed,
  };
}
