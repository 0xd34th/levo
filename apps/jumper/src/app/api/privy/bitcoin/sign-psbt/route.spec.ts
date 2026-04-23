import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadRouteModule() {
  vi.resetModules();

  const signPrivyBitcoinPsbt = vi.fn().mockResolvedValue("signed-psbt");
  const requirePrivySession = vi.fn().mockResolvedValue({
    privy: {
      wallets: () => ({
        rawSign: vi.fn(),
      }),
    },
    sessionJwt: "session-access-token",
    walletFleet: {
      wallets: {
        bitcoin: {
          publicKey: "02abc123",
          walletId: "wallet-btc",
        },
      },
    },
  });

  vi.doMock("@/lib/privy/server", () => ({
    requirePrivySession,
  }));
  vi.doMock("@/lib/privy/bitcoin", () => ({
    signPrivyBitcoinPsbt,
  }));

  const module = await import("./route");

  return {
    ...module,
    requirePrivySession,
    signPrivyBitcoinPsbt,
  };
}

describe("POST /api/privy/bitcoin/sign-psbt", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes the verified session JWT into bitcoin rawSign helpers and ignores legacy identity-token headers", async () => {
    const { POST, requirePrivySession, signPrivyBitcoinPsbt } =
      await loadRouteModule();

    const response = await POST(
      new Request("http://localhost/api/privy/bitcoin/sign-psbt", {
        method: "POST",
        headers: {
          Authorization: "Bearer session-access-token",
          "Content-Type": "application/json",
          "x-privy-identity-token": "legacy-identity-token",
        },
        body: JSON.stringify({
          psbt: "unsigned-psbt",
        }),
      }),
    );

    expect(requirePrivySession).toHaveBeenCalledTimes(1);
    expect(signPrivyBitcoinPsbt).toHaveBeenCalledWith({
      privy: expect.any(Object),
      psbt: "unsigned-psbt",
      publicKey: "02abc123",
      sessionJwt: "session-access-token",
      walletId: "wallet-btc",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      psbt: "signed-psbt",
    });
  });
});
