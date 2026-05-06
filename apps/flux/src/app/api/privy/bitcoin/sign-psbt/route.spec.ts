import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envBackup = {
  PRIVY_AUTHORIZATION_PRIVATE_KEY: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY,
};

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
    getPrivyAuthorizationPrivateKey: () =>
      process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ?? "",
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
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = "wallet-auth:test-priv-key";
  });

  afterEach(() => {
    if (envBackup.PRIVY_AUTHORIZATION_PRIVATE_KEY === undefined) {
      delete process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
    } else {
      process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY =
        envBackup.PRIVY_AUTHORIZATION_PRIVATE_KEY;
    }
  });

  it("delegates PSBT signing to signPrivyBitcoinPsbt with the app authorization key", async () => {
    const { POST, requirePrivySession, signPrivyBitcoinPsbt } =
      await loadRouteModule();

    const response = await POST(
      new Request("http://localhost/api/privy/bitcoin/sign-psbt", {
        method: "POST",
        headers: {
          Authorization: "Bearer session-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          psbt: "unsigned-psbt",
        }),
      }),
    );

    expect(requirePrivySession).toHaveBeenCalledTimes(1);
    expect(signPrivyBitcoinPsbt).toHaveBeenCalledWith({
      authorizationPrivateKey: "wallet-auth:test-priv-key",
      privy: expect.any(Object),
      psbt: "unsigned-psbt",
      publicKey: "02abc123",
      walletId: "wallet-btc",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      psbt: "signed-psbt",
    });
  });
});
