/** Parse + validate the MCP_SERVERS env var. */

export type StdioTransportConfig = {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

export type SseTransportConfig = {
  type: "sse";
  url: string;
  headers?: Record<string, string>;
};

export type HttpTransportConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
};

export type McpTransportConfig =
  | StdioTransportConfig
  | SseTransportConfig
  | HttpTransportConfig;

export interface McpServerConfig {
  name: string;
  enabled?: boolean;
  transport: McpTransportConfig;
  /** Tool-name prefix; defaults to `${name}__` if multiple servers share a tool name. */
  prefix?: string;
}

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConfigError";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown, field: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new McpConfigError(`${field} must be an object of strings`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v !== "string") {
      throw new McpConfigError(`${field}.${k} must be a string`);
    }
    out[k] = v;
  }
  return out;
}

function parseTransport(value: unknown, serverName: string): McpTransportConfig {
  if (!isPlainObject(value)) {
    throw new McpConfigError(`${serverName}.transport must be an object`);
  }
  const type = value.type;
  if (type === "stdio") {
    if (typeof value.command !== "string" || value.command.length === 0) {
      throw new McpConfigError(`${serverName}.transport.command (string) required for stdio`);
    }
    let args: string[] | undefined;
    if (Array.isArray(value.args)) {
      args = value.args.map((a, idx) => {
        if (typeof a !== "string") {
          throw new McpConfigError(`${serverName}.transport.args[${idx}] must be a string`);
        }
        return a;
      });
    } else if (value.args !== undefined) {
      throw new McpConfigError(`${serverName}.transport.args must be an array of strings`);
    }
    return {
      type: "stdio",
      command: value.command,
      args,
      env: asStringRecord(value.env, `${serverName}.transport.env`),
    };
  }
  if (type === "sse" || type === "http") {
    if (typeof value.url !== "string" || value.url.length === 0) {
      throw new McpConfigError(`${serverName}.transport.url (string) required for ${type}`);
    }
    return {
      type,
      url: value.url,
      headers: asStringRecord(value.headers, `${serverName}.transport.headers`),
    };
  }
  throw new McpConfigError(
    `${serverName}.transport.type must be one of "stdio" | "sse" | "http", got ${JSON.stringify(type)}`,
  );
}

function parseServer(value: unknown, idx: number): McpServerConfig {
  if (!isPlainObject(value)) {
    throw new McpConfigError(`MCP_SERVERS[${idx}] must be an object`);
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw new McpConfigError(`MCP_SERVERS[${idx}].name (string) required`);
  }
  const enabled = value.enabled === undefined ? true : Boolean(value.enabled);
  const prefix = typeof value.prefix === "string" ? value.prefix : undefined;
  const transport = parseTransport(value.transport, value.name);
  return { name: value.name, enabled, transport, prefix };
}

/** Parse the JSON env var. Empty / undefined returns []. */
export function parseMcpServers(raw: string | undefined): McpServerConfig[] {
  if (!raw || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new McpConfigError(`MCP_SERVERS is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new McpConfigError("MCP_SERVERS must be a JSON array");
  }
  return parsed.map((entry, idx) => parseServer(entry, idx));
}

/** Sanitised tool name; replaces non-word chars to satisfy LLM tool name regex. */
export function makeToolName(serverName: string, prefix: string | undefined, toolName: string): string {
  const base = prefix ?? `${serverName}__`;
  const combined = `${base}${toolName}`;
  return combined.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 64);
}
