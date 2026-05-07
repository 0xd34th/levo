/* eslint-disable no-console */
/**
 * Manual smoke test — calls real OKX V6 + V5 wallet against the user's
 * credentials. Three sub-tests:
 *   1. Swap dual-source comparison (7K vs OKX) via prepare_swap runner.
 *   2. OKX wallet API direct (balances + tx history) against a real Sui addr.
 *   3. OKX cross-chain bridge quote (USDC ETH→SUI).
 *
 * Run: OKX_SWAP_ENABLED=true OKX_FALLBACK_ENABLED=true OKX_BRIDGE_ENABLED=true \
 *      pnpm dlx tsx --env-file=.env tests/okx/live-smoke.ts
 */
import { runPrepareSwap } from "@/lib/tools/prepare-swap";
import { getOkxSwapQuote } from "@/lib/sui/aggregators/okx";
import { getSwapQuote as get7kQuote } from "@/lib/sui/aggregators/7k";
import { getOkxSuiCoins, getOkxSuiActivities } from "@/lib/okx/wallet";
import { runPrepareBridge } from "@/lib/tools/prepare-bridge";
import { runGetPortfolio } from "@/lib/tools/get-portfolio";
import { runGetRecentActivity } from "@/lib/tools/get-recent-activity";

const SUI = "0x2::sui::SUI";
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

// Override with `SMOKE_SUI_ADDRESS=0x...` for a wallet you actually want to
// inspect. The default we ship with works against any chain-aware OKX env;
// passing `Wallet not exist` just means the address has no on-chain footprint
// in OKX's index — pipeline still validated, just no data to print.
const SAMPLE_SUI_ADDRESS =
  process.env.SMOKE_SUI_ADDRESS ??
  // Mysten Foundation reserve (verifiable on suivision).
  "0x6e9a5a83b5f57b1f76b4a55f0ceb3f0baef7a82d1d3bfd47f5b4ab2cda0f6fa1";

function header(title: string) {
  console.log("\n" + "═".repeat(72));
  console.log(title);
  console.log("═".repeat(72));
}

async function step1_swap() {
  header("1. Swap dual-source comparison (7K vs OKX X Routing)");
  console.log("→ Quote 1 SUI → USDC, slippage 50 bps");

  const [okxOnly, sevenkOnly] = await Promise.allSettled([
    getOkxSwapQuote({ tokenIn: SUI, tokenOut: USDC, amountIn: "1000000000", slippageBps: 50 }),
    get7kQuote({ tokenIn: SUI, tokenOut: USDC, amountIn: "1000000000", slippageBps: 50 }),
  ]);
  if (okxOnly.status === "fulfilled") {
    console.log(
      `  OKX  amountOut=${okxOnly.value.amountOut} priceImpactPct=${okxOnly.value.priceImpactPct}`,
    );
    console.log(`       routes=${JSON.stringify(okxOnly.value.routes)}`);
  } else {
    console.log("  OKX  FAILED:", okxOnly.reason?.message ?? okxOnly.reason);
  }
  if (sevenkOnly.status === "fulfilled") {
    console.log(
      `  7K   amountOut=${sevenkOnly.value.amountOut} priceImpactPct=${sevenkOnly.value.priceImpactPct}`,
    );
    console.log(`       routes=${JSON.stringify(sevenkOnly.value.routes)}`);
  } else {
    console.log("  7K   FAILED:", sevenkOnly.reason?.message ?? sevenkOnly.reason);
  }

  console.log("\n→ runPrepareSwap (full pipeline, picks best, derives min-out + USD)");
  try {
    const out = await runPrepareSwap({
      tokenIn: SUI,
      tokenOut: USDC,
      amountIn: "1.0",
      slippageBps: 50,
    });
    console.log(`  best source       : ${out.source} (${out.sourceLabel})`);
    console.log(`  amountIn → out    : ${out.amountInHuman} ${out.tokenIn.symbol} → ${out.amountOutHuman} ${out.tokenOut.symbol}`);
    console.log(`  amountOutMin      : ${out.amountOutMinHuman} ${out.tokenOut.symbol}`);
    console.log(`  priceImpactPct    : ${out.priceImpactPct}`);
    console.log(`  alternatives      : ${out.alternatives.length}`);
    for (const alt of out.alternatives) {
      console.log(`    · ${alt.sourceLabel}: ${alt.amountOutHuman} (diff ${alt.diffPct?.toFixed(3)}%)`);
    }
    console.log(`  warnings          : ${out.warnings.length === 0 ? "none" : out.warnings.join(" | ")}`);
  } catch (err) {
    console.log("  runPrepareSwap FAILED:", (err as Error).message);
  }
}

async function step2_wallet() {
  header("2. OKX Wallet API direct (Sui address)");
  console.log(`→ address ${SAMPLE_SUI_ADDRESS}`);
  try {
    const coins = await getOkxSuiCoins(SAMPLE_SUI_ADDRESS);
    console.log(`  coins             : ${coins.length}`);
    for (const c of coins.slice(0, 5)) {
      console.log(
        `    · ${c.symbol.padEnd(8)} balance=${c.balance} usdValue=${c.usdValue?.toFixed(4) ?? "—"} verified=${c.verified ?? "—"}`,
      );
    }
  } catch (err) {
    console.log("  balances FAILED   :", (err as Error).message);
  }
  try {
    const acts = await getOkxSuiActivities(SAMPLE_SUI_ADDRESS, { limit: 5 });
    console.log(`  recent txs        : ${acts.length}`);
    for (const a of acts.slice(0, 3)) {
      console.log(
        `    · ${(a.digest ?? "—").slice(0, 14)}… type=${a.type ?? "—"} status=${a.status ?? "—"}`,
      );
    }
  } catch (err) {
    console.log("  tx history FAILED :", (err as Error).message);
  }
}

async function step2b_portfolio_fallback() {
  header("2b. get_portfolio + get_recent_activity (BV → OKX fallback path)");
  console.log(`→ address ${SAMPLE_SUI_ADDRESS}`);
  try {
    const portfolio = await runGetPortfolio({
      addressOrName: SAMPLE_SUI_ADDRESS,
      includeNfts: true,
      limit: 5,
    });
    console.log(`  source            : ${portfolio.source}`);
    console.log(`  fallbackReason    : ${portfolio.fallbackReason ?? "(BV succeeded)"}`);
    console.log(`  totalUsd          : $${portfolio.totalUsd.toFixed(2)}`);
    console.log(`  coinCount         : ${portfolio.coinCount}`);
    for (const c of portfolio.topCoins.slice(0, 3)) {
      console.log(`    · ${c.symbol.padEnd(8)} usd=${c.usdValue.toFixed(2)} bal=${c.balance}`);
    }
  } catch (err) {
    console.log("  portfolio FAILED  :", (err as Error).message);
  }
  try {
    const acts = await runGetRecentActivity({ addressOrName: SAMPLE_SUI_ADDRESS, limit: 5 });
    console.log(`  activity source   : ${acts.source}`);
    console.log(`  fallbackReason    : ${acts.fallbackReason ?? "(BV succeeded)"}`);
    console.log(`  count             : ${acts.count}`);
  } catch (err) {
    console.log("  activity FAILED   :", (err as Error).message);
  }
}

async function step3_bridge() {
  header("3. OKX cross-chain bridge quote (USDC ETH → USDC Polygon)");
  // ETH→SUI via OKX returned 'Insufficient liquidity' at smoke-time; ETH→Polygon
  // is a much deeper-liquidity route that exercises the same code paths.
  try {
    const out = await runPrepareBridge({
      fromChain: "ethereum",
      toChain: "polygon",
      fromToken: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", // USDC on ETH
      toToken: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359", // USDC on Polygon
      amount: "10000000", // 10 USDC (6 decimals)
      slippageBps: 100,
    });
    console.log(`  available         : ${out.available}`);
    console.log(`  fromChain         : ${out.fromChain.name}/${out.fromChain.chainIndex}`);
    console.log(`  toChain           : ${out.toChain.name}/${out.toChain.chainIndex}`);
    console.log(`  amountIn → out    : ${out.amountIn} → ${out.amountOut ?? "—"}`);
    console.log(`  estimatedTimeSec  : ${out.estimatedTimeSec ?? "—"}`);
    console.log(`  bestRoute         : ${out.bestRoute?.bridgeName ?? "—"}`);
    console.log(`  alternates        : ${out.alternates.length}`);
    console.log(`  deeplink          : ${out.okxWalletDeepLink.slice(0, 100)}...`);
    console.log(`  warnings          : ${out.warnings.length === 0 ? "none" : out.warnings.join(" | ")}`);
    if (out.unavailableReason) console.log(`  unavailableReason : ${out.unavailableReason}`);
  } catch (err) {
    console.log("  bridge FAILED     :", (err as Error).message);
  }
}

async function main() {
  await step1_swap();
  await step2_wallet();
  await step2b_portfolio_fallback();
  await step3_bridge();
  header("DONE");
}

main().catch((err) => {
  console.error("LIVE SMOKE FAILED:", err);
  process.exit(1);
});
