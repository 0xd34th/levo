import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAccessTokenMock = vi.fn();
const logoutMock = vi.fn();
const usePrivyMock = vi.fn();
const useQueryMock = vi.fn();

vi.mock("@privy-io/react-auth", () => ({
  usePrivy: usePrivyMock,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

describe("useWalletFleet", () => {
  beforeEach(() => {
    vi.resetModules();
    getAccessTokenMock.mockReset();
    logoutMock.mockReset();
    usePrivyMock.mockReset();
    useQueryMock.mockReset();
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          readyStates: {
            bitcoin: true,
            evm: true,
            solana: true,
            sui: true,
          },
          user: {
            email: "user@example.com",
            id: "privy-user-1",
            loginMethod: "email",
          },
          wallets: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the Privy access/session token for wallet-fleet requests", async () => {
    getAccessTokenMock.mockResolvedValue("session-access-token");
    usePrivyMock.mockReturnValue({
      authenticated: true,
      getAccessToken: getAccessTokenMock,
      logout: logoutMock,
      ready: true,
    });

    let queryFn: (() => Promise<unknown>) | undefined;
    useQueryMock.mockImplementation(({ queryFn: suppliedQueryFn }) => {
      queryFn = suppliedQueryFn;
      return {
        data: undefined,
        isSuccess: false,
        isLoading: false,
      };
    });

    const { useWalletFleet } = await import("./useWalletFleet");

    useWalletFleet();

    expect(queryFn).toBeDefined();
    await queryFn?.();

    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/privy/wallet-fleet", {
      headers: {
        Authorization: "Bearer session-access-token",
      },
    });
  });

  it("logs out stale Privy sessions when wallet-fleet rejects the token", async () => {
    getAccessTokenMock.mockResolvedValue("stale-session-token");
    logoutMock.mockResolvedValue(undefined);
    usePrivyMock.mockReturnValue({
      authenticated: true,
      getAccessToken: getAccessTokenMock,
      logout: logoutMock,
      ready: true,
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: "Invalid or expired Privy session" }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    let queryFn: (() => Promise<unknown>) | undefined;
    useQueryMock.mockImplementation(({ queryFn: suppliedQueryFn }) => {
      queryFn = suppliedQueryFn;
      return {
        data: undefined,
        isSuccess: false,
        isLoading: false,
      };
    });

    const { useWalletFleet } = await import("./useWalletFleet");

    useWalletFleet();

    await expect(queryFn?.()).rejects.toThrow(
      "Invalid or expired Privy session",
    );
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });
});
