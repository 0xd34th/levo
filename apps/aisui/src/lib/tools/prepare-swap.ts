import { tool } from "ai";
import { z } from "zod";
import { resolveCoinMetadata } from "@/lib/sui/coin-metadata";

const SUI_COIN = "0x2::sui::SUI";

export const prepareSwapParams = z.object({
  tokenIn: z.string().describe("Input coin type or 'SUI' shorthand."),
  tokenOut: z.string().describe("Output coin type or 'SUI' shorthand."),
  amountIn: z
    .string()
    .describe(
      "Human-readable input amount, e.g. '0.5'. This is the locked amount that will be swapped — to change it the user must restate the request.",
    ),
  slippageBps: z.number().int().min(1).max(10000).default(50),
});

export type PrepareSwapInput = z.infer<typeof prepareSwapParams>;

export interface PrepareSwapResult {
  tokenIn: { coinType: string; symbol: string; decimals: number };
  tokenOut: { coinType: string; symbol: string; decimals: number };
  amountInHuman: string;
  /** Smallest-unit amount as a base-10 string (u64-shaped). Empty when amount couldn't be parsed. */
  amountInRaw: string;
  slippageBps: number;
  warnings: string[];
}

function expandSui(t: string): string {
  return t === "SUI" || t.toLowerCase() === "sui" ? SUI_COIN : t;
}

function isValidAmount(amount: string): boolean {
  return /^\d+(\.\d+)?$/.test(amount.trim().replace(/_/g, ""));
}

function humanToRaw(human: string, decimals: number): string {
  const cleaned = human.trim().replace(/_/g, "");
  const [intPart, fracPart = ""] = cleaned.split(".");
  const fracPadded = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  const combined = (intPart + fracPadded).replace(/^0+(?=\d)/, "");
  return combined === "" ? "0" : combined;
}

export async function runPrepareSwap(input: PrepareSwapInput): Promise<PrepareSwapResult> {
  const tokenInType = expandSui(input.tokenIn);
  const tokenOutType = expandSui(input.tokenOut);

  const [inMeta, outMeta] = await Promise.all([
    resolveCoinMetadata(tokenInType),
    resolveCoinMetadata(tokenOutType),
  ]);

  const warnings: string[] = [];
  const amountValid = isValidAmount(input.amountIn);
  if (!amountValid) {
    warnings.push(`Couldn't parse '${input.amountIn}' as a number — please restate the amount.`);
  }
  if (inMeta.scamFlag) {
    warnings.push(`${inMeta.symbol} is flagged as suspicious; double-check before swapping.`);
  }
  if (outMeta.scamFlag) {
    warnings.push(`${outMeta.symbol} is flagged as suspicious; double-check before swapping.`);
  }

  const inDecimals = inMeta.decimals ?? 9;
  const amountInRaw = amountValid ? humanToRaw(input.amountIn, inDecimals) : "";

  return {
    tokenIn: {
      coinType: tokenInType,
      symbol: inMeta.symbol ?? "?",
      decimals: inDecimals,
    },
    tokenOut: {
      coinType: tokenOutType,
      symbol: outMeta.symbol ?? "?",
      decimals: outMeta.decimals ?? 9,
    },
    amountInHuman: input.amountIn,
    amountInRaw,
    slippageBps: input.slippageBps,
    warnings,
  };
}

export const prepareSwapTool = tool({
  description:
    "Open a swap card with the locked input amount, tokens, and slippage. The card fetches a live quote from the 7K meta-aggregator (Bluefin7K / Cetus / FlowX), shows the estimated output, and lets the user sign the transaction. The card will not let the user change the amount — to change it, ask the user to restate the request.",
  inputSchema: prepareSwapParams,
  execute: runPrepareSwap,
});
