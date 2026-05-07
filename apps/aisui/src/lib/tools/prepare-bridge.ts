import { tool } from "ai";
import { z } from "zod";
import { env, okxConfigured } from "@/lib/env";
import {
  buildOkxBridgeDeepLink,
  chainNameOf,
  getOkxBridgeQuote,
  resolveChainIndex,
  type BridgeRoute,
} from "@/lib/okx";

export const prepareBridgeParams = z.object({
  fromChain: z.string().describe("Source chain. Accepts name (e.g. 'ethereum', 'solana') or chainIndex."),
  toChain: z.string().describe("Destination chain. Same format as fromChain. Use 'sui' for Sui inbound."),
  fromToken: z
    .string()
    .describe("Source token address (EVM contract / SPL mint / Sui coinType). Use 'native' for the chain's native asset."),
  toToken: z.string().describe("Destination token address. Use 'native' or '0x2::sui::SUI' for native SUI."),
  amount: z.string().describe("Raw smallest-unit amount of fromToken, e.g. '100000000' for 0.1 ETH."),
  slippageBps: z.number().int().min(1).max(10000).default(100),
  recipient: z
    .string()
    .optional()
    .describe("Recipient address on the destination chain. Required for cross-chain delivery."),
});

export type PrepareBridgeInput = z.infer<typeof prepareBridgeParams>;

export interface PrepareBridgeResult {
  /** Whether the OKX bridge integration is enabled and configured. */
  available: boolean;
  /** Why the tool can't run, when available is false. */
  unavailableReason?: string;
  fromChain: { input: string; chainIndex: string; name?: string };
  toChain: { input: string; chainIndex: string; name?: string };
  fromTokenAddress: string;
  toTokenAddress: string;
  amountIn: string;
  amountOut?: string;
  estimatedTimeSec?: number;
  bestRoute?: BridgeRoute;
  alternates: BridgeRoute[];
  recipient?: string;
  /** Deeplink the user can open in OKX Wallet (web/extension/mobile) to finish signing. */
  okxWalletDeepLink: string;
  warnings: string[];
}

const NATIVE_ALIAS: Record<string, string> = {
  // Common-use native token sentinels for OKX cross-chain endpoints. The actual
  // address used by OKX varies by chain; we forward whatever the caller gave.
  ethereum: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  optimism: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  bsc: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  polygon: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  arbitrum: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  avalanche: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  base: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  solana: "11111111111111111111111111111111",
  sui: "0x2::sui::SUI",
};

function expandToken(token: string, chainName: string | undefined): string {
  if (!token) return token;
  if (token.toLowerCase() !== "native") return token;
  const key = (chainName ?? "").toLowerCase();
  return NATIVE_ALIAS[key] ?? token;
}

export async function runPrepareBridge(input: PrepareBridgeInput): Promise<PrepareBridgeResult> {
  const fromIndex = resolveChainIndex(input.fromChain);
  const toIndex = resolveChainIndex(input.toChain);
  if (!fromIndex) throw new Error(`Unknown source chain: ${input.fromChain}`);
  if (!toIndex) throw new Error(`Unknown destination chain: ${input.toChain}`);
  if (fromIndex === toIndex) {
    throw new Error("fromChain and toChain are the same — use prepare_swap for same-chain trades.");
  }

  const fromName = chainNameOf(fromIndex)?.toLowerCase();
  const toName = chainNameOf(toIndex)?.toLowerCase();
  const fromTokenAddress = expandToken(input.fromToken, fromName);
  const toTokenAddress = expandToken(input.toToken, toName);

  const deeplink = buildOkxBridgeDeepLink({
    fromChainIndex: fromIndex,
    toChainIndex: toIndex,
    fromTokenAddress,
    toTokenAddress,
    amount: input.amount,
    recipient: input.recipient,
  });

  const warnings: string[] = [];

  // Bridge requires a different (non-Sui) wallet for the source chain. We
  // surface that upfront so the chat reply doesn't promise a one-click flow.
  if (fromName && fromName !== "sui") {
    warnings.push(
      `Signing on ${fromName.toUpperCase()} requires a wallet that supports it (e.g. OKX Wallet). aisui only connects to Sui wallets in v1, so you'll complete the bridge in OKX Wallet.`,
    );
  }

  if (!env.okxBridgeEnabled() || !okxConfigured()) {
    return {
      available: false,
      unavailableReason: !okxConfigured()
        ? "OKX credentials are not configured."
        : "OKX bridge tool is disabled (set OKX_BRIDGE_ENABLED=true).",
      fromChain: { input: input.fromChain, chainIndex: fromIndex, name: fromName },
      toChain: { input: input.toChain, chainIndex: toIndex, name: toName },
      fromTokenAddress,
      toTokenAddress,
      amountIn: input.amount,
      alternates: [],
      recipient: input.recipient,
      okxWalletDeepLink: deeplink,
      warnings: [
        ...warnings,
        "Live OKX bridge quote unavailable — opening OKX Wallet directly is the safe fallback.",
      ],
    };
  }

  let amountOut: string | undefined;
  let bestRoute: BridgeRoute | undefined;
  let alternates: BridgeRoute[] = [];
  let estimatedTimeSec: number | undefined;

  try {
    const quote = await getOkxBridgeQuote({
      fromChainIndex: fromIndex,
      toChainIndex: toIndex,
      fromTokenAddress,
      toTokenAddress,
      amount: input.amount,
      slippageBps: input.slippageBps,
    });
    amountOut = quote.toTokenAmount;
    bestRoute = quote.bestRoute;
    alternates = quote.alternates;
    estimatedTimeSec = quote.estimatedTimeSec;
  } catch (err) {
    warnings.push(`OKX bridge quote unavailable (${(err as Error).message}). Showing deeplink only.`);
  }

  return {
    available: true,
    fromChain: { input: input.fromChain, chainIndex: fromIndex, name: fromName },
    toChain: { input: input.toChain, chainIndex: toIndex, name: toName },
    fromTokenAddress,
    toTokenAddress,
    amountIn: input.amount,
    amountOut,
    estimatedTimeSec,
    bestRoute,
    alternates,
    recipient: input.recipient,
    okxWalletDeepLink: deeplink,
    warnings,
  };
}

export const prepareBridgeTool = tool({
  description:
    "Plan a cross-chain transfer to/from Sui via OKX X Routing. Returns route, estimated output and a deeplink — the user signs the source-chain leg in OKX Wallet (aisui only connects to Sui wallets in v1). Use for 'bridge ETH to SUI', 'send USDC from Solana to Sui', etc.",
  inputSchema: prepareBridgeParams,
  execute: runPrepareBridge,
});
