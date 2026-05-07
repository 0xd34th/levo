/**
 * OKX cross-chain (bridge) quote helper.
 *
 * Endpoint: GET /api/v6/dex/cross-chain/quote
 * The response varies; we extract the best (cheapest / most output) router.
 *
 * V6 uses `fromChainIndex` / `toChainIndex` (V5 was `fromChainId` / `toChainId`).
 * Sui currently has no native non-Sui wallet integration in aisui — the user
 * is expected to complete the cross-chain leg in OKX Wallet. We return enough
 * metadata for the UI to render a card and a deeplink.
 */
import { okxGet } from "./client";
import { OkxApiError, type OkxBridgeQuoteRaw } from "./types";

const QUOTE_PATH = "/api/v6/dex/cross-chain/quote";

export interface BridgeQuoteRequest {
  fromChainIndex: string;
  toChainIndex: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string; // raw smallest units of fromToken
  slippageBps?: number;
}

export interface BridgeRoute {
  bridgeName: string;
  bridgeId?: string;
  fromChainNetworkFee?: string;
  toChainNetworkFee?: string;
  crossChainFee?: string;
}

export interface BridgeQuote {
  fromChainIndex: string;
  toChainIndex: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  estimatedTimeSec?: number;
  bestRoute: BridgeRoute;
  alternates: BridgeRoute[];
  /** OKX-side opaque payload, retained for diagnostics. */
  rawQuote: unknown;
}

function bpsToFraction(bps: number): string {
  // Cross-chain endpoint accepts a fractional slippage (0.01 = 1%).
  return (bps / 10000).toFixed(6);
}

function pickQuoteShape(raw: unknown): OkxBridgeQuoteRaw | null {
  if (Array.isArray(raw)) return (raw[0] as OkxBridgeQuoteRaw) ?? null;
  if (raw && typeof raw === "object") return raw as OkxBridgeQuoteRaw;
  return null;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

/**
 * V6 cross-chain shape (verified live):
 *   routerList[i] = {
 *     bridgeId, bridgeName, toTokenAmount, minimumReceived,
 *     estimateTime, estimateGasFee, crossChainFee, priceImpactPercentage, ...
 *   }
 * V5 used a nested `router.{bridgeName,bridgeId}` and per-route fee fields —
 * we accept either so partner deployments on either version still parse.
 */
function normaliseRoute(input: unknown): (BridgeRoute & { toTokenAmount?: string; estimateTimeSec?: number }) | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const router = record.router as Record<string, unknown> | undefined;
  const bridgeName =
    asString(record.bridgeName) ?? asString(router?.bridgeName) ?? "OKX Bridge";
  const bridgeIdNum =
    asString(record.bridgeId) ?? asString(router?.bridgeId);
  const estimateTime = asString(record.estimateTime);
  const estimateTimeSec = estimateTime ? Number.parseInt(estimateTime, 10) : undefined;
  return {
    bridgeName,
    bridgeId: bridgeIdNum,
    fromChainNetworkFee: asString(record.fromChainNetworkFee),
    toChainNetworkFee: asString(record.toChainNetworkFee) ?? asString(record.estimateGasFee),
    crossChainFee: asString(record.crossChainFee),
    toTokenAmount: asString(record.toTokenAmount) ?? asString(record.minimumReceived),
    estimateTimeSec: Number.isFinite(estimateTimeSec) ? estimateTimeSec : undefined,
  };
}

export async function getOkxBridgeQuote(req: BridgeQuoteRequest): Promise<BridgeQuote> {
  const params: Record<string, string> = {
    fromChainIndex: req.fromChainIndex,
    toChainIndex: req.toChainIndex,
    fromTokenAddress: req.fromTokenAddress,
    toTokenAddress: req.toTokenAddress,
    amount: req.amount,
    slippage: bpsToFraction(req.slippageBps ?? 100),
  };
  let raw: unknown;
  try {
    raw = await okxGet<unknown>(QUOTE_PATH, params, { ttl: 10, swr: 30 });
  } catch (err) {
    if (err instanceof OkxApiError) {
      throw new Error(`OKX bridge quote failed: ${err.message}`);
    }
    throw err;
  }

  const picked = pickQuoteShape(raw);
  if (!picked) throw new Error("OKX bridge quote returned empty payload");

  const routerList = Array.isArray(picked.routerList) ? picked.routerList : [];
  const routes = routerList
    .map((entry) => normaliseRoute(entry))
    .filter((r): r is NonNullable<ReturnType<typeof normaliseRoute>> => r !== null);

  if (routes.length === 0) {
    routes.push({ bridgeName: "OKX X Routing" });
  }

  // V6 puts toTokenAmount / estimateTime on each route. V5 had it at the top.
  // Fall back across both shapes.
  const best = routes[0];
  const topToTokenAmount =
    typeof picked.toTokenAmount === "string" ? picked.toTokenAmount : undefined;
  const topEstimatedTime =
    typeof picked.estimatedTime === "string"
      ? Number.parseInt(picked.estimatedTime, 10)
      : undefined;

  const bestRoute: BridgeRoute = {
    bridgeName: best.bridgeName,
    bridgeId: best.bridgeId,
    fromChainNetworkFee: best.fromChainNetworkFee,
    toChainNetworkFee: best.toChainNetworkFee,
    crossChainFee: best.crossChainFee,
  };

  return {
    fromChainIndex: req.fromChainIndex,
    toChainIndex: req.toChainIndex,
    fromTokenAmount: picked.fromTokenAmount ?? req.amount,
    toTokenAmount: best.toTokenAmount ?? topToTokenAmount ?? "0",
    estimatedTimeSec:
      best.estimateTimeSec ??
      (Number.isFinite(topEstimatedTime) ? topEstimatedTime : undefined),
    bestRoute,
    alternates: routes.slice(1).map((r) => ({
      bridgeName: r.bridgeName,
      bridgeId: r.bridgeId,
      fromChainNetworkFee: r.fromChainNetworkFee,
      toChainNetworkFee: r.toChainNetworkFee,
      crossChainFee: r.crossChainFee,
    })),
    rawQuote: raw,
  };
}

export interface BridgeDeepLinkInput {
  fromChainIndex: string;
  toChainIndex: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: string;
  recipient?: string;
}

/**
 * Best-effort deeplink to OKX Wallet's bridge page with parameters prefilled.
 * The exact URL spec is OKX-side; we keep this tolerant and clearly labelled.
 */
export function buildOkxBridgeDeepLink(input: BridgeDeepLinkInput): string {
  const url = new URL("https://web3.okx.com/swap");
  url.searchParams.set("fromChainId", input.fromChainIndex);
  url.searchParams.set("toChainId", input.toChainIndex);
  url.searchParams.set("fromTokenAddress", input.fromTokenAddress);
  url.searchParams.set("toTokenAddress", input.toTokenAddress);
  url.searchParams.set("amount", input.amount);
  url.searchParams.set("source", "aisui");
  if (input.recipient) url.searchParams.set("recipient", input.recipient);
  return url.toString();
}
