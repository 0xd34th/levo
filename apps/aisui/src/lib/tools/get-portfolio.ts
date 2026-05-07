import { tool } from "ai";
import { z } from "zod";
import { bvGet } from "@/lib/blockvision/client";
import { bvFallbackDecision } from "@/lib/blockvision/fallback";
import type { BVAccountCoin, BVAccountNftItem } from "@/lib/blockvision/types";
import { resolveAddressOrName } from "@/lib/sui/names";
import { env, okxConfigured } from "@/lib/env";
import { getOkxSuiCoins, getOkxSuiNfts } from "@/lib/okx/wallet";
import { classifyCoin, type CoinTrust } from "@/lib/sui/coin-trust";

export const getPortfolioParams = z.object({
  addressOrName: z
    .string()
    .describe("0x address or .sui name. Required."),
  includeNfts: z.boolean().default(true),
  limit: z.number().int().min(1).max(50).default(20),
});

export type GetPortfolioInput = z.infer<typeof getPortfolioParams>;

export type PortfolioSource = "blockvision" | "okx";

export interface PortfolioResult {
  address: string;
  resolvedFrom?: string;
  source: PortfolioSource;
  fallbackReason?: string;
  /** Verified-bucket total. Safe to display as the headline portfolio value. */
  totalUsd: number;
  /** Sum of unverified low-value tokens (no red flags). Shown but not in headline. */
  unverifiedUsd: number;
  /** Sum of suspicious tokens (impersonation / unverified-high-value / extreme price). */
  suspectUsd: number;
  /** Number of coins flagged as suspicious. */
  suspectCount: number;
  /** Sum of DEX LP receipt tokens (tracked separately via get_defi_positions). */
  lpUsd: number;
  /** Number of LP tokens detected. */
  lpCount: number;
  coinCount: number;
  nftCount: number;
  topCoins: Array<{
    coinType: string;
    symbol: string;
    name?: string;
    decimals: number;
    balance: string;
    usdValue: number;
    price?: number;
    priceChange24H?: number;
    logo?: string;
    verified?: boolean;
    trust: CoinTrust;
    trustReason?: string;
  }>;
  topNfts: Array<{
    objectId: string;
    type: string;
    name?: string;
    image?: string;
    collection?: string;
    estimatedValueUsd?: number;
  }>;
}

interface PortfolioRaw {
  coins: BVAccountCoin[];
  nfts: BVAccountNftItem[];
  source: PortfolioSource;
  fallbackReason?: string;
}

export function okxFallbackEligible(): boolean {
  return env.okxFallbackEnabled() && okxConfigured();
}

async function fetchFromBlockvision(
  address: string,
  includeNfts: boolean,
  limit: number,
): Promise<PortfolioRaw> {
  const [coinsRes, nftsRes] = await Promise.all([
    bvGet<{ coins?: BVAccountCoin[]; data?: BVAccountCoin[] }>(
      "/account/coins",
      { account: address },
      { ttl: 30, swr: 60 },
    ),
    includeNfts
      ? bvGet<{ data?: BVAccountNftItem[]; items?: BVAccountNftItem[] }>(
          "/account/nfts",
          { account: address, pageSize: limit },
          { ttl: 60, swr: 180 },
        )
      : Promise.resolve<{ data?: BVAccountNftItem[]; items?: BVAccountNftItem[] }>({ data: [] }),
  ]);
  const coins = coinsRes.coins ?? coinsRes.data ?? [];
  const nftsAny = nftsRes as { items?: BVAccountNftItem[]; data?: BVAccountNftItem[] };
  const nfts = nftsAny.items ?? nftsAny.data ?? [];
  return { coins, nfts, source: "blockvision" };
}

async function fetchFromOkx(
  address: string,
  includeNfts: boolean,
  reason: string,
): Promise<PortfolioRaw> {
  const [coins, nfts] = await Promise.all([
    getOkxSuiCoins(address),
    includeNfts ? getOkxSuiNfts(address) : Promise.resolve<BVAccountNftItem[]>([]),
  ]);
  return { coins, nfts, source: "okx", fallbackReason: reason };
}

export async function runGetPortfolio(input: GetPortfolioInput): Promise<PortfolioResult> {
  const resolved = await resolveAddressOrName(input.addressOrName);
  if (!resolved) {
    throw new Error(`Could not resolve address or name: ${input.addressOrName}`);
  }

  let raw: PortfolioRaw;
  try {
    raw = await fetchFromBlockvision(resolved, input.includeNfts, input.limit);
  } catch (err) {
    const decision = bvFallbackDecision(err);
    if (decision.ok && okxFallbackEligible()) {
      raw = await fetchFromOkx(resolved, input.includeNfts, decision.reason);
    } else {
      throw err;
    }
  }

  const classified = raw.coins.map((c) => ({ coin: c, verdict: classifyCoin(c) }));

  let totalUsd = 0;
  let unverifiedUsd = 0;
  let suspectUsd = 0;
  let suspectCount = 0;
  let lpUsd = 0;
  let lpCount = 0;
  for (const { coin, verdict } of classified) {
    const usd = coin.usdValue ?? 0;
    switch (verdict.trust) {
      case "verified":
        totalUsd += usd;
        break;
      case "unverified":
        unverifiedUsd += usd;
        break;
      case "lp":
        lpUsd += usd;
        lpCount += 1;
        break;
      case "suspicious":
        suspectUsd += usd;
        suspectCount += 1;
        break;
    }
  }

  const sortedCoins = [...classified].sort(
    (a, b) => (b.coin.usdValue ?? 0) - (a.coin.usdValue ?? 0),
  );

  return {
    address: resolved,
    resolvedFrom: input.addressOrName !== resolved ? input.addressOrName : undefined,
    source: raw.source,
    fallbackReason: raw.fallbackReason,
    totalUsd,
    unverifiedUsd,
    suspectUsd,
    suspectCount,
    lpUsd,
    lpCount,
    coinCount: raw.coins.length,
    nftCount: raw.nfts.length,
    topCoins: sortedCoins.slice(0, input.limit).map(({ coin: c, verdict }) => ({
      coinType: c.coinType,
      symbol: c.symbol ?? "?",
      name: c.name,
      decimals: c.decimals ?? 9,
      balance: c.balance,
      usdValue: c.usdValue ?? 0,
      price: c.price,
      priceChange24H: c.priceChangePercentage24H,
      logo: c.logo,
      verified: c.verified,
      trust: verdict.trust,
      trustReason: verdict.reason,
    })),
    topNfts: raw.nfts.slice(0, input.limit).map((n) => ({
      objectId: n.objectId,
      type: n.type,
      name: n.name,
      image: n.image,
      collection: n.collectionName ?? n.collection,
      estimatedValueUsd: n.estimatedValueUsd,
    })),
  };
}

export const getPortfolioTool = tool({
  description:
    "Fetch wallet holdings (coins + NFTs) for a Sui address or .sui name. Use for 'show my portfolio' / 'what does <addr> hold'. Falls back to OKX Wallet API when BlockVision is rate-limited. `totalUsd` excludes suspicious tokens AND LP receipts; `suspectUsd`, `unverifiedUsd`, and `lpUsd` are reported separately so the UI can disclose them honestly. LP receipts (e.g. AF_LP) are tracked via `get_defi_positions`, not added to spot total.",
  inputSchema: getPortfolioParams,
  execute: runGetPortfolio,
});
