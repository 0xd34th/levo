/**
 * Centralised predicate for "this BlockVision failure should be treated as a
 * recoverable outage." Used by `coin-metadata` (which falls back to Sui RPC)
 * and by `get_token_metrics` / `get_defi_positions` to surface a
 * `fallbackReason` to the user when the upstream is degraded.
 *
 * BV returns:
 *  - 403  + "Your 30 trial requests have been used"  (Free trial cap)
 *  - 402                                              (some paid plans)
 *  - 429                                              (rate-limited bursts)
 *  - 5xx                                              (upstream outage)
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
