import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Header } from "@/components/Header";

vi.mock("@mysten/dapp-kit", () => ({
  ConnectButton: ({ connectText }: { connectText: string }) => <button>{connectText}</button>,
}));

vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <button>Theme</button>,
}));

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Header", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/sui-price") {
          return jsonResponse({ symbol: "SUI", price: 1.23, priceChange24H: 0.4, source: "blockvision" });
        }
        if (url === "/api/auth/usage") {
          return jsonResponse({ freeRemaining: 0, freeLimit: 10, paidRemaining: 0 });
        }
        throw new Error(`unexpected fetch ${url}`);
      }) as unknown as typeof fetch,
    );
  });

  it("does not show or fetch the old free-message usage quota", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    render(<Header />);

    await waitFor(() => {
      expect(screen.getByText("$1.23")).toBeTruthy();
    });
    expect(screen.queryByText(/free/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/auth/usage");
  });
});
