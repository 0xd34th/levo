/**
 * Shared swap aggregator types. The aggregator layer keeps a single contract
 * so the prepare_swap tool can dispatch tx-building uniformly. Currently only
 * the 7K Aggregator is wired; the source field is retained so additional
 * aggregators can slot in without churning the call sites.
 */

export type SwapSource = "sevenk";

export interface SwapQuoteRequest {
  tokenIn: string; // coinType
  tokenOut: string;
  amountIn: string; // raw smallest units
  slippageBps?: number;
  /** Optional sender; aggregators that return tx bytes inline use this. */
  sender?: string;
}

export interface SwapQuote {
  source: SwapSource;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  amountOutMin: string;
  priceImpactPct?: number;
  routes?: Array<{ protocol: string; pool?: string; portion?: number }>;
  slippageBps: number;
  /** Pre-built tx bytes if the source returned them inline, otherwise undefined. */
  txBytes?: string;
  /** Provider-specific quote payload. Required by 7K's build endpoint. */
  rawQuote: unknown;
}

export interface SwapTxPayload {
  source: SwapSource;
  sender: string;
  txBytes: string; // base64 PTB ready for @mysten/sui Transaction.from()
  quote: SwapQuote;
}

export class SwapError extends Error {
  readonly source?: SwapSource;
  readonly code?: string;

  constructor(message: string, opts: { source?: SwapSource; code?: string } = {}) {
    super(message);
    this.name = "SwapError";
    this.source = opts.source;
    this.code = opts.code;
  }
}

export const SOURCE_LABEL: Record<SwapSource, string> = {
  sevenk: "7K Aggregator",
};
