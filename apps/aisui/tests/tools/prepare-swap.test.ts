import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPrepareSwap } from "@/lib/tools/prepare-swap";

const SUI = "0x2::sui::SUI";
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

const ORIGINAL_ENV = { ...process.env };

interface MetaOpts {
  inSymbol?: string;
  outSymbol?: string;
  inDecimals?: number;
  outDecimals?: number;
  inScam?: boolean;
  outScam?: boolean;
}

function installFetchScenario(opts: MetaOpts = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/coin/detail")) {
      const isUsdc = u.includes("usdc");
      return new Response(
        JSON.stringify({
          code: 0,
          result: {
            coinType: isUsdc ? USDC : SUI,
            symbol: isUsdc ? opts.outSymbol ?? "USDC" : opts.inSymbol ?? "SUI",
            decimals: isUsdc ? opts.outDecimals ?? 6 : opts.inDecimals ?? 9,
            scamFlag: (isUsdc ? opts.outScam : opts.inScam) ? 1 : 0,
          },
        }),
        { status: 200 },
      );
    }
    throw new Error("unexpected URL " + u);
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
}

function probe(): { tokenIn: string; tokenOut: string } {
  // Cache-busting suffix: resolveCoinMetadata caches by coinType, and we want
  // a fresh fetch per test so symbol/decimals overrides take effect.
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

  it("resolves token coinTypes + decimals and echoes the suggested amount", async () => {
    installFetchScenario();
    const ids = probe();

    const out = await runPrepareSwap({
      ...ids,
      amountIn: "1.0",
      slippageBps: 50,
    });
    expect(out.tokenIn.symbol).toBe("SUI");
    expect(out.tokenIn.decimals).toBe(9);
    expect(out.tokenOut.symbol).toBe("USDC");
    expect(out.tokenOut.decimals).toBe(6);
    expect(out.amountInHuman).toBe("1.0");
    expect(out.amountInRaw).toBe("1000000000");
    expect(out.slippageBps).toBe(50);
    expect(out.warnings).toEqual([]);
  });

  it("converts a fractional amount with token decimals (USDC, 6dp)", async () => {
    installFetchScenario();
    const ids = probe();
    const out = await runPrepareSwap({
      tokenIn: ids.tokenOut, // USDC, 6dp
      tokenOut: ids.tokenIn, // SUI
      amountIn: "0.123456",
      slippageBps: 100,
    });
    expect(out.tokenIn.decimals).toBe(6);
    expect(out.amountInRaw).toBe("123456");
  });

  it("returns empty amountInRaw when input is unparseable", async () => {
    installFetchScenario();
    const ids = probe();
    const out = await runPrepareSwap({ ...ids, amountIn: "one", slippageBps: 50 });
    expect(out.amountInRaw).toBe("");
  });

  it("warns on a scam-flagged input token", async () => {
    installFetchScenario({ inSymbol: "SCAMSUI", inScam: true });
    const ids = probe();
    const out = await runPrepareSwap({ ...ids, amountIn: "1", slippageBps: 50 });
    expect(out.warnings.some((w) => w.toLowerCase().includes("suspicious"))).toBe(true);
  });

  it("warns on an unparseable amount but still returns token info", async () => {
    installFetchScenario();
    const ids = probe();
    const out = await runPrepareSwap({ ...ids, amountIn: "one", slippageBps: 50 });
    expect(out.tokenIn.symbol).toBe("SUI");
    expect(out.warnings.some((w) => w.toLowerCase().includes("parse"))).toBe(true);
  });
});
