/**
 * Unified swap aggregator entry. Compares 7K and OKX quotes in parallel and
 * picks the source with the larger amountOut; build dispatches by source so
 * the rest of the app stays source-agnostic.
 */
import { env, okxConfigured } from "@/lib/env";
import { getSwapQuote as get7kQuote, buildSwapTx as build7kTx } from "./7k";
import { getOkxSwapQuote, buildOkxSwapTx } from "./okx";
import {
  SOURCE_LABEL,
  SwapError,
  type SwapQuote,
  type SwapQuoteRequest,
  type SwapSource,
  type SwapTxPayload,
} from "./types";

export interface QuoteAttempt {
  source: SwapSource;
  quote: SwapQuote | null;
  error?: { message: string; code?: string };
}

export interface QuoteComparison {
  best: SwapQuote;
  alternatives: SwapQuote[];
  attempts: QuoteAttempt[];
}

/** True when OKX quoting should be attempted alongside 7K. */
export function isOkxSwapEnabled(): boolean {
  return env.okxSwapEnabled() && okxConfigured();
}

function compareAmountOut(a: SwapQuote, b: SwapQuote): number {
  // BigInt-safe comparison; guards against scientific-notation strings.
  try {
    const aOut = BigInt(a.amountOut);
    const bOut = BigInt(b.amountOut);
    if (aOut === bOut) return 0;
    return aOut > bOut ? -1 : 1;
  } catch {
    const an = Number.parseFloat(a.amountOut);
    const bn = Number.parseFloat(b.amountOut);
    return bn - an;
  }
}

/**
 * Run quote requests against every enabled aggregator in parallel. Returns the
 * best (largest amountOut) plus the alternates so callers can show a "via X"
 * banner and a fallback list. Throws SwapError only when ALL sources fail.
 */
export async function getBestSwapQuote(req: SwapQuoteRequest): Promise<QuoteComparison> {
  const tasks: Array<{ source: SwapSource; promise: Promise<SwapQuote> }> = [
    { source: "sevenk", promise: get7kQuote(req) },
  ];
  if (isOkxSwapEnabled()) {
    tasks.push({ source: "okx", promise: getOkxSwapQuote(req) });
  }

  const settled = await Promise.allSettled(tasks.map((t) => t.promise));
  const attempts: QuoteAttempt[] = settled.map((res, idx) => {
    const source = tasks[idx].source;
    if (res.status === "fulfilled") {
      return { source, quote: res.value };
    }
    const reason = res.reason;
    if (reason instanceof SwapError) {
      return { source, quote: null, error: { message: reason.message, code: reason.code } };
    }
    return {
      source,
      quote: null,
      error: { message: reason instanceof Error ? reason.message : String(reason) },
    };
  });

  const successful = attempts
    .map((a) => a.quote)
    .filter((q): q is SwapQuote => q !== null)
    .sort(compareAmountOut);

  if (successful.length === 0) {
    const detail = attempts.map((a) => `${SOURCE_LABEL[a.source]}: ${a.error?.message ?? "unknown"}`).join(" | ");
    throw new SwapError(`No aggregator returned a quote (${detail})`, { code: "all_failed" });
  }

  return {
    best: successful[0],
    alternatives: successful.slice(1),
    attempts,
  };
}

/** Build a tx payload using the aggregator that produced the quote. */
export async function buildSwapTxBySource(args: {
  quote: SwapQuote;
  sender: string;
}): Promise<SwapTxPayload> {
  switch (args.quote.source) {
    case "sevenk":
      return build7kTx(args);
    case "okx":
      return buildOkxSwapTx(args);
    default:
      throw new SwapError(`Unknown swap source: ${(args.quote as { source: string }).source}`, {
        code: "unknown_source",
      });
  }
}

export { SOURCE_LABEL, SwapError };
export type { SwapQuote, SwapQuoteRequest, SwapTxPayload, SwapSource } from "./types";
