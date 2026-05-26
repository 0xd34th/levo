import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

const SUI = "0x2::sui::SUI";
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const ADDRESS = "0x" + "a".repeat(64);

const chatMocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("ai", () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(readonly options: unknown) {}
  },
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: [],
    sendMessage: chatMocks.sendMessage,
    setMessages: chatMocks.setMessages,
    status: "ready",
    stop: chatMocks.stop,
    error: null,
  }),
}));

vi.mock("@mysten/dapp-kit", () => ({
  ConnectModal: () => null,
  useCurrentAccount: () => ({ address: ADDRESS }),
}));

vi.mock("@/components/Header", () => ({
  Header: () => <div data-testid="header" />,
}));

vi.mock("@/lib/security/use-turnstile", () => ({
  useTurnstile: () => ({
    getToken: async () => undefined,
    containerRef: { current: null },
  }),
}));

vi.mock("@/components/cards/SwapCard", () => ({
  SwapCard: ({ data }: { data: { amountInHuman: string; tokenOut: { symbol: string } } }) => (
    <div data-testid="swap-card">
      SwapCard {data.amountInHuman} to {data.tokenOut.symbol}
    </div>
  ),
}));

vi.mock("@/components/cards/TransferCard", () => ({
  TransferCard: ({ data }: { data: { amount: string; symbol: string; recipient: string } }) => (
    <div data-testid="transfer-card">
      TransferCard {data.amount} {data.symbol} to {data.recipient}
    </div>
  ),
}));

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
}

describe("Home preset panels", () => {
  beforeEach(() => {
    chatMocks.sendMessage.mockReset();
    chatMocks.setMessages.mockReset();
    chatMocks.stop.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/auth/fingerprint") return jsonResponse({ ok: true });
        throw new Error(`unexpected fetch ${url}`);
      }) as unknown as typeof fetch,
    );
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gates object lookup behind input and seeds the prompt after validation", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /Object lookup/i }));

    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
    const ask = screen.getByRole("button", { name: /Ask AI/i }) as HTMLButtonElement;
    expect(ask.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Object ID/i), { target: { value: "0x6" } });
    expect(ask.disabled).toBe(false);
    fireEvent.click(ask);

    const textarea = screen.getByPlaceholderText(/Ask anything about Sui/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("What is the Sui object 0x6?");
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it("does not advertise the removed free-message quota", async () => {
    render(<Home />);

    expect(screen.queryByText(/10 free messages/i)).toBeNull();
    expect(screen.queryByText(/^Free$/i)).toBeNull();
  });

  it("opens the direct swap panel and prepares a SwapCard without sending chat", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/fingerprint") return jsonResponse({ ok: true });
      if (url === "/api/prepare-swap") {
        expect(JSON.parse(String(init?.body))).toEqual({
          tokenIn: SUI,
          tokenOut: USDC,
          amountIn: "1",
          slippageBps: 50,
        });
        return jsonResponse({
          tokenIn: { coinType: SUI, symbol: "SUI", decimals: 9 },
          tokenOut: { coinType: USDC, symbol: "USDC", decimals: 6 },
          amountInHuman: "1",
          amountInRaw: "1000000000",
          slippageBps: 50,
          warnings: [],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Swap 1 SUI/i }));
    fireEvent.click(screen.getByRole("button", { name: /Review swap/i }));

    expect((await screen.findByTestId("swap-card")).textContent).toContain("SwapCard 1 to USDC");
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it("opens the direct send panel and prepares a TransferCard without sending chat", async () => {
    const recipient = "0x" + "b".repeat(64);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/auth/fingerprint") return jsonResponse({ ok: true });
      if (url === "/api/prepare-transfer") {
        expect(JSON.parse(String(init?.body))).toEqual({
          toAddressOrName: recipient,
          coinType: SUI,
          amount: "1.25",
        });
        return jsonResponse({
          recipient,
          coinType: SUI,
          symbol: "SUI",
          decimals: 9,
          amount: "1.25",
          amountRaw: "1250000000",
          warnings: [],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: /Send to a \.sui name/i }));
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: "1.25" } });
    fireEvent.change(screen.getByLabelText(/Recipient/i), { target: { value: recipient } });
    fireEvent.click(screen.getByRole("button", { name: /Review send/i }));

    expect((await screen.findByTestId("transfer-card")).textContent).toContain(
      `TransferCard 1.25 SUI to ${recipient}`,
    );
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });

  it("requires bridge handoff review before opening the official Sui Bridge", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /Bridge to Sui/i }));
    expect(window.open).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Review handoff/i }));
    fireEvent.click(screen.getByRole("button", { name: /Open Sui Bridge/i }));

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        "https://bridge.sui.io/",
        "_blank",
        "noopener,noreferrer",
      );
    });
    expect(chatMocks.sendMessage).not.toHaveBeenCalled();
  });
});
