/** Central tool registry. Wired into the chat route + tool runtime fixtures. */
import { getTokenMetricsTool, runGetTokenMetrics } from "./get-token-metrics";
import { getPortfolioTool, runGetPortfolio } from "./get-portfolio";
import { getDefiPositionsTool, runGetDefiPositions } from "./get-defi-positions";
import { getRecentActivityTool, runGetRecentActivity } from "./get-recent-activity";
import { getTrendingTool, runGetTrending } from "./get-trending";
import { getNftCollectionTool, runGetNftCollection } from "./get-nft-collection";
import { getObjectTool, runGetObject } from "./get-object";
import { explainTxTool, runExplainTx } from "./explain-tx";
import { prepareSwapTool, runPrepareSwap } from "./prepare-swap";
import { prepareTransferTool, runPrepareTransfer } from "./prepare-transfer";
import { suggestFollowupsTool } from "./suggest-followups";

export const tools = {
  get_token_metrics: getTokenMetricsTool,
  get_portfolio: getPortfolioTool,
  get_defi_positions: getDefiPositionsTool,
  get_recent_activity: getRecentActivityTool,
  get_trending: getTrendingTool,
  get_nft_collection: getNftCollectionTool,
  get_object: getObjectTool,
  explain_tx: explainTxTool,
  prepare_swap: prepareSwapTool,
  prepare_transfer: prepareTransferTool,
  suggest_followups: suggestFollowupsTool,
} as const;

export type ToolName = keyof typeof tools;

/** Direct callable variants for tests / non-LLM access. */
export const runners = {
  get_token_metrics: runGetTokenMetrics,
  get_portfolio: runGetPortfolio,
  get_defi_positions: runGetDefiPositions,
  get_recent_activity: runGetRecentActivity,
  get_trending: runGetTrending,
  get_nft_collection: runGetNftCollection,
  get_object: runGetObject,
  explain_tx: runExplainTx,
  prepare_swap: runPrepareSwap,
  prepare_transfer: runPrepareTransfer,
} as const;
