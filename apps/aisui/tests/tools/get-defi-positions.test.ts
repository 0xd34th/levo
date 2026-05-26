import { afterEach, describe, expect, it, vi } from "vitest";
import { runGetDefiPositions } from "@/lib/tools/get-defi-positions";

const ORIGINAL = { ...process.env };
const ADDRESS = "0x" + "c".repeat(64);

vi.mock("@/lib/sui/names", () => ({
  resolveAddressOrName: async (input: string) => input,
}));

function installFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/account/defiPortfolio")) {
      const parsed = new URL(u);
      expect(parsed.searchParams.get("address")).toBeTruthy();
      expect(parsed.searchParams.get("account")).toBeNull();
      expect(parsed.searchParams.get("protocol")).toBe("cetus");
      return new Response(
        JSON.stringify({
          code: 0,
          result: {
            protocols: [
              {
                protocol: "cetus",
                positions: [{ name: "LP", valueUsd: 12.5 }],
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
}

describe("get_defi_positions", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("uses the current BlockVision address/protocol query contract", async () => {
    installFetch();
    const out = await runGetDefiPositions({ addressOrName: ADDRESS + Math.random() });
    expect(out.protocol).toBe("cetus");
    expect(out.totalValueUsd).toBe(12.5);
    expect(out.protocols).toBe(1);
  });
});
