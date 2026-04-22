import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useQueryMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: useQueryMock,
}));

describe("useCheckWalletLinking", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    useQueryMock.mockReset();
    process.env = { ...envBackup };
    Object.defineProperty(globalThis, "window", {
      value: {
        _env_: {
          NEXT_PUBLIC_LIFI_BACKEND_URL:
            "https://jumper.krilly.ai/api/jumper/pipeline",
        },
      },
      configurable: true,
      writable: true,
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [],
          unavailableRoutes: { filteredOut: [] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it("uses the same-origin pipeline proxy instead of direct li.quest requests", async () => {
    let queryFn: (() => Promise<unknown>) | undefined;
    useQueryMock.mockImplementation(({ queryFn: suppliedQueryFn }) => {
      queryFn = suppliedQueryFn;
      return {
        data: undefined,
        isSuccess: false,
        isLoading: false,
      };
    });

    const { useCheckWalletLinking } = await import("./useCheckWalletLinking");

    useCheckWalletLinking({
      userAddress: "0xabc",
      checkWalletLinking: true,
    });

    expect(queryFn).toBeDefined();
    await queryFn?.();

    expect(fetch).toHaveBeenCalledWith(
      "https://jumper.krilly.ai/api/jumper/pipeline/v1/advanced/routes",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );
  });
});
