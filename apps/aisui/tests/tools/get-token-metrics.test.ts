import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGetTokenMetrics } from "@/lib/tools/get-token-metrics";

const ORIGINAL_ENV = { ...process.env };

const FIXTURE_DETAIL = {
  coinType: "0x2::sui::SUI",
  name: "Sui",
  symbol: "SUI",
  decimals: 9,
  holders: 1234567,
  verified: true,
};
const FIXTURE_MARKET = {
  coinType: "0x2::sui::SUI",
  price: 4.21,
  priceChangePercentage24H: 2.7,
  marketCap: 12_000_000_000,
  volume24H: 350_000_000,
};
const FIXTURE_OHLCV = [
  { timestamp: 1700000000, open: 4.0, high: 4.3, low: 3.95, close: 4.21, volume: 1000 },
  { timestamp: 1700003600, open: 4.21, high: 4.25, low: 4.18, close: 4.2, volume: 800 },
];

describe("get_token_metrics", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.OKX_SWAP_ENABLED = "false";
    delete process.env.OKX_API_KEY;
    delete process.env.OKX_SECRET_KEY;
    delete process.env.OKX_API_PASSPHRASE;
    delete process.env.OKX_PROJECT_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("normalises BV responses into TokenMetricsResult", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/coin/detail")) {
        return new Response(JSON.stringify({ code: 0, result: FIXTURE_DETAIL }), { status: 200 });
      }
      if (url.includes("/coin/market/pro")) {
        return new Response(JSON.stringify({ code: 0, result: FIXTURE_MARKET }), { status: 200 });
      }
      if (url.includes("/coin/ohlcv")) {
        return new Response(JSON.stringify({ code: 0, result: FIXTURE_OHLCV }), { status: 200 });
      }
      throw new Error("unexpected URL " + url);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const out = await runGetTokenMetrics({
      coinType: "0x2::sui::SUI:fixture-" + Math.random(), // unique to bypass cache from prior runs
      window: "24H",
    });
    expect(out.symbol).toBe("SUI");
    expect(out.price).toBeCloseTo(4.21);
    expect(out.priceSource).toBe("blockvision");
    expect(out.unavailable).toBeUndefined();
    expect(out.priceChange24H).toBeCloseTo(2.7);
    expect(out.ohlcv.length).toBe(2);
    expect(out.ohlcv[0]).toMatchObject({ o: 4.0, c: 4.21 });
  });

  it("falls back to OKX X Routing for spot price when BV market is down (no hallucination)", async () => {
    process.env.OKX_API_KEY = "k";
    process.env.OKX_SECRET_KEY = "s";
    process.env.OKX_API_PASSPHRASE = "p";
    process.env.OKX_PROJECT_ID = "pj";
    process.env.OKX_SWAP_ENABLED = "true";

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/coin/detail")) {
        // BV detail OK so we have decimals (covers the symbol-name path).
        return new Response(JSON.stringify({ code: 0, result: FIXTURE_DETAIL }), { status: 200 });
      }
      if (url.includes("/coin/market/pro")) {
        return new Response(JSON.stringify({ code: 403, message: "trial exhausted" }), {
          status: 403,
        });
      }
      if (url.includes("/coin/ohlcv")) {
        return new Response(JSON.stringify({ code: 403 }), { status: 403 });
      }
      if (url.includes("/api/v6/dex/aggregator/quote")) {
        return new Response(
          JSON.stringify({
            code: "0",
            data: [{ chainIndex: "784", toTokenAmount: "1234567" }],
          }),
          { status: 200 },
        );
      }
      throw new Error("unexpected URL " + url);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const out = await runGetTokenMetrics({
      coinType: "0x2::sui::SUI:fb-" + Math.random(),
      window: "24H",
    });
    expect(out.symbol).toBe("SUI");
    expect(out.priceSource).toBe("okx");
    expect(out.price).toBeCloseTo(1.234567, 4); // 1234567 USDC base / 10^6
    expect(out.unavailable?.market).toBe(true);
    expect(out.unavailable?.ohlcv).toBe(true);
    expect(out.warnings.some((w) => /OKX/i.test(w))).toBe(true);
  });

  it("returns priceSource=partial (no fabricated number) when both BV and OKX are unavailable", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/coin/detail")) {
        return new Response(JSON.stringify({ code: 0, result: FIXTURE_DETAIL }), { status: 200 });
      }
      if (url.includes("/coin/market/pro")) {
        return new Response("err", { status: 403 });
      }
      if (url.includes("/coin/ohlcv")) {
        return new Response("err", { status: 403 });
      }
      throw new Error("unexpected URL " + url);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const out = await runGetTokenMetrics({
      coinType: "0x2::sui::SUI:no-okx-" + Math.random(),
      window: "24H",
    });
    expect(out.priceSource).toBe("partial");
    expect(out.price).toBe(0);
    expect(out.unavailable?.market).toBe(true);
  });
});
