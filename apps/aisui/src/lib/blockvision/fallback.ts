/**
 * Centralised predicate for "this BlockVision failure should trigger a
 * fallback data source." Used by `get_portfolio`, `get_recent_activity`, and
 * `coin-metadata` so they all agree on what counts as fallbackable.
 *
 * BV returns:
 *  - 403  + "Your 30 trial requests have been used"  (Free trial cap)
 *  - 402                                              (some paid plans)
 *  - 429                                              (rate-limited bursts)
 *  - 5xx                                              (upstream outage)
 *
 * All four are recoverable by switching to OKX Wallet (for portfolio/activity)
 * or Sui RPC (for coin metadata).
 */
import { BlockVisionError } from "./client";

export type BvFallbackDecision = { ok: true; reason: string } | { ok: false };

export function bvFallbackDecision(err: unknown): BvFallbackDecision {
  if (err instanceof BlockVisionError) {
    if (err.status === 403) return { ok: true, reason: "BlockVision Free trial exhausted (403)" };
    if (err.status === 402) return { ok: true, reason: "BlockVision quota exhausted (402)" };
    if (err.status === 429) return { ok: true, reason: "BlockVision rate-limited (429)" };
    if (err.status >= 500) return { ok: true, reason: `BlockVision upstream ${err.status}` };
  }
  return { ok: false };
}
