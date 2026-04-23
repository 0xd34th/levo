import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAccessTokenMock = vi.fn();
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
});
