import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envBackup = {
  PRIVY_AUTHORIZATION_PRIVATE_KEY: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY,
};

async function loadRouteModule() {
  vi.resetModules();

  const rawSign = vi.fn().mockResolvedValue({
    signature: "0xdeadbeef",
  });
  const requirePrivySession = vi.fn().mockResolvedValue({
    privy: {
      wallets: () => ({
        rawSign,
      }),
    },
    sessionJwt: "session-access-token",
    sessionJwtType: "access",
    user: {
      id: "privy-user-1",
    },
    walletFleet: {
      wallets: {
        sui: {
          walletId: "wallet-sui",
        },
      },
    },
  });

  vi.doMock("@/lib/privy/server", () => ({
    getPrivyAuthorizationPrivateKey: () =>
      process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY ?? "",
    requirePrivySession,
  }));

  const module = await import("./route");

  return {
    ...module,
    rawSign,
    requirePrivySession,
  };
}

describe("POST /api/privy/sui/sign", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY = "wallet-auth:test-priv-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (envBackup.PRIVY_AUTHORIZATION_PRIVATE_KEY === undefined) {
      delete process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY;
    } else {
      process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY =
        envBackup.PRIVY_AUTHORIZATION_PRIVATE_KEY;
    }
  });

  it("signs the digest with the app authorization private key", async () => {
    const { POST, rawSign, requirePrivySession } = await loadRouteModule();

    const response = await POST(
      new Request("http://localhost/api/privy/sui/sign", {
        method: "POST",
        headers: {
          Authorization: "Bearer session-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          digest: "deadbeef",
        }),
      }),
    );

    expect(requirePrivySession).toHaveBeenCalledTimes(1);
    expect(rawSign).toHaveBeenCalledWith("wallet-sui", {
      authorization_context: {
        authorization_private_keys: ["wallet-auth:test-priv-key"],
      },
      params: {
        hash: "0xdeadbeef",
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      signature: "0xdeadbeef",
    });
  });

  it("returns a structured 502 error response when Privy rawSign fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST, rawSign } = await loadRouteModule();
    rawSign.mockRejectedValueOnce(new Error("Invalid JWT token provided"));

    const response = await POST(
      new Request("http://localhost/api/privy/sui/sign", {
        method: "POST",
        headers: {
          Authorization: "Bearer session-access-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          digest: "deadbeef",
        }),
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid JWT token provided",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[privy/sui/sign] rawSign failed",
      expect.objectContaining({
        digestPrefix: "deadbeef",
        error: expect.objectContaining({
          message: "Invalid JWT token provided",
          name: "Error",
        }),
        sessionJwtType: "access",
        sessionUserId: "privy-user-1",
        subMatchesSessionUser: false,
        walletId: "wallet-sui",
      }),
    );
  });
});
