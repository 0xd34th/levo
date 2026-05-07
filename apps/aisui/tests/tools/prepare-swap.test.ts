import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPrepareSwap } from "@/lib/tools/prepare-swap";

const SUI = "0x2::sui::SUI";
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

const ORIGINAL_ENV = { ...process.env };

interface ScenarioOpts {
  okxEnabled?: boolean;
  sevenkAmountOut?: string;
  okxAmountOut?: string;
  okxFails?: boolean;
  sevenkFails?: boolean;
  okxConfigured?: boolean;
}

function installFetchScenario(opts: ScenarioOpts) {
  const counters = { sevenkBuild: 0, okxQuote: 0, okxSwap: 0, sevenkQuote: 0 };
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/coin/detail")) {
      const isUsdc = u.includes("usdc");
      return new Response(
        JSON.stringify({
          code: 0,
          result: {
            coinType: isUsdc ? USDC : SUI,
            symbol: isUsdc ? "USDC" : "SUI",
            decimals: isUsdc ? 6 : 9,
          },
        }),
        { status: 200 },
      );
    }
    if (u.includes("/coin/market/pro")) {
      return new Response(JSON.stringify({ code: 0, result: { price: 4.2 } }), { status: 200 });
    }
    if (u.startsWith("https://aggregator-api.7k.ag/v1/quote")) {
      counters.sevenkQuote++;
      if (opts.sevenkFails) {
        return new Response("boom", { status: 502 });
      }
      return new Response(
        JSON.stringify({
          amountOut: opts.sevenkAmountOut ?? "4200000",
          amountOutMin: "4179000",
          priceImpactPct: 0.12,
          routes: [{ protocol: "Cetus", portion: 1 }],
        }),
        { status: 200 },
      );
    }
    if (u.startsWith("https://aggregator-api.7k.ag/v1/swap/tx")) {
      counters.sevenkBuild++;
      return new Response(JSON.stringify({ txBytes: "AA==" }), { status: 200 });
    }
    if (u.includes("/api/v6/dex/aggregator/quote")) {
      counters.okxQuote++;
      if (opts.okxFails) {
        return new Response(JSON.stringify({ code: "50111", msg: "Invalid sign" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              chainIndex: "784",
              fromTokenAmount: "1000000000",
              toTokenAmount: opts.okxAmountOut ?? "4300000",
              priceImpactPercent: "0.30",
              dexRouterList: [
                { dexProtocol: { dexName: "DeepBook", percent: "60" } },
                { dexProtocol: { dexName: "Cetus", percent: "40" } },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (u.includes("/api/v6/dex/aggregator/swap")) {
      counters.okxSwap++;
      if (opts.okxFails) {
        return new Response(JSON.stringify({ code: "50111", msg: "Invalid sign" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              chainIndex: "784",
              fromTokenAmount: "1000000000",
              toTokenAmount: opts.okxAmountOut ?? "4300000",
              priceImpactPercent: "0.30",
              dexRouterList: [{ dexProtocol: { dexName: "DeepBook", percent: "100" } }],
              tx: { txData: "BB==" },
            },
          ],
        }),
        { status: 200 },
      );
    }
    throw new Error("unexpected URL " + u);
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return counters;
}

function probe(): { tokenIn: string; tokenOut: string } {
  return {
    tokenIn: SUI + "?" + Math.random(),
    tokenOut: USDC + "?" + Math.random(),
  };
}

describe("prepare_swap", () => {
  beforeEach(() => {
    process.env.OKX_SWAP_ENABLED = "false";
    delete process.env.OKX_API_KEY;
    delete process.env.OKX_SECRET_KEY;
    delete process.env.OKX_API_PASSPHRASE;
    delete process.env.OKX_PROJECT_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("converts human amount to base units and returns a quote-only payload when no sender", async () => {
    const counters = installFetchScenario({});
    const ids = probe();

    const out = await runPrepareSwap({
      ...ids,
      amountIn: "1.0",
      slippageBps: 50,
    });
    expect(out.tokenIn.symbol).toBe("SUI");
    expect(out.tokenOut.symbol).toBe("USDC");
    expect(out.amountOutHuman).toBe("4.2");
    expect(out.amountOutMinHuman).toBe("4.179");
    expect(out.needsWallet).toBe(true);
    expect(counters.sevenkBuild).toBe(0);
    expect(out.source).toBe("sevenk");
    expect(out.alternatives).toHaveLength(0);
  });

  it("compares 7K and OKX, picks larger amountOut when OKX is enabled", async () => {
    process.env.OKX_API_KEY = "k";
    process.env.OKX_SECRET_KEY = "s";
    process.env.OKX_API_PASSPHRASE = "p";
    process.env.OKX_PROJECT_ID = "pj";
    process.env.OKX_SWAP_ENABLED = "true";

    const counters = installFetchScenario({ sevenkAmountOut: "4200000", okxAmountOut: "4300000" });
    const ids = probe();
    const out = await runPrepareSwap({ ...ids, amountIn: "1.0", slippageBps: 50 });

    expect(counters.okxQuote).toBeGreaterThan(0);
    expect(out.source).toBe("okx");
    expect(out.alternatives).toHaveLength(1);
    expect(out.alternatives[0].source).toBe("sevenk");
    expect(out.alternatives[0].diffPct).toBeLessThan(0); // worse than best
  });

  it("falls back to 7K if OKX errors", async () => {
    process.env.OKX_API_KEY = "k";
    process.env.OKX_SECRET_KEY = "s";
    process.env.OKX_API_PASSPHRASE = "p";
    process.env.OKX_PROJECT_ID = "pj";
    process.env.OKX_SWAP_ENABLED = "true";

    installFetchScenario({ okxFails: true });
    const ids = probe();
    const out = await runPrepareSwap({ ...ids, amountIn: "1.0", slippageBps: 50 });
    expect(out.source).toBe("sevenk");
    expect(out.warnings.some((w) => /OKX/.test(w))).toBe(true);
  });

  it("throws if both aggregators fail", async () => {
    process.env.OKX_API_KEY = "k";
    process.env.OKX_SECRET_KEY = "s";
    process.env.OKX_API_PASSPHRASE = "p";
    process.env.OKX_PROJECT_ID = "pj";
    process.env.OKX_SWAP_ENABLED = "true";

    installFetchScenario({ okxFails: true, sevenkFails: true });
    const ids = probe();
    await expect(
      runPrepareSwap({ ...ids, amountIn: "1.0", slippageBps: 50 }),
    ).rejects.toThrow(/aggregator/);
  });

  it("does not call OKX when OKX_SWAP_ENABLED is false even with creds", async () => {
    process.env.OKX_API_KEY = "k";
    process.env.OKX_SECRET_KEY = "s";
    process.env.OKX_API_PASSPHRASE = "p";
    process.env.OKX_PROJECT_ID = "pj";
    process.env.OKX_SWAP_ENABLED = "false";
    const counters = installFetchScenario({});
    const ids = probe();
    await runPrepareSwap({ ...ids, amountIn: "1.0", slippageBps: 50 });
    expect(counters.okxQuote).toBe(0);
    expect(counters.okxSwap).toBe(0);
  });
});
