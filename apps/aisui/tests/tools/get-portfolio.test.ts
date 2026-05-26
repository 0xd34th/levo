import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGetPortfolio } from "@/lib/tools/get-portfolio";

const ORIGINAL = { ...process.env };
const ADDRESS = "0x" + "a".repeat(64);

vi.mock("@/lib/sui/names", () => ({
  resolveAddressOrName: async (input: string) => input,
}));

interface ScenarioOpts {
  bvCoinsStatus?: number;
  bvNftsStatus?: number;
  bvCoins?: Array<Record<string, unknown>>;
}

interface CallCounters {
  bvCoins: number;
  bvNfts: number;
}

function installFetchScenario(opts: ScenarioOpts): CallCounters {
  const counters: CallCounters = { bvCoins: 0, bvNfts: 0 };
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/account/coins")) {
      counters.bvCoins++;
      const status = opts.bvCoinsStatus ?? 200;
      if (status >= 400) return new Response("err", { status });
      const coins = opts.bvCoins ?? [
        {
          coinType: "0x2::sui::SUI",
          symbol: "SUI",
          decimals: 9,
          balance: "1000000000",
          usdValue: 4.2,
          price: 4.2,
        },
      ];
      return new Response(
        JSON.stringify({ code: 0, result: { coins } }),
        { status: 200 },
      );
    }
    if (u.includes("/account/nfts")) {
      counters.bvNfts++;
      return new Response(JSON.stringify({ code: 0, result: { items: [] } }), { status: 200 });
    }
    throw new Error("unexpected URL " + u);
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return counters;
}

describe("get_portfolio", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("returns BlockVision data when call succeeds", async () => {
    installFetchScenario({});
    const out = await runGetPortfolio({
      addressOrName: ADDRESS + Math.random(),
      includeNfts: true,
      limit: 5,
    });
    expect(out.source).toBe("blockvision");
    expect(out.coinCount).toBe(1);
  });

  it("normalizes provider numeric strings before totals and card output", async () => {
    installFetchScenario({
      bvCoins: [
        {
          coinType: "0x2::sui::SUI",
          symbol: "SUI",
          decimals: "9",
          balance: "1000000000",
          usdValue: "1.25",
          price: "1.25",
          priceChangePercentage24H: "0.5",
          verified: true,
        },
        {
          coinType: "0xrandom::dust::TOK",
          symbol: "TOK",
          decimals: "6",
          balance: "1000000",
          usdValue: "0.75",
          price: "0.75",
          priceChangePercentage24H: "-1.2",
          verified: false,
        },
      ],
    });

    const out = await runGetPortfolio({
      addressOrName: ADDRESS + Math.random(),
      includeNfts: false,
      limit: 10,
    });

    expect(out.totalUsd).toBe(1.25);
    expect(out.unverifiedUsd).toBe(0.75);
    expect(out.topCoins[0]).toMatchObject({
      symbol: "SUI",
      decimals: 9,
      usdValue: 1.25,
      price: 1.25,
      priceChange24H: 0.5,
    });
    expect(out.topCoins[1]).toMatchObject({
      symbol: "TOK",
      decimals: 6,
      usdValue: 0.75,
      price: 0.75,
      priceChange24H: -1.2,
    });
  });

  it("re-throws when BlockVision fails (no fallback wired)", async () => {
    installFetchScenario({ bvCoinsStatus: 429 });
    await expect(
      runGetPortfolio({
        addressOrName: ADDRESS + Math.random(),
        includeNfts: false,
        limit: 5,
      }),
    ).rejects.toThrow();
  });

  it("excludes suspicious tokens from totalUsd and reports them under suspectUsd", async () => {
    installFetchScenario({
      bvCoins: [
        {
          coinType: "0x2::sui::SUI",
          symbol: "SUI",
          decimals: 9,
          balance: "1000000000",
          usdValue: 4.2,
          price: 4.2,
          verified: true,
        },
        {
          // impersonator: claims USDC but coinType is not canonical
          coinType: "0xfake::scam::USDC",
          symbol: "USDC",
          decimals: 6,
          balance: "1000000",
          usdValue: 999_999,
          price: 1,
          verified: false,
        },
        {
          // unverified high-value (the $8M scenario)
          coinType: "0xairdrop::scam::DUST",
          symbol: "DUST",
          decimals: 9,
          balance: "1000000000000",
          usdValue: 8_050_000,
          price: 8050,
          verified: false,
        },
        {
          // unverified low-value dust → unverified bucket, not suspicious
          coinType: "0xrandom::dust::TOK",
          symbol: "TOK",
          decimals: 9,
          balance: "1000000000",
          usdValue: 0.4,
          price: 0.4,
          verified: false,
        },
      ],
    });
    const out = await runGetPortfolio({
      addressOrName: ADDRESS + Math.random(),
      includeNfts: false,
      limit: 10,
    });
    expect(out.totalUsd).toBeCloseTo(4.2, 5);
    expect(out.suspectUsd).toBeCloseTo(999_999 + 8_050_000, 0);
    expect(out.suspectCount).toBe(2);
    expect(out.unverifiedUsd).toBeCloseTo(0.4, 5);
    const trustBySymbol = Object.fromEntries(
      out.topCoins.map((c) => [c.symbol, c.trust]),
    );
    expect(trustBySymbol.SUI).toBe("verified");
    expect(trustBySymbol.USDC).toBe("suspicious");
    expect(trustBySymbol.DUST).toBe("suspicious");
    expect(trustBySymbol.TOK).toBe("unverified");
  });

  it("excludes DEX LP receipts (AF_LP) from totalUsd, surfaces them as lpUsd", async () => {
    installFetchScenario({
      bvCoins: [
        {
          coinType: "0x2::sui::SUI",
          symbol: "SUI",
          decimals: 9,
          balance: "1000000000",
          usdValue: 4.2,
          price: 4.2,
          verified: true,
        },
        {
          // Aftermath LP receipt — even with verified=true upstream, we exclude it.
          coinType:
            "0xefe8b36d5b2e43728cc323298626b83177803521d195cfb11e15b910e892fddf::af_lp::AF_LP",
          symbol: "AF_LP_USDC_SUI",
          decimals: 9,
          balance: "1",
          usdValue: 8_052_941,
          price: 1,
          verified: true,
        },
      ],
    });
    const out = await runGetPortfolio({
      addressOrName: ADDRESS + Math.random(),
      includeNfts: false,
      limit: 10,
    });
    expect(out.totalUsd).toBeCloseTo(4.2, 5);
    expect(out.lpUsd).toBeCloseTo(8_052_941, 0);
    expect(out.lpCount).toBe(1);
    expect(out.suspectUsd).toBe(0);
    const lpRow = out.topCoins.find((c) => c.symbol.startsWith("AF_LP"));
    expect(lpRow?.trust).toBe("lp");
  });

  it("treats canonical coinTypes as verified even when provider omits the flag", async () => {
    installFetchScenario({
      bvCoins: [
        {
          // CETUS canonical coinType (no verified flag)
          coinType:
            "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
          symbol: "CETUS",
          decimals: 9,
          balance: "1000000000",
          usdValue: 100,
          price: 100,
        },
      ],
    });
    const out = await runGetPortfolio({
      addressOrName: ADDRESS + Math.random(),
      includeNfts: false,
      limit: 5,
    });
    expect(out.totalUsd).toBeCloseTo(100, 5);
    expect(out.suspectUsd).toBe(0);
    expect(out.topCoins[0].trust).toBe("verified");
  });
});
