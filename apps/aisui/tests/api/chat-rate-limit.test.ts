import { beforeEach, describe, expect, it, vi } from "vitest";

const chatMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  consumeCredits: vi.fn(),
}));

vi.mock("ai", () => ({
  convertToModelMessages: (messages: unknown) => messages,
  stepCountIs: (count: number) => ({ count }),
  streamText: chatMocks.streamText,
}));

vi.mock("@/lib/llm/model-router", () => ({
  isModelMode: (mode: unknown) => mode === "fast",
  pickModel: () => ({ model: "test-model", reasoning: false }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    deepseekKey: () => "test-deepseek-key",
  },
}));

vi.mock("@/lib/tools", () => ({ tools: {} }));
vi.mock("@/lib/mcp", () => ({ loadMcpTools: async () => ({ tools: {}, entries: [] }) }));
vi.mock("@/lib/auth/fingerprint", () => ({
  getOrCreateFingerprint: async () => "test-fingerprint",
}));
vi.mock("@/lib/credits/tracker", () => ({
  consumeCredits: chatMocks.consumeCredits,
}));
vi.mock("@/lib/security/turnstile", () => ({
  turnstileEnabled: () => false,
  verifyTurnstile: async () => true,
}));

function postChat() {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [{ id: "m1", role: "user", parts: [{ type: "text", text: "SUI price" }] }],
      mode: "fast",
      sender: "0x" + "a".repeat(64),
    }),
  });
}

describe("chat route rate limit", () => {
  beforeEach(() => {
    chatMocks.streamText.mockReset();
    chatMocks.consumeCredits.mockReset();
    chatMocks.consumeCredits.mockResolvedValue({
      ok: true,
      freeRemaining: 9,
      paidRemaining: 0,
      usedFree: true,
    });
    chatMocks.streamText.mockReturnValue({
      toUIMessageStreamResponse: ({ headers }: { headers: HeadersInit }) =>
        new Response("stream", { status: 200, headers }),
    });
  });

  it("consumes daily free quota and returns usage headers", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const res = await POST(postChat());

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("stream");
    expect(chatMocks.consumeCredits).toHaveBeenCalledWith("test-fingerprint", "fast");
    expect(res.headers.get("x-aisui-credits-free")).toBe("9");
    expect(res.headers.get("x-aisui-credits-paid")).toBe("0");
  });

  it("returns 402 before calling the model when free quota is exhausted", async () => {
    chatMocks.consumeCredits.mockResolvedValueOnce({
      ok: false,
      reason: "free_exhausted",
      freeRemaining: 0,
      paidRemaining: 0,
    });
    const { POST } = await import("@/app/api/chat/route");

    const res = await POST(postChat());

    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({
      error: "Free quota exhausted for today. Switch to a paid pack or come back tomorrow.",
      usage: { freeRemaining: 0, paidRemaining: 0 },
    });
    expect(chatMocks.streamText).not.toHaveBeenCalled();
  });
});
