/**
 * 7K Aggregator (https://7k.ag) integration.
 *
 * MVP uses the public quote endpoint — we don't need their official SDK to
 * fetch a price + tx payload. The aggregator returns a serialised PTB the
 * client can sign with @mysten/dapp-kit.
 */
import { withCache, hashKey } from "@/lib/cache/store";
import { env } from "@/lib/env";
import {
  SwapError,
  type SwapQuote,
  type SwapQuoteRequest,
  type SwapTxPayload,
} from "./types";

const QUOTE_ENDPOINT = "https://aggregator-api.7k.ag/v1/quote";
const BUILD_ENDPOINT = "https://aggregator-api.7k.ag/v1/swap/tx";

export async function getSwapQuote(req: SwapQuoteRequest): Promise<SwapQuote> {
  const slippageBps = req.slippageBps ?? 50;
  const key = hashKey(["7k:quote", req.tokenIn, req.tokenOut, req.amountIn, slippageBps]);
  return withCache<SwapQuote>(
    key,
    async () => {
      const url = new URL(QUOTE_ENDPOINT);
      url.searchParams.set("tokenIn", req.tokenIn);
      url.searchParams.set("tokenOut", req.tokenOut);
      url.searchParams.set("amountIn", req.amountIn);
      url.searchParams.set("slippageBps", String(slippageBps));
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new SwapError(`7K quote ${res.status}`, { source: "sevenk", code: "quote_failed" });
      }
      const json = (await res.json()) as {
        amountOut?: string;
        amountOutMin?: string;
        priceImpactPct?: number;
        routes?: Array<{ protocol: string; pool?: string; portion?: number }>;
      };
      if (!json.amountOut) {
        throw new SwapError("7K quote missing amountOut", {
          source: "sevenk",
          code: "quote_invalid",
        });
      }
      return {
        source: "sevenk",
        tokenIn: req.tokenIn,
        tokenOut: req.tokenOut,
        amountIn: req.amountIn,
        amountOut: json.amountOut,
        amountOutMin: json.amountOutMin ?? json.amountOut,
        priceImpactPct: json.priceImpactPct,
        routes: json.routes,
        slippageBps,
        rawQuote: json,
      };
    },
    { ttl: 15, swr: 30 },
  );
}

export async function buildSwapTx(args: {
  quote: SwapQuote;
  sender: string;
}): Promise<SwapTxPayload> {
  const referralAddr = env.sevenKReferralAddr();
  const referralBps = env.sevenKReferralBps();
  const body = {
    sender: args.sender,
    quote: args.quote.rawQuote,
    referral: referralAddr ? { address: referralAddr, bps: referralBps } : undefined,
  };
  const res = await fetch(BUILD_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new SwapError(`7K build ${res.status}`, { source: "sevenk", code: "build_failed" });
  }
  const json = (await res.json()) as { txBytes?: string; tx_bytes?: string };
  const txBytes = json.txBytes ?? json.tx_bytes;
  if (!txBytes) {
    throw new SwapError("7K tx missing txBytes", { source: "sevenk", code: "build_invalid" });
  }
  return {
    source: "sevenk",
    sender: args.sender,
    txBytes,
    quote: args.quote,
  };
}

export type { SwapQuote, SwapQuoteRequest, SwapTxPayload };
export { SwapError };
