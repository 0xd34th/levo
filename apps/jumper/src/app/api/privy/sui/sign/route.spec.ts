import { beforeEach, describe, expect, it, vi } from "vitest";

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
    walletFleet: {
      wallets: {
        sui: {
          walletId: "wallet-sui",
        },
      },
    },
  });

  vi.doMock("@/lib/privy/server", () => ({
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
  });

  it("signs with the verified session JWT and ignores legacy identity-token headers", async () => {
    const { POST, rawSign, requirePrivySession } = await loadRouteModule();

    const response = await POST(
      new Request("http://localhost/api/privy/sui/sign", {
        method: "POST",
        headers: {
          Authorization: "Bearer session-access-token",
          "Content-Type": "application/json",
          "x-privy-identity-token": "legacy-identity-token",
        },
        body: JSON.stringify({
          digest: "deadbeef",
        }),
      }),
    );

    expect(requirePrivySession).toHaveBeenCalledTimes(1);
    expect(rawSign).toHaveBeenCalledWith("wallet-sui", {
      authorization_context: {
        user_jwts: ["session-access-token"],
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
});
