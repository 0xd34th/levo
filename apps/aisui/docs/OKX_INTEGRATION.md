# OKX Web3 Integration

aisui integrates the OKX OS / Web3 API stack as a complement (and fallback) to
the BlockVision-driven Sui data path. This doc covers credential setup, the
three subsystems we wire up (DEX swap, Wallet API, cross-chain bridge), and
the safety switches.

## What it powers

| Subsystem | Tool / endpoint | Behaviour without OKX |
|---|---|---|
| Swap aggregator (Sui) | `prepare_swap` → `/api/v6/dex/aggregator/{quote,swap}` (in `src/lib/sui/aggregators/okx.ts`) | Falls back to 7K Aggregator only |
| Portfolio fallback | `get_portfolio` / `get_recent_activity` → `/api/v5/wallet/asset/all-token-balances-by-address` + `/api/v5/wallet/post-transaction/transactions` (`src/lib/okx/wallet.ts`) | BlockVision only; throws when its 30/day quota is exhausted |
| Cross-chain bridge | `prepare_bridge` → `/api/v6/dex/cross-chain/quote` (`src/lib/tools/prepare-bridge.ts`) | Returns deeplink only — quote unavailable |

**API version notes**

* OKX **deprecated V5 DEX endpoints in 2025**; we use V6 throughout (`/api/v6/dex/...`). Calling V5 returns a `50050` deprecation warning.
* OKX **Wallet API stays on V5** — `/api/v5/wallet/...` is still the supported path. V6 `wallet/*` returns 404.
* Cross-chain quote uses `fromChainIndex` / `toChainIndex` (V5 was `fromChainId` / `toChainId`).
* Slippage encoding for the swap aggregator changed from a fraction (`0.005`) to a percent (`0.5`) — the parameter is `slippagePercent`. Cross-chain quote still uses fractional `slippage`.
* Tx history takes `accountId` (not `address`) on the V5 Wallet endpoint.

All three require the same 4-piece credential set. Each has an independent
on/off switch so you can enable them piecewise.

## Credentials (4-piece set)

OKX OS credentials are issued per project. Get them from
<https://web3.okx.com/build>.

| Env var | Purpose |
|---|---|
| `OKX_API_KEY` | Identifies your project (header `OK-ACCESS-KEY`) |
| `OKX_SECRET_KEY` | HMAC-SHA256 secret used to sign every request |
| `OKX_API_PASSPHRASE` | Passphrase you set when creating the API key |
| `OKX_PROJECT_ID` | Sent as header `OK-ACCESS-PROJECT` |
| `OKX_BASE_URL` | Optional. Defaults to `https://web3.okx.com` |

If any of the 4 required variables is missing, every OKX call short-circuits
to a `OkxNotConfiguredError`. The `okxConfigured()` helper in `src/lib/env.ts`
reflects this state.

## Feature switches

```env
OKX_SWAP_ENABLED=false       # prepare_swap compares 7K + OKX X Routing
OKX_FALLBACK_ENABLED=false   # get_portfolio / get_recent_activity → OKX on BV failure
OKX_BRIDGE_ENABLED=false     # prepare_bridge cross-chain quotes
```

All switches default to `false`. Recommended rollout:

1. Configure all 4 credentials, set `OKX_SWAP_ENABLED=true` first — flip
   `OKX_SWAP_ENABLED=false` again if quotes look off.
2. Enable `OKX_FALLBACK_ENABLED` next — only fires when BlockVision returns
   429 / 402 / 5xx, so the blast radius is small.
3. Enable `OKX_BRIDGE_ENABLED` last — bridges always show a deeplink even
   when the live quote endpoint fails.

## Signing

`src/lib/okx/auth.ts` implements OKX's V5 signing convention:

```
prehash   = ISO_TIMESTAMP + METHOD + REQUEST_PATH + RAW_BODY
signature = base64(hmac-sha256(prehash, OKX_SECRET_KEY))
```

* `ISO_TIMESTAMP` is `new Date().toISOString()` (millisecond precision UTC).
* `METHOD` is upper-case (`GET` or `POST`).
* `REQUEST_PATH` includes the leading slash AND the encoded query string.
* `RAW_BODY` is the exact JSON string we send on the wire (empty for GET).

The query string is built deterministically (alphabetised, URL-encoded) so the
signature is byte-stable across retries. See `tests/okx/auth.test.ts` for the
canonical fixture vector.

## Rate limits

* `src/lib/cache/store.ts` SWR cache (TTL 30s, swr 60s by default) absorbs
  hot-path traffic.
* `src/lib/okx/quota.ts` enforces a per-fingerprint per-day cap
  (`DAILY_FREE_OKX_CALLS`, default 200). Wire it into routes that you expect
  abuse on.

## Quick smoke test

The repo ships a one-shot script that exercises the full
sign → fetch → schema-parse path against live OKX V6:

```bash
OKX_SWAP_ENABLED=true pnpm dlx tsx --env-file=.env tests/okx/live-smoke.ts
# Expected output:
# → OKX V6 quote: 1 SUI → USDC
#   source            : okx
#   amountOut (raw)   : 943050
#   priceImpactPct    : -0.04
#   routes            : [{"protocol":"Bluefin","portion":100}, ...]
```

In the app, ask `"swap 0.1 SUI to USDC"` — `SwapCard.subtitle` reads
`via OKX X Routing` when OKX outprices 7K, and the alternates fold-out lists
both quotes with the diff %. Response header `x-aisui-mcp-tools` reflects
how many remote MCP tools were merged in (defaults to `0`).
