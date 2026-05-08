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
      "Human-readable input amount, e.g. '0.5'. Shown to the user as a hint above the embedded swap widget; the user enters the actual amount themselves.",
    ),
  slippageBps: z.number().int().min(1).max(10000).default(50),
});

export type PrepareSwapInput = z.infer<typeof prepareSwapParams>;

export interface PrepareSwapResult {
  tokenIn: { coinType: string; symbol: string; decimals: number };
  tokenOut: { coinType: string; symbol: string; decimals: number };
  amountInHuman: string;
  slippageBps: number;
  /** Human-readable slippage as a string (e.g. "0.5") for the Terminal's defaultSlippage prop. */
  slippagePctText: string;
  warnings: string[];
}

function expandSui(t: string): string {
  return t === "SUI" || t.toLowerCase() === "sui" ? SUI_COIN : t;
}

function isValidAmount(amount: string): boolean {
  return /^\d+(\.\d+)?$/.test(amount.trim().replace(/_/g, ""));
}

export async function runPrepareSwap(input: PrepareSwapInput): Promise<PrepareSwapResult> {
  const tokenInType = expandSui(input.tokenIn);
  const tokenOutType = expandSui(input.tokenOut);

  const [inMeta, outMeta] = await Promise.all([
    resolveCoinMetadata(tokenInType),
    resolveCoinMetadata(tokenOutType),
  ]);

  const warnings: string[] = [];
  if (!isValidAmount(input.amountIn)) {
    warnings.push(`Couldn't parse '${input.amountIn}' as a number — please enter the amount manually in the widget.`);
  }
  if (inMeta.scamFlag) {
    warnings.push(`${inMeta.symbol} is flagged as suspicious; double-check before swapping.`);
  }
  if (outMeta.scamFlag) {
    warnings.push(`${outMeta.symbol} is flagged as suspicious; double-check before swapping.`);
  }

  // Cetus Terminal expects defaultSlippage as a percentage string ("0.5" for 0.5%).
  const slippagePctText = (input.slippageBps / 100).toString();

  return {
    tokenIn: {
      coinType: tokenInType,
      symbol: inMeta.symbol ?? "?",
      decimals: inMeta.decimals ?? 9,
    },
    tokenOut: {
      coinType: tokenOutType,
      symbol: outMeta.symbol ?? "?",
      decimals: outMeta.decimals ?? 9,
    },
    amountInHuman: input.amountIn,
    slippageBps: input.slippageBps,
    slippagePctText,
    warnings,
  };
}

export const prepareSwapTool = tool({
  description:
    "Open an embedded Cetus swap widget pre-filled with the user's tokens and slippage. The widget handles routing, wallet connection, and signing — never broadcast here. The user types the amount in the widget; the amount this tool receives is shown as a hint.",
  inputSchema: prepareSwapParams,
  execute: runPrepareSwap,
});
