import { afterEach, describe, expect, it, vi } from "vitest";
import { runGetRecentActivity } from "@/lib/tools/get-recent-activity";

const ORIGINAL = { ...process.env };
const ADDRESS = "0x" + "b".repeat(64);

vi.mock("@/lib/sui/names", () => ({
  resolveAddressOrName: async (input: string) => input,
}));

function installFetch(opts: { bvStatus?: number }) {
  const counters = { bv: 0 };
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/account/activities")) {
      counters.bv++;
      const parsed = new URL(u);
      expect(parsed.searchParams.get("address")).toBeTruthy();
      expect(parsed.searchParams.get("account")).toBeNull();
      expect(parsed.searchParams.get("limit")).toBeTruthy();
      expect(parsed.searchParams.get("pageSize")).toBeNull();
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
    throw new Error("unexpected URL " + u);
  });
  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
  return counters;
}

describe("get_recent_activity", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("returns BlockVision activities on success", async () => {
    installFetch({});
    const out = await runGetRecentActivity({
      addressOrName: ADDRESS + Math.random(),
      limit: 5,
    });
    expect(out.source).toBe("blockvision");
    expect(out.count).toBe(1);
  });

  it("propagates errors when BlockVision fails", async () => {
    installFetch({ bvStatus: 429 });
    await expect(
      runGetRecentActivity({ addressOrName: ADDRESS + Math.random(), limit: 5 }),
    ).rejects.toThrow();
  });
});
