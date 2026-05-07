/** OKX API common response shapes. */

export interface OkxEnvelope<T> {
  code: string;
  msg?: string;
  /** OKX returns either a top-level array or object under `data`. */
  data?: T;
}

export class OkxApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly endpoint: string,
  ) {
    super(message);
    this.name = "OkxApiError";
  }
}

export class OkxNotConfiguredError extends Error {
  constructor() {
    super(
      "OKX integration is not configured. Set OKX_API_KEY / OKX_SECRET_KEY / OKX_API_PASSPHRASE / OKX_PROJECT_ID.",
    );
    this.name = "OkxNotConfiguredError";
  }
}

/** Minimal swap quote shape returned by OKX DEX V6 aggregator. */
export interface OkxDexQuoteRaw {
  chainIndex?: string;
  /** Legacy V5 alias for chainIndex; kept for forward / backward compatibility. */
  chainId?: string;
  fromTokenAmount?: string;
  toTokenAmount?: string;
  fromTokenUsd?: string;
  toTokenUsd?: string;
  estimateGasFee?: string;
  /** V6 field name. V5 was `priceImpactPercentage`; we keep both for tolerance. */
  priceImpactPercent?: string;
  priceImpactPercentage?: string;
  /** V6 hop list. Each entry includes a `dexProtocol: { dexName, percent }`. */
  dexRouterList?: unknown[];
  fromToken?: { tokenSymbol?: string; decimal?: string; tokenContractAddress?: string; tokenUnitPrice?: string };
  toToken?: { tokenSymbol?: string; decimal?: string; tokenContractAddress?: string; tokenUnitPrice?: string };
  tradeFee?: string;
  swapMode?: string;
}

export interface OkxSwapTxRaw {
  data?: string;
  to?: string;
  value?: string;
  gas?: string;
  gasPrice?: string;
  /** Sui-shaped serialised tx bytes (base64). */
  txData?: string;
  txBytes?: string;
}

/** OKX cross-chain quote shape (subset). */
export interface OkxBridgeQuoteRaw {
  fromChainId?: string;
  toChainId?: string;
  fromTokenAmount?: string;
  toTokenAmount?: string;
  estimatedTime?: string;
  routerList?: Array<{
    router?: { bridgeName?: string; bridgeId?: string };
    fromChainNetworkFee?: string;
    toChainNetworkFee?: string;
    crossChainFee?: string;
  }>;
}

/** Wallet API token balance row. */
export interface OkxTokenBalance {
  tokenAddress?: string;
  symbol?: string;
  balance?: string;
  /** Human-readable USD value. */
  tokenPrice?: string;
  rawBalance?: string;
  decimals?: string;
  isRiskToken?: boolean;
}

/** Wallet API transaction history row. */
export interface OkxTransactionRow {
  chainIndex?: string;
  txHash?: string;
  txTime?: string;
  txStatus?: string;
  amount?: string;
  symbol?: string;
  txType?: string;
  fromAddress?: string;
  toAddress?: string;
  hitBlacklist?: boolean;
  itype?: string;
  // remainder is provider-specific
}
