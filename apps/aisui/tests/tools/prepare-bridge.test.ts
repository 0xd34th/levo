import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPrepareBridge } from "@/lib/tools/prepare-bridge";

const ORIGINAL = { ...process.env };

function installFetch(opts: { quoteFails?: boolean }) {
  const counters = { quote: 0 };
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/v6/dex/cross-chain/quote")) {
      counters.quote++;
      if (opts.quoteFails) {
        return new Response(JSON.stringify({ code: "50000", msg: "no route" }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            // V6 shape: routerList entries are flat — bridgeName, toTokenAmount,
            // estimateTime live on the entry itself, not under a nested `router`.
            {
              fromChainIndex: "1",
              toChainIndex: "784",
              fromTokenAmount: "10000000000000000",
              fromToken: { tokenSymbol: "ETH" },
              toToken: { tokenSymbol: "SUI" },
              routerList: [
                {
                  bridgeId: "636",
                  bridgeName: "cBridge",
                  toTokenAmount: "8000000000",
                  minimumReceived: "7920000000",
                  estimateTime: "180",
                  estimateGasFee: "1500000",
                  crossChainFee: "0.002",
                  priceImpactPercentage: "0.10",
                },
                {
                  bridgeId: "637",
                  bridgeName: "Wormhole",
                  toTokenAmount: "7980000000",
                  estimateTime: "240",
                },
              ],
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

describe("prepare_bridge", () => {
  beforeEach(() => {
    process.env.OKX_API_KEY = "k";
    process.env.OKX_SECRET_KEY = "s";
    process.env.OKX_API_PASSPHRASE = "p";
    process.env.OKX_PROJECT_ID = "pj";
    process.env.OKX_BRIDGE_ENABLED = "true";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("returns a quote with route metadata", async () => {
    const counters = installFetch({});
    const out = await runPrepareBridge({
      fromChain: "ethereum",
      toChain: "sui",
      fromToken: "native",
      toToken: "0x2::sui::SUI",
      amount: "10000000000000000" + Math.random(),
      slippageBps: 50,
    });
    expect(out.available).toBe(true);
    expect(out.fromChain.chainIndex).toBe("1");
    expect(out.toChain.chainIndex).toBe("784");
    expect(out.bestRoute?.bridgeName).toBe("cBridge");
    expect(out.alternates).toHaveLength(1);
    expect(out.amountOut).toBe("8000000000");
    expect(out.estimatedTimeSec).toBe(180);
    expect(out.okxWalletDeepLink).toContain("https://web3.okx.com/swap");
    expect(counters.quote).toBeGreaterThan(0);
  });

  it("rejects same-chain bridge", async () => {
    installFetch({});
    await expect(
      runPrepareBridge({
        fromChain: "ethereum",
        toChain: "ethereum",
        fromToken: "native",
        toToken: "native",
        amount: "1",
        slippageBps: 50,
      }),
    ).rejects.toThrow(/same/);
  });

  it("returns a deeplink-only result when OKX is not configured", async () => {
    delete process.env.OKX_API_KEY;
    delete process.env.OKX_SECRET_KEY;
    delete process.env.OKX_API_PASSPHRASE;
    delete process.env.OKX_PROJECT_ID;
    process.env.OKX_BRIDGE_ENABLED = "true";
    const out = await runPrepareBridge({
      fromChain: "ethereum",
      toChain: "sui",
      fromToken: "native",
      toToken: "0x2::sui::SUI",
      amount: "10000000000000000",
      slippageBps: 50,
    });
    expect(out.available).toBe(false);
    expect(out.unavailableReason).toMatch(/credentials/i);
    expect(out.okxWalletDeepLink).toContain("fromChainId=1");
    expect(out.okxWalletDeepLink).toContain("toChainId=784");
  });

  it("warns when the OKX quote endpoint errors", async () => {
    installFetch({ quoteFails: true });
    const out = await runPrepareBridge({
      fromChain: "ethereum",
      toChain: "sui",
      fromToken: "native",
      toToken: "0x2::sui::SUI",
      amount: "10000000000000000" + Math.random(),
      slippageBps: 50,
    });
    expect(out.available).toBe(true);
    expect(out.bestRoute).toBeUndefined();
    expect(out.warnings.some((w) => /OKX bridge quote/i.test(w))).toBe(true);
    expect(out.okxWalletDeepLink).toContain("https://web3.okx.com/swap");
  });

  it("rejects unknown chain hints", async () => {
    await expect(
      runPrepareBridge({
        fromChain: "narnia",
        toChain: "sui",
        fromToken: "native",
        toToken: "0x2::sui::SUI",
        amount: "1",
        slippageBps: 50,
      }),
    ).rejects.toThrow(/Unknown source chain/);
  });
});
