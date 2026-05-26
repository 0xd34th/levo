/** Subset of BlockVision Sui Indexing API response shapes used by tools. */

export interface BVCoinDetail {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  logo?: string;
  description?: string;
  totalSupply?: string;
  circulatingSupply?: string;
  holders?: number;
  verified?: boolean;
  scamFlag?: number;
}

export interface BVCoinMarket {
  coinType?: string;
  price?: number;
  priceInUsd?: string | number;
  priceChangePercentage24H?: number;
  priceChangePercentage1H?: number;
  priceChangePercentage7D?: number;
  priceChangePercentage30D?: number;
  marketCap?: string | number;
  fullyDilutedValue?: string | number;
  fdvInUsd?: string | number;
  volume24H?: string | number;
  liquidity?: string | number;
  liquidityInUsd?: string | number;
  circulating?: string;
  supply?: string;
  market?: {
    hour1?: { priceChange?: string | number };
    hour24?: { priceChange?: string | number };
    day7?: { priceChange?: string | number };
    day30?: { priceChange?: string | number };
  };
  high24H?: number;
  low24H?: number;
}

export interface BVOhlcvPoint {
  timestamp: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface BVAccountCoin {
  coinType: string;
  name?: string;
  symbol: string;
  decimals: number | string;
  balance: string;
  usdValue?: number | string;
  price?: number | string;
  priceChangePercentage24H?: number | string;
  logo?: string;
  verified?: boolean;
}

export interface BVAccountNftItem {
  objectId: string;
  type: string;
  name?: string;
  description?: string;
  image?: string;
  collection?: string;
  collectionName?: string;
  estimatedValueUsd?: number | string;
}

export interface BVAccountActivity {
  digest: string;
  timestamp: number; // ms
  sender: string;
  type?: string;
  status?: string;
  gasFee?: string;
  summary?: string;
  coinChanges?: Array<{ coinType: string; symbol?: string; amount: string; usdValue?: number }>;
  nftChanges?: Array<{ objectId: string; type: string; name?: string }>;
}

export interface BVDexPool {
  poolId: string;
  protocol: string;
  coinTypeA: string;
  coinTypeB: string;
  symbolA?: string;
  symbolB?: string;
  tvlUsd?: number;
  volume24HUsd?: number;
  fee?: number;
  apr?: number;
  priceChange24H?: number;
}

export interface BVDefiPosition {
  protocol: string;
  protocolLogo?: string;
  category?: string; // lend / lp / staking / vault
  positions: Array<{
    name?: string;
    valueUsd?: number;
    apr?: number;
    underlying?: Array<{ symbol: string; amount: string; usdValue?: number }>;
  }>;
}

export interface BVNftCollectionDetail {
  type: string;
  name: string;
  description?: string;
  image?: string;
  floorPrice?: number;
  floorPriceUsd?: number;
  totalSupply?: number;
  holders?: number;
  volume24H?: number;
  volume7D?: number;
  sales24H?: number;
  verified?: boolean;
}

export interface BVTrendingCoin {
  coinType: string;
  symbol: string;
  name?: string;
  logo?: string;
  price: number;
  priceChangePercentage24H?: number;
  volume24H?: number;
  marketCap?: number;
}
