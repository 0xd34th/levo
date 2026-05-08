/**
 * Trust classification for portfolio coins.
 *
 * BlockVision pulls token prices from on-chain DEX pools, which means a
 * low-liquidity scam pool can produce a fake $X million USD value for an
 * airdropped dust token. We bucket coins so the headline portfolio total
 * can exclude obviously-suspect entries while still listing them on the card.
 *
 * Four buckets:
 *  - verified    — canonical coinType OR provider says verified=true → headline total
 *  - unverified  — unknown coin, low-value, no red flags → shown but not in headline
 *  - suspicious  — impersonation / unverified-high-value / implausible price → flagged
 *  - lp          — DEX liquidity-pool receipt token (e.g. AF_LP, KRIYA_LP). The
 *                  USD value is derived from pool reserves and is already covered
 *                  by `get_defi_positions`. Excluded from headline so it isn't
 *                  double-counted, but shown separately so the user knows it.
 */
import type { BVAccountCoin } from "@/lib/blockvision/types";
import cetusTrustedCoins from "./cetus-trusted-coins.json";

export type CoinTrust = "verified" | "unverified" | "suspicious" | "lp";

/** Hand-curated baseline: tokens we always trust regardless of upstream sources. */
const BASELINE_CANONICAL: readonly string[] = [
  "0x2::sui::SUI",
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC", // USDC native
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN", // USDC Wormhole
  "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN", // USDT Wormhole
  "0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT", // vSUI
  "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS", // CETUS
  "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN", // WETH Wormhole
];

/**
 * Canonical coinType set: union of the hand-curated baseline + Cetus's
 * `is_trusted` pool list (refreshed via `pnpm refresh:trusted-coins`).
 *
 * Why both:
 *  - Baseline guarantees coverage for the most-traded tokens even if the
 *    Cetus snapshot ages out or the script hasn't been run yet.
 *  - Cetus list catches the long tail of legitimate Sui tokens (~120 coins)
 *    that ship with real liquidity and have been reviewed by Cetus's curation.
 */
export const CANONICAL_COIN_TYPES: ReadonlySet<string> = new Set([
  ...BASELINE_CANONICAL,
  ...cetusTrustedCoins.coins.map((c) => c.address),
]);

/** Symbols protected against impersonation: an unknown coinType claiming any of
 *  these symbols is treated as a fake. */
const PROTECTED_SYMBOLS: ReadonlySet<string> = new Set([
  "SUI",
  "USDC",
  "USDT",
  "VSUI",
  "AFSUI",
  "HASUI",
  "CETUS",
  "WAL",
  "DEEP",
  "NS",
  "BLUE",
  "WETH",
  "WBTC",
]);

/**
 * DEX LP-token detection. Matched against the symbol AND the coinType because
 * different DEXes encode LP receipts differently:
 *  - Aftermath: `0x…::af_lp::AF_LP<…>`         (symbol AF_LP, module af_lp)
 *  - Kriya:     `0x…::spot_dex::KriyaLPToken<…>` (module match)
 *  - Bluefin / Turbos / others: vary; the symbol regex catches `*_LP*` / `*-LP*` / `LP_*`
 *
 * Conservative on purpose — we only want to match LP-shaped names. Tokens like
 * afSUI / vSUI / haSUI (liquid-staking, NOT pool LP) do not match because they
 * don't contain "LP" as a word boundary.
 */
const LP_SYMBOL_RE = /(?:^|[_\s-])LP(?:[_\s-]|$)/i;
const LP_COINTYPE_RE =
  /::(?:af_lp|lp_token|cetus_lp|kriya_lp|kriya_lp_token|turbos_lp|bluefin_lp|wrapped_lp|pool_token|pool_share|stake_position)\b/i;
const LP_SYMBOL_PREFIXES: readonly string[] = ["AF_LP", "KRIYA_LP", "BLUEFIN_LP", "TURBOS_LP"];

function isLpToken(coin: BVAccountCoin): boolean {
  const sym = (coin.symbol ?? "").toUpperCase();
  if (LP_SYMBOL_PREFIXES.some((p) => sym.startsWith(p))) return true;
  if (LP_SYMBOL_RE.test(sym)) return true;
  if (LP_COINTYPE_RE.test(coin.coinType ?? "")) return true;
  return false;
}

/** Unverified coin claiming more than this USD is treated as suspicious. */
const SUSPECT_USD_THRESHOLD = 50;

/** Implausible 24h price moves indicate manipulation. */
const SUSPECT_PRICE_CHANGE_HIGH = 5_000; // +5000% in 24h
const SUSPECT_PRICE_CHANGE_LOW = -99.5; // ~total wipeout

export interface CoinTrustVerdict {
  trust: CoinTrust;
  reason?: string;
}

export function classifyCoin(coin: BVAccountCoin): CoinTrustVerdict {
  // LP receipts are checked first — even if a provider marks them verified=true
  // they should not roll into the spot-portfolio total because they're already
  // tracked via `get_defi_positions` (and their price comes from pool reserves).
  if (isLpToken(coin)) {
    return { trust: "lp", reason: "DEX LP receipt — tracked in DeFi positions" };
  }

  if (CANONICAL_COIN_TYPES.has(coin.coinType)) return { trust: "verified" };

  const symbolUpper = (coin.symbol ?? "").toUpperCase();
  if (PROTECTED_SYMBOLS.has(symbolUpper)) {
    return {
      trust: "suspicious",
      reason: `Impersonates ${symbolUpper} (non-canonical coinType)`,
    };
  }

  if (coin.verified === true) return { trust: "verified" };

  const usd = coin.usdValue ?? 0;
  const change = coin.priceChangePercentage24H;
  if (
    change !== undefined &&
    Number.isFinite(change) &&
    (change > SUSPECT_PRICE_CHANGE_HIGH || change < SUSPECT_PRICE_CHANGE_LOW)
  ) {
    return {
      trust: "suspicious",
      reason: `Implausible 24h move (${change.toFixed(0)}%)`,
    };
  }

  if (usd > SUSPECT_USD_THRESHOLD) {
    return {
      trust: "suspicious",
      reason: `Unverified token claiming $${usd.toFixed(0)} value`,
    };
  }

  return { trust: "unverified" };
}
