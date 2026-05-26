import { beforeEach, describe, expect, it, vi } from "vitest";

const SUI = "0x2::sui::SUI";
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const ADDRESS = "0x" + "a".repeat(64);

const runnerMocks = vi.hoisted(() => ({
  runPrepareSwap: vi.fn(),
  runPrepareTransfer: vi.fn(),
}));

vi.mock("@/lib/tools/prepare-swap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools/prepare-swap")>();
  return {
    ...actual,
    runPrepareSwap: runnerMocks.runPrepareSwap,
  };
});

vi.mock("@/lib/tools/prepare-transfer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tools/prepare-transfer")>();
  return {
    ...actual,
    runPrepareTransfer: runnerMocks.runPrepareTransfer,
  };
});

function post(body: unknown) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("direct prepare routes", () => {
  beforeEach(() => {
    runnerMocks.runPrepareSwap.mockReset();
    runnerMocks.runPrepareTransfer.mockReset();
  });

  it("POST /api/prepare-swap returns the runner output for valid input", async () => {
    runnerMocks.runPrepareSwap.mockResolvedValueOnce({
      tokenIn: { coinType: SUI, symbol: "SUI", decimals: 9 },
      tokenOut: { coinType: USDC, symbol: "USDC", decimals: 6 },
      amountInHuman: "1",
      amountInRaw: "1000000000",
      slippageBps: 50,
      warnings: [],
    });
    const { POST } = await import("@/app/api/prepare-swap/route");

    const res = await POST(post({ tokenIn: SUI, tokenOut: USDC, amountIn: "1", slippageBps: 50 }));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toMatchObject({ amountInHuman: "1" });
    expect(runnerMocks.runPrepareSwap).toHaveBeenCalledWith({
      tokenIn: SUI,
      tokenOut: USDC,
      amountIn: "1",
      slippageBps: 50,
    });
  });

  it("POST /api/prepare-transfer returns the runner output for valid input", async () => {
    runnerMocks.runPrepareTransfer.mockResolvedValueOnce({
      recipient: ADDRESS,
      coinType: SUI,
      symbol: "SUI",
      decimals: 9,
      amount: "1",
      amountRaw: "1000000000",
      warnings: [],
    });
    const { POST } = await import("@/app/api/prepare-transfer/route");

    const res = await POST(post({ toAddressOrName: ADDRESS, coinType: SUI, amount: "1" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(await res.json()).toMatchObject({ recipient: ADDRESS, amountRaw: "1000000000" });
    expect(runnerMocks.runPrepareTransfer).toHaveBeenCalledWith({
      toAddressOrName: ADDRESS,
      coinType: SUI,
      amount: "1",
    });
  });

  it("returns 400 for invalid prepare-swap input", async () => {
    const { POST } = await import("@/app/api/prepare-swap/route");

    const res = await POST(post({ tokenIn: SUI, tokenOut: USDC, amountIn: "1", slippageBps: 0 }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid input" });
    expect(runnerMocks.runPrepareSwap).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid prepare-transfer input", async () => {
    const { POST } = await import("@/app/api/prepare-transfer/route");

    const res = await POST(post({ toAddressOrName: ADDRESS, coinType: SUI }));

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid input" });
    expect(runnerMocks.runPrepareTransfer).not.toHaveBeenCalled();
  });

  it("returns stable error JSON when a runner throws", async () => {
    runnerMocks.runPrepareSwap.mockRejectedValueOnce(new Error("provider quota exceeded"));
    const { POST } = await import("@/app/api/prepare-swap/route");

    const res = await POST(post({ tokenIn: SUI, tokenOut: USDC, amountIn: "1", slippageBps: 50 }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: "prepare swap failed",
      message: "provider quota exceeded",
    });
  });
});
