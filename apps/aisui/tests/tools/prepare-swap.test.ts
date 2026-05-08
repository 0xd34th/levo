import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPrepareSwap } from "@/lib/tools/prepare-swap";

const SUI = "0x2::sui::SUI";
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

const ORIGINAL_ENV = { ...process.env };

interface ScenarioOpts {
  sevenkAmountOut?: string;
  sevenkFails?: boolean;
}

function installFetchScenario(opts: ScenarioOpts) {
  const counters = { sevenkBuild: 0, sevenkQuote: 0 };
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
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  beforeEach(() => {
    vi.restoreAllMocks();
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

  it("throws when 7K returns no quote", async () => {
    installFetchScenario({ sevenkFails: true });
    const ids = probe();
    await expect(
      runPrepareSwap({ ...ids, amountIn: "1.0", slippageBps: 50 }),
    ).rejects.toThrow(/aggregator/);
  });
});
