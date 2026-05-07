/** OKX chainIndex constants and helpers. */

export const OKX_CHAIN = {
  ETHEREUM: "1",
  OPTIMISM: "10",
  BSC: "56",
  POLYGON: "137",
  ARBITRUM: "42161",
  AVALANCHE: "43114",
  BASE: "8453",
  SOLANA: "501",
  TON: "607",
  TRON: "195",
  SUI: "784",
} as const;

export type OkxChainName = keyof typeof OKX_CHAIN;
export type OkxChainIndex = (typeof OKX_CHAIN)[OkxChainName];

const NAME_BY_INDEX: Record<string, OkxChainName> = Object.fromEntries(
  Object.entries(OKX_CHAIN).map(([name, idx]) => [idx, name as OkxChainName]),
);

/** Resolve a user-friendly chain hint to an OKX chainIndex (e.g. "sui" → "784"). */
export function resolveChainIndex(input: string | number): OkxChainIndex | null {
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  // Direct chainIndex match.
  for (const idx of Object.values(OKX_CHAIN)) {
    if (s === idx) return idx as OkxChainIndex;
  }
  // Name match.
  const upper = s.toUpperCase();
  if (upper in OKX_CHAIN) return OKX_CHAIN[upper as OkxChainName];
  // Common aliases.
  switch (s) {
    case "eth":
    case "ethereum":
    case "mainnet":
      return OKX_CHAIN.ETHEREUM;
    case "sol":
      return OKX_CHAIN.SOLANA;
    case "matic":
      return OKX_CHAIN.POLYGON;
    case "arb":
      return OKX_CHAIN.ARBITRUM;
    case "avax":
      return OKX_CHAIN.AVALANCHE;
    case "bnb":
    case "binance":
      return OKX_CHAIN.BSC;
  }
  return null;
}

export function chainNameOf(index: string): OkxChainName | null {
  return NAME_BY_INDEX[index] ?? null;
}
