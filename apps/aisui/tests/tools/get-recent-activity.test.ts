import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGetRecentActivity } from "@/lib/tools/get-recent-activity";

const ORIGINAL = { ...process.env };
const ADDRESS = "0x" + "b".repeat(64);

vi.mock("@/lib/sui/names", () => ({
  resolveAddressOrName: async (input: string) => input,
}));

function installFetch(opts: { bvStatus?: number; okxStatus?: number }) {
  const counters = { bv: 0, okx: 0 };
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/account/activities")) {
      counters.bv++;
      if ((opts.bvStatus ?? 200) >= 400) return new Response("err", { status: opts.bvStatus });
      return new Response(
        JSON.stringify({
          code: 0,
          result: {
            items: [
              {
                digest: "abc",
                timestamp: 1700000000000,
                sender: ADDRESS,
                summary: "tx",
              },
            ],
          },
        }),
        { status: 200 },
      );
    }
    if (u.includes("/api/v5/wallet/post-transaction/transactions")) {
      counters.okx++;
      if ((opts.okxStatus ?? 200) >= 400) return new Response("err", { status: opts.okxStatus });
      return new Response(
        JSON.stringify({
          code: "0",
          data: [
            {
              transactionList: [
                {
                  txHash: "0xdef",
                  txTime: "1700000111000",
                  fromAddress: ADDRESS,
                  toAddress: "0xother",
                  amount: "1.0",
                  symbol: "SUI",
                  txType: "transfer",
                  txStatus: "success",
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

describe("get_recent_activity", () => {
  beforeEach(() => {
    delete process.env.OKX_API_KEY;
    delete process.env.OKX_SECRET_KEY;
    delete process.env.OKX_API_PASSPHRASE;
    delete process.env.OKX_PROJECT_ID;
    process.env.OKX_FALLBACK_ENABLED = "false";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("returns BlockVision activities on success", async () => {
    const counters = installFetch({});
    const out = await runGetRecentActivity({
      addressOrName: ADDRESS + Math.random(),
      limit: 5,
    });
    expect(out.source).toBe("blockvision");
    expect(out.count).toBe(1);
    expect(counters.okx).toBe(0);
  });

  it("falls back to OKX when BlockVision throws and fallback enabled", async () => {
    process.env.OKX_API_KEY = "k";
    process.env.OKX_SECRET_KEY = "s";
    process.env.OKX_API_PASSPHRASE = "p";
    process.env.OKX_PROJECT_ID = "pj";
    process.env.OKX_FALLBACK_ENABLED = "true";

    const counters = installFetch({ bvStatus: 429 });
    const out = await runGetRecentActivity({
      addressOrName: ADDRESS + Math.random(),
      limit: 5,
    });
    expect(out.source).toBe("okx");
    expect(counters.okx).toBeGreaterThan(0);
    expect(out.activities[0].digest).toBe("0xdef");
    expect(out.fallbackReason).toMatch(/429/);
  });
});
