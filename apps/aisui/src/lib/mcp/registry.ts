/**
 * Lazy singleton registry that loads every enabled MCP server, fetches each
 * server's tools, and wraps them as AI SDK `dynamicTool`s so they slot into
 * `streamText({ tools })` next to the local Sui tools.
 *
 * Failures (bad config, unreachable server, timeouts) are isolated per server
 * — one broken MCP server never breaks chat.
 */
import { dynamicTool, jsonSchema } from "ai";
import { env } from "@/lib/env";
import { connectMcpServer, type ConnectedMcpClient } from "./client";
import { makeToolName, parseMcpServers, type McpServerConfig } from "./config";

export interface McpToolEntry {
  name: string;
  description?: string;
  source: { server: string; toolName: string };
  // The wrapped tool — typed loosely because dynamicTool's generic widens to unknown.
  tool: ReturnType<typeof dynamicTool>;
}

export interface McpAttempt {
  server: string;
  ok: boolean;
  toolCount: number;
  errorMessage?: string;
  latencyMs: number;
}

export interface McpRegistryState {
  tools: Record<string, ReturnType<typeof dynamicTool>>;
  entries: McpToolEntry[];
  attempts: McpAttempt[];
  clients: ConnectedMcpClient[];
}

let cached: Promise<McpRegistryState> | null = null;

function emptyState(attempts: McpAttempt[] = []): McpRegistryState {
  return { tools: {}, entries: [], attempts, clients: [] };
}

async function buildEntry(
  config: McpServerConfig,
  client: ConnectedMcpClient,
): Promise<McpToolEntry[]> {
  const descriptors = await client.listTools();
  return descriptors.map((descriptor) => {
    const name = makeToolName(config.name, config.prefix, descriptor.name);
    const wrapped = dynamicTool({
      description: descriptor.description ?? `MCP tool ${descriptor.name} from ${config.name}`,
      inputSchema: jsonSchema(descriptor.inputSchema),
      execute: async (args) => {
        const result = await client.callTool(descriptor.name, (args ?? {}) as Record<string, unknown>);
        return result;
      },
    });
    return {
      name,
      description: descriptor.description,
      source: { server: config.name, toolName: descriptor.name },
      tool: wrapped,
    };
  });
}

async function loadEnabled(servers: McpServerConfig[]): Promise<McpRegistryState> {
  const timeoutMs = env.mcpTimeoutMs();
  const enabled = servers.filter((s) => s.enabled !== false);
  const attempts: McpAttempt[] = [];
  const clients: ConnectedMcpClient[] = [];
  const allEntries: McpToolEntry[] = [];

  // Connect in parallel — failures isolated per server.
  await Promise.all(
    enabled.map(async (config) => {
      const start = Date.now();
      try {
        const client = await connectMcpServer(config, { timeoutMs });
        try {
          const entries = await buildEntry(config, client);
          clients.push(client);
          allEntries.push(...entries);
          attempts.push({
            server: config.name,
            ok: true,
            toolCount: entries.length,
            latencyMs: Date.now() - start,
          });
        } catch (err) {
          // listTools failed — close and report.
          await client.close();
          attempts.push({
            server: config.name,
            ok: false,
            toolCount: 0,
            errorMessage: (err as Error).message,
            latencyMs: Date.now() - start,
          });
        }
      } catch (err) {
        attempts.push({
          server: config.name,
          ok: false,
          toolCount: 0,
          errorMessage: (err as Error).message,
          latencyMs: Date.now() - start,
        });
      }
    }),
  );

  // Resolve duplicate names by suffixing __1, __2, ...
  const tools: Record<string, ReturnType<typeof dynamicTool>> = {};
  for (const entry of allEntries) {
    let key = entry.name;
    let n = 1;
    while (key in tools) {
      key = `${entry.name}_${n}`;
      n++;
    }
    tools[key] = entry.tool;
  }

  return { tools, entries: allEntries, attempts, clients };
}

/**
 * Load (or return cached) MCP registry state.
 *
 * Behaviour:
 *  - If MCP_SERVERS is empty → returns empty state instantly (no I/O).
 *  - Connection failures isolated per-server; partial success is allowed.
 *  - Subsequent calls return the same cached state until `closeMcpClients()`.
 */
export async function loadMcpTools(): Promise<McpRegistryState> {
  if (cached) return cached;

  let configs: McpServerConfig[] = [];
  try {
    configs = parseMcpServers(env.mcpServers());
  } catch (err) {
    cached = Promise.resolve(
      emptyState([
        {
          server: "<config>",
          ok: false,
          toolCount: 0,
          errorMessage: (err as Error).message,
          latencyMs: 0,
        },
      ]),
    );
    return cached;
  }

  if (configs.length === 0) {
    cached = Promise.resolve(emptyState());
    return cached;
  }

  cached = loadEnabled(configs);
  return cached;
}

/** Close all open MCP clients and clear the cache. */
export async function closeMcpClients(): Promise<void> {
  if (!cached) return;
  const state = await cached.catch(() => null);
  cached = null;
  if (!state) return;
  await Promise.all(state.clients.map((c) => c.close()));
}

/** Test-only helper to clear the cache without closing real clients. */
export function _resetRegistryForTests(): void {
  cached = null;
}
