import { beforeEach, describe, expect, it, vi } from "vitest";

const FULL_SUI_COIN =
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

describe("get_trending", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("requests BlockVision pools with canonical SUI coinType like levo web", async () => {
    const requested = new Map<string, URL>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const requestUrl = new URL(String(url));
        requested.set(requestUrl.pathname, requestUrl);
        if (requestUrl.pathname.endsWith("/coin/market/pro")) {
          return Response.json({
            code: 200,
            result: {
              priceInUsd: "1.23",
              volume24H: "12500",
              marketCap: "1000000",
              market: { hour24: { priceChange: "-1.5" } },
            },
          });
        }
        if (requestUrl.pathname.endsWith("/coin/dex/pools")) {
          return Response.json({
            code: 200,
            result: [
              {
                dex: "cetus",
                poolId: "0xpool",
                coinList: [
                  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
                  FULL_SUI_COIN,
                ],
                tvl: "100000",
                volume24H: "50000",
                apr: "12.5",
              },
            ],
          });
        }
        if (requestUrl.pathname.endsWith("/coin/trades")) {
          return Response.json({ code: 200, result: { data: [{ txDigest: "abc" }] } });
        }
        throw new Error(`unexpected URL ${requestUrl.pathname}`);
      }) as unknown as typeof fetch,
    );

    const { runGetTrending } = await import("@/lib/tools/get-trending");
    const out = await runGetTrending({ window: "24H", limit: 5 });

    expect(requested.get("/v2/sui/coin/dex/pools")?.searchParams.get("coinType")).toBe(
      FULL_SUI_COIN,
    );
    expect(requested.get("/v2/sui/coin/dex/pools")?.searchParams.has("pageSize")).toBe(false);
    expect(out).toMatchObject({
      source: "blockvision",
      coins: [expect.objectContaining({ symbol: "SUI", price: 1.23 })],
      pools: [expect.objectContaining({ protocol: "cetus", pair: "DEEP/SUI", volume24HUsd: 50000 })],
      recentTrades: [{ txDigest: "abc" }],
    });
  });

  it("returns a readable fallback instead of raw empty output when provider is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("err", { status: 503 })) as unknown as typeof fetch,
    );

    const { runGetTrending } = await import("@/lib/tools/get-trending");
    const out = await runGetTrending({ window: "24H", limit: 5 });

    expect(out).toMatchObject({
      source: "unavailable",
      coins: [],
      pools: [],
      warning: expect.stringContaining("Trending markets unavailable"),
    });
  });
});
