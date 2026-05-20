/**
 * Per-server MCP client wrapper. Builds the right transport, connects with
 * timeout, and exposes listTools / callTool / close on a tiny interface so the
 * registry doesn't have to know about MCP SDK internals.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig } from "./config";

export interface McpToolDescriptor {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface ConnectedMcpClient {
  name: string;
  client: Client;
  listTools(): Promise<McpToolDescriptor[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export interface ConnectOptions {
  /** Hard cap on connection + listTools time, in ms. Defaults to 3000. */
  timeoutMs?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function makeTransport(config: McpServerConfig) {
  switch (config.transport.type) {
    case "stdio":
      return new StdioClientTransport({
        command: config.transport.command,
        args: config.transport.args,
        env: config.transport.env,
      });
    case "sse":
      return new SSEClientTransport(new URL(config.transport.url), {
        requestInit: { headers: config.transport.headers },
      });
    case "http":
      return new StreamableHTTPClientTransport(new URL(config.transport.url), {
        requestInit: { headers: config.transport.headers },
      });
  }
}

export async function connectMcpServer(
  config: McpServerConfig,
  options: ConnectOptions = {},
): Promise<ConnectedMcpClient> {
  const timeoutMs = options.timeoutMs ?? 3000;
  const client = new Client(
    { name: "aisui", version: "0.1.0" },
    { capabilities: {} },
  );
  const transport = makeTransport(config);

  await withTimeout(client.connect(transport), timeoutMs, `MCP[${config.name}] connect`);

  return {
    name: config.name,
    client,
    async listTools() {
      const res = await withTimeout(
        client.listTools(),
        timeoutMs,
        `MCP[${config.name}] listTools`,
      );
      return res.tools.map((t) => ({
        name: t.name,
        description: t.description ?? undefined,
        inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: "object" },
      }));
    },
    async callTool(name, args) {
      const res = await client.callTool({ name, arguments: args });
      return res;
    },
    async close() {
      try {
        await client.close();
      } catch {
        /* swallow — cleanup best-effort */
      }
    },
  };
}
