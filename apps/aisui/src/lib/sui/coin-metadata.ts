/**
 * Resolve coin metadata (symbol / decimals / name) with multi-source fallback.
 *
 * Order:
 *  1. BlockVision /coin/detail — richest payload (logo, scamFlag, holder count)
 *  2. Sui JSON-RPC sui_getCoinMetadata — free, on-chain, never rate-limited
 *
 * BV is preferred when available because it carries scamFlag / verified flags
 * that the swap warning logic depends on. When BV is rate-limited / quota-
 * exhausted (typical on Free tier after 30 calls/day), we still need to know
 * decimals to encode amounts — Sui RPC always serves that.
 */
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { bvGet } from "@/lib/blockvision/client";
import { bvFallbackDecision } from "@/lib/blockvision/fallback";
import { env } from "@/lib/env";
import type { BVCoinDetail } from "@/lib/blockvision/types";

/** Independent Sui client tied to the always-on public fullnode — never reuses
 *  SUI_RPC_URL because that may itself be the paid gateway that's failing. */
let publicSuiClient: SuiJsonRpcClient | null = null;
function publicRpcClient(): SuiJsonRpcClient {
  if (!publicSuiClient) {
    publicSuiClient = new SuiJsonRpcClient({ url: env.suiRpcPublicFallback(), network: "mainnet" });
  }
  return publicSuiClient;
}

export interface CoinMetadata {
  coinType: string;
  symbol: string;
  decimals: number;
  name?: string;
  logo?: string;
  scamFlag?: number;
  verified?: boolean;
  /** Where the metadata came from. */
  source: "blockvision" | "sui-rpc";
}


async function viaBlockvision(coinType: string): Promise<CoinMetadata> {
  const detail = await bvGet<BVCoinDetail>(
    "/coin/detail",
    { coinType },
    { ttl: 600, swr: 1800 },
  );
  return {
    coinType,
    symbol: detail.symbol ?? "?",
    decimals: detail.decimals ?? 9,
    name: detail.name,
    logo: detail.logo,
    scamFlag: detail.scamFlag,
    verified: detail.verified,
    source: "blockvision",
  };
}

async function viaSuiRpc(coinType: string): Promise<CoinMetadata> {
  const meta = await publicRpcClient().getCoinMetadata({ coinType });
  if (!meta) {
    throw new Error(`No on-chain CoinMetadata for ${coinType}`);
  }
  return {
    coinType,
    symbol: meta.symbol ?? "?",
    decimals: meta.decimals ?? 9,
    name: meta.name ?? undefined,
    logo: meta.iconUrl ?? undefined,
    source: "sui-rpc",
  };
}

/**
 * Best-effort metadata lookup. Throws only when both sources fail (which
 * almost certainly means the coinType doesn't exist on chain).
 */
export async function resolveCoinMetadata(coinType: string): Promise<CoinMetadata> {
  try {
    return await viaBlockvision(coinType);
  } catch (err) {
    if (!bvFallbackDecision(err).ok) throw err;
    try {
      return await viaSuiRpc(coinType);
    } catch {
      // Surface the BV error first — that's the actionable one for ops.
      throw err;
    }
  }
}
