import { beforeEach, describe, expect, it, vi } from "vitest";

const chatMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
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
    chatMocks.streamText.mockReturnValue({
      toUIMessageStreamResponse: ({ headers }: { headers: HeadersInit }) =>
        new Response("stream", { status: 200, headers }),
    });
  });

  it("does not consume or reject chat requests based on free-message quota", async () => {
    const { POST } = await import("@/app/api/chat/route");

    const res = await POST(postChat());

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("stream");
    expect(res.headers.get("x-aisui-credits-free")).toBeNull();
    expect(res.headers.get("x-aisui-credits-paid")).toBeNull();
  });
});
