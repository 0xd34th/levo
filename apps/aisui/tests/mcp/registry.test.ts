import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL = { ...process.env };

const mockConnections = new Map<string, ReturnType<typeof makeMockConnection>>();

function makeMockConnection(opts: {
  name: string;
  fail?: "connect" | "list";
  tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>;
  callOutput?: unknown;
  closeFn?: () => void;
}) {
  const calls = { listTools: 0, callTool: 0, close: 0 };
  return {
    calls,
    handle: {
      name: opts.name,
      client: {} as never,
      async listTools() {
        calls.listTools++;
        if (opts.fail === "list") throw new Error("list-broken");
        return (opts.tools ?? []).map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema ?? { type: "object" },
        }));
      },
      async callTool(_name: string, args: Record<string, unknown>) {
        calls.callTool++;
        return opts.callOutput ?? { ok: true, args };
      },
      async close() {
        calls.close++;
        opts.closeFn?.();
      },
    },
    fail: opts.fail,
  };
}

vi.mock("@/lib/mcp/client", async () => {
  return {
    async connectMcpServer(config: { name: string }) {
      const mock = mockConnections.get(config.name);
      if (!mock) throw new Error(`no mock for ${config.name}`);
      if (mock.fail === "connect") throw new Error("connect-broken");
      return mock.handle;
    },
  };
});

import { _resetRegistryForTests, closeMcpClients, loadMcpTools } from "@/lib/mcp";

describe("MCP registry", () => {
  beforeEach(() => {
    mockConnections.clear();
    _resetRegistryForTests();
    delete process.env.MCP_SERVERS;
    process.env.MCP_TIMEOUT_MS = "500";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
    _resetRegistryForTests();
  });

  it("returns empty state when MCP_SERVERS is unset", async () => {
    const state = await loadMcpTools();
    expect(state.entries).toEqual([]);
    expect(state.tools).toEqual({});
    expect(state.attempts).toEqual([]);
  });

  it("loads tools from a single server and caches the registry", async () => {
    mockConnections.set(
      "okx-mcp",
      makeMockConnection({
        name: "okx-mcp",
        tools: [{ name: "search", description: "Search OKX" }],
      }),
    );
    process.env.MCP_SERVERS = JSON.stringify([
      {
        name: "okx-mcp",
        transport: { type: "sse", url: "https://example.local/mcp" },
      },
    ]);

    const a = await loadMcpTools();
    const b = await loadMcpTools();
    expect(a).toBe(b); // cached
    expect(a.entries).toHaveLength(1);
    expect(a.entries[0].source).toEqual({ server: "okx-mcp", toolName: "search" });
    expect(Object.keys(a.tools)).toEqual(["okx_mcp__search"]);
  });

  it("isolates failing servers and keeps working ones", async () => {
    mockConnections.set(
      "good",
      makeMockConnection({
        name: "good",
        tools: [{ name: "a" }, { name: "b" }],
      }),
    );
    mockConnections.set("bad", makeMockConnection({ name: "bad", fail: "connect" }));
    process.env.MCP_SERVERS = JSON.stringify([
      { name: "good", transport: { type: "sse", url: "https://x.local" } },
      { name: "bad", transport: { type: "sse", url: "https://y.local" } },
    ]);

    const state = await loadMcpTools();
    expect(state.entries).toHaveLength(2);
    expect(state.attempts).toHaveLength(2);
    const goodAttempt = state.attempts.find((a) => a.server === "good");
    const badAttempt = state.attempts.find((a) => a.server === "bad");
    expect(goodAttempt?.ok).toBe(true);
    expect(goodAttempt?.toolCount).toBe(2);
    expect(badAttempt?.ok).toBe(false);
    expect(badAttempt?.errorMessage).toMatch(/connect-broken/);
  });

  it("invokes the underlying MCP callTool when the wrapped tool executes", async () => {
    const mock = makeMockConnection({
      name: "kb",
      tools: [{ name: "lookup" }],
      callOutput: { found: true },
    });
    mockConnections.set("kb", mock);
    process.env.MCP_SERVERS = JSON.stringify([
      { name: "kb", transport: { type: "http", url: "https://kb.local/mcp" } },
    ]);

    const state = await loadMcpTools();
    const wrapped = state.entries[0].tool;
    // dynamicTool's execute is exposed at runtime, even though typed as optional.
    const exec = (wrapped as unknown as { execute: (args: unknown, opts: unknown) => unknown }).execute;
    const result = await exec({ q: "hi" }, { toolCallId: "t1", messages: [] } as unknown as never);
    expect(result).toEqual({ found: true });
    expect(mock.calls.callTool).toBe(1);
  });

  it("skips disabled servers", async () => {
    mockConnections.set("on", makeMockConnection({ name: "on", tools: [{ name: "x" }] }));
    mockConnections.set("off", makeMockConnection({ name: "off", tools: [{ name: "y" }] }));
    process.env.MCP_SERVERS = JSON.stringify([
      { name: "on", transport: { type: "sse", url: "https://a.local" } },
      { name: "off", enabled: false, transport: { type: "sse", url: "https://b.local" } },
    ]);

    const state = await loadMcpTools();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0].source.server).toBe("on");
  });

  it("closeMcpClients resets cache and closes all clients", async () => {
    const mock = makeMockConnection({ name: "kb", tools: [{ name: "x" }] });
    mockConnections.set("kb", mock);
    process.env.MCP_SERVERS = JSON.stringify([
      { name: "kb", transport: { type: "http", url: "https://kb.local" } },
    ]);

    await loadMcpTools();
    await closeMcpClients();
    expect(mock.calls.close).toBe(1);
    // Loading again should work after close.
    const next = await loadMcpTools();
    expect(next.entries).toHaveLength(1);
  });

  it("reports invalid MCP_SERVERS as a single config attempt failure", async () => {
    process.env.MCP_SERVERS = "not-json";
    const state = await loadMcpTools();
    expect(state.entries).toEqual([]);
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0].server).toBe("<config>");
    expect(state.attempts[0].ok).toBe(false);
  });
});
