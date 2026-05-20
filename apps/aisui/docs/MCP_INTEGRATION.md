# MCP Client Integration

aisui ships an MCP (Model Context Protocol) client framework so any
MCP-compliant server can contribute tools to the chat agent without code
changes — they're added by environment variable.

## Why this exists

* Future-proof the integration story for OKX (their official MCP server adds
  Sui later) and any internal MCP knowledge bases / dev tooling.
* Keep the chat route source-agnostic — local tools and remote MCP tools
  flow through the same `tools` map fed to `streamText()`.

## Configuration

Set `MCP_SERVERS` to a JSON array. Each entry has:

```json
[
  {
    "name": "okx-dex",
    "transport": {
      "type": "sse",
      "url": "https://web3.okx.com/api/v1/onchainos-mcp",
      "headers": { "OK-ACCESS-KEY": "..." }
    }
  },
  {
    "name": "kb",
    "transport": {
      "type": "stdio",
      "command": "node",
      "args": ["./mcp-kb.js"]
    }
  }
]
```

| Field | Notes |
|---|---|
| `name` | Required. Used as a tool-name namespace (`<name>__<tool>`). |
| `enabled` | Optional, default `true`. Set `false` to keep the entry in config without loading. |
| `prefix` | Optional, defaults to `<name>__`. Use to disambiguate if servers share tool names. |
| `transport.type` | `stdio`, `sse`, or `http` (streamable HTTP). |
| `transport.command` / `args` / `env` | stdio only. |
| `transport.url` / `headers` | sse + http only. |

`MCP_TIMEOUT_MS` (default `3000`) caps connect + listTools time per server.

## Behaviour

* `loadMcpTools()` (`src/lib/mcp/registry.ts`) is a lazy singleton — it
  connects on first call, caches the registry for the rest of the process.
* Failures are isolated per-server. One broken MCP connection never breaks
  chat: its tools are simply not registered, and an entry appears in
  `state.attempts` with `ok: false` + the error.
* MCP tools are wrapped with AI SDK's `dynamicTool()` — their input schema is
  forwarded to the LLM verbatim, and `execute(args)` calls
  `client.callTool({ name, arguments: args })`.
* Tool names are sanitised to `[A-Za-z0-9_]` and capped at 64 chars to
  satisfy LLM tool-name constraints.

## Where it plugs in

`src/app/api/chat/route.ts` merges MCP tools into the local registry before
calling `streamText`:

```ts
const mcpRegistry = await loadMcpTools().catch(() => null);
const mergedTools = mcpRegistry ? { ...localTools, ...mcpRegistry.tools } : localTools;
```

The response surfaces `x-aisui-mcp-tools: <count>` so you can verify wiring
without opening dev tools.

## Operations

* The registry is cached for the lifetime of the Next.js Node runtime. Use
  `closeMcpClients()` from `@/lib/mcp` during graceful shutdown if you add
  one (Vercel doesn't, so it's mostly relevant in long-running self-hosted
  setups).
* For local development, `_resetRegistryForTests()` clears the cache so
  config edits take effect on the next call.

## Known limits

* The OKX official MCP server does not yet support Sui (chainIndex 784) — so
  enabling it via `MCP_SERVERS` only adds EVM/Solana coverage. For Sui-native
  features, the project still uses the OKX REST integration directly (see
  `OKX_INTEGRATION.md`).
* SSE / streamable HTTP transports must run on a Node runtime. The chat
  route is already pinned to `runtime = "nodejs"`.
