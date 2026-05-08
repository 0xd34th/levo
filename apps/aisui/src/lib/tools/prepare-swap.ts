import { tool } from "ai";
import { z } from "zod";
import {
  buildSwapTxBySource,
  getBestSwapQuote,
  SOURCE_LABEL,
  type SwapQuote,
  type SwapSource,
} from "@/lib/sui/aggregators";
import { bvGet } from "@/lib/blockvision/client";
import type { BVCoinMarket } from "@/lib/blockvision/types";
import { resolveCoinMetadata } from "@/lib/sui/coin-metadata";

const SUI_COIN = "0x2::sui::SUI";

export const prepareSwapParams = z.object({
  tokenIn: z.string().describe("Input coin type or 'SUI' shorthand."),
  tokenOut: z.string().describe("Output coin type or 'SUI' shorthand."),
  amountIn: z
    .string()
    .describe("Human-readable input amount, e.g. '0.5'. Decimals will be applied."),
  slippageBps: z.number().int().min(1).max(10000).default(50),
  sender: z
    .string()
    .optional()
    .describe(
      "User wallet address. If unknown, the UI will prompt to connect; tool can be called with empty sender for a quote-only payload.",
    ),
});

export type PrepareSwapInput = z.infer<typeof prepareSwapParams>;

export interface SwapAlternative {
  source: SwapSource;
  sourceLabel: string;
  amountOutHuman: string;
  amountOutMinHuman: string;
  priceImpactPct?: number;
  /** Difference vs the chosen quote, in fractional terms (-0.012 = 1.2% worse). */
  diffPct?: number;
}

export interface SwapAttempt {
  source: SwapSource;
  sourceLabel: string;
  ok: boolean;
  errorMessage?: string;
  errorCode?: string;
}

export interface PrepareSwapResult {
  quote: SwapQuote;
  source: SwapSource;
  sourceLabel: string;
  tokenIn: { coinType: string; symbol: string; decimals: number; price?: number };
  tokenOut: { coinType: string; symbol: string; decimals: number; price?: number };
  amountInHuman: string;
  amountOutHuman: string;
  amountOutMinHuman: string;
  priceImpactPct?: number;
  needsWallet: boolean;
  txPayload?: { sender: string; txBytes: string; source: SwapSource };
  alternatives: SwapAlternative[];
  attempts: SwapAttempt[];
  warnings: string[];
}

function expandSui(t: string): string {
  return t === "SUI" || t.toLowerCase() === "sui" ? SUI_COIN : t;
}

function toBaseUnits(amount: string, decimals: number): string {
  const cleaned = amount.trim().replace(/_/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) throw new Error(`Invalid amount: ${amount}`);
  const [intPart, fracPartRaw = ""] = cleaned.split(".");
  const fracPart = fracPartRaw.slice(0, decimals).padEnd(decimals, "0");
  const combined = (intPart + fracPart).replace(/^0+(?=\d)/, "");
  return combined === "" ? "0" : combined;
}

function fromBaseUnits(raw: string, decimals: number): string {
  if (!/^\d+$/.test(raw)) return raw;
  if (raw === "0") return "0";
  const padded = raw.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals).replace(/^0+(?=\d)/, "") || "0";
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

function diffVsBest(altOut: string, bestOut: string): number | undefined {
  try {
    const a = BigInt(altOut);
    const b = BigInt(bestOut);
    if (b === 0n) return undefined;
    // Use higher precision to avoid losing % below 0.01.
    const diff = ((a - b) * 1_000_000n) / b;
    return Number(diff) / 10_000;
  } catch {
    const a = Number.parseFloat(altOut);
    const b = Number.parseFloat(bestOut);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return undefined;
    return ((a - b) / b) * 100;
  }
}

export async function runPrepareSwap(input: PrepareSwapInput): Promise<PrepareSwapResult> {
  const tokenInType = expandSui(input.tokenIn);
  const tokenOutType = expandSui(input.tokenOut);

  const [inMeta, outMeta] = await Promise.all([
    resolveCoinMetadata(tokenInType),
    resolveCoinMetadata(tokenOutType),
  ]);

  const decimalsIn = inMeta.decimals ?? 9;
  const decimalsOut = outMeta.decimals ?? 9;
  const amountInRaw = toBaseUnits(input.amountIn, decimalsIn);

  const comparison = await getBestSwapQuote({
    tokenIn: tokenInType,
    tokenOut: tokenOutType,
    amountIn: amountInRaw,
    slippageBps: input.slippageBps,
    sender: input.sender,
  });

  const best = comparison.best;
  const warnings: string[] = [];
  if (inMeta.scamFlag) warnings.push(`${inMeta.symbol} is flagged as suspicious; double-check before swapping.`);
  if (outMeta.scamFlag) warnings.push(`${outMeta.symbol} is flagged as suspicious; double-check before swapping.`);
  if ((best.priceImpactPct ?? 0) > 2) {
    warnings.push(`Price impact is ${best.priceImpactPct?.toFixed(2)}%, larger than 2%.`);
  }
  for (const attempt of comparison.attempts) {
    if (attempt.quote === null) {
      warnings.push(`${SOURCE_LABEL[attempt.source]} unavailable: ${attempt.error?.message ?? "unknown"}`);
    }
  }

  let priceIn: number | undefined;
  let priceOut: number | undefined;
  try {
    const [m1, m2] = await Promise.all([
      bvGet<BVCoinMarket>("/coin/market/pro", { coinType: tokenInType }, { ttl: 60, swr: 120 }),
      bvGet<BVCoinMarket>("/coin/market/pro", { coinType: tokenOutType }, { ttl: 60, swr: 120 }),
    ]);
    priceIn = m1.price;
    priceOut = m2.price;
  } catch {
    /* prices optional */
  }

  let txPayload: PrepareSwapResult["txPayload"];
  if (input.sender && /^0x[0-9a-fA-F]+$/.test(input.sender)) {
    try {
      const built = await buildSwapTxBySource({ quote: best, sender: input.sender });
      txPayload = { sender: built.sender, txBytes: built.txBytes, source: built.source };
    } catch (e) {
      warnings.push(`Could not pre-build tx (${(e as Error).message}). Quote shown only.`);
    }
  }

  const alternatives: SwapAlternative[] = comparison.alternatives.map((alt) => ({
    source: alt.source,
    sourceLabel: SOURCE_LABEL[alt.source],
    amountOutHuman: fromBaseUnits(alt.amountOut, decimalsOut),
    amountOutMinHuman: fromBaseUnits(alt.amountOutMin, decimalsOut),
    priceImpactPct: alt.priceImpactPct,
    diffPct: diffVsBest(alt.amountOut, best.amountOut),
  }));

  const attempts: SwapAttempt[] = comparison.attempts.map((a) => ({
    source: a.source,
    sourceLabel: SOURCE_LABEL[a.source],
    ok: a.quote !== null,
    errorMessage: a.error?.message,
    errorCode: a.error?.code,
  }));

  return {
    quote: best,
    source: best.source,
    sourceLabel: SOURCE_LABEL[best.source],
    tokenIn: {
      coinType: tokenInType,
      symbol: inMeta.symbol ?? "?",
      decimals: decimalsIn,
      price: priceIn,
    },
    tokenOut: {
      coinType: tokenOutType,
      symbol: outMeta.symbol ?? "?",
      decimals: decimalsOut,
      price: priceOut,
    },
    amountInHuman: input.amountIn,
    amountOutHuman: fromBaseUnits(best.amountOut, decimalsOut),
    amountOutMinHuman: fromBaseUnits(best.amountOutMin, decimalsOut),
    priceImpactPct: best.priceImpactPct,
    needsWallet: !txPayload,
    txPayload,
    alternatives,
    attempts,
    warnings,
  };
}

export const prepareSwapTool = tool({
  description:
    "Prepare a swap quote (and tx bytes when sender is provided) via the 7K Aggregator; the user signs in their wallet — never broadcast here.",
  inputSchema: prepareSwapParams,
  execute: runPrepareSwap,
});
