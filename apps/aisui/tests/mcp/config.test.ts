import { describe, expect, it } from "vitest";
import { McpConfigError, makeToolName, parseMcpServers } from "@/lib/mcp/config";

describe("MCP config", () => {
  it("returns empty array for unset / blank input", () => {
    expect(parseMcpServers(undefined)).toEqual([]);
    expect(parseMcpServers("")).toEqual([]);
    expect(parseMcpServers("   ")).toEqual([]);
  });

  it("parses a stdio server", () => {
    const out = parseMcpServers(
      JSON.stringify([
        {
          name: "fs",
          transport: {
            type: "stdio",
            command: "node",
            args: ["./mcp-fs.js"],
            env: { FOO: "bar" },
          },
        },
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("fs");
    expect(out[0].enabled).toBe(true);
    expect(out[0].transport).toEqual({
      type: "stdio",
      command: "node",
      args: ["./mcp-fs.js"],
      env: { FOO: "bar" },
    });
  });

  it("parses sse and http servers with headers", () => {
    const out = parseMcpServers(
      JSON.stringify([
        {
          name: "okx",
          transport: {
            type: "sse",
            url: "https://example.com/mcp",
            headers: { "OK-ACCESS-KEY": "x" },
          },
        },
        {
          name: "internal",
          enabled: false,
          transport: { type: "http", url: "https://internal.local/mcp" },
        },
      ]),
    );
    expect(out[0].transport.type).toBe("sse");
    expect(out[1].enabled).toBe(false);
    expect(out[1].transport.type).toBe("http");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseMcpServers("not-json")).toThrow(McpConfigError);
  });

  it("rejects non-array root", () => {
    expect(() => parseMcpServers("{}")).toThrow(McpConfigError);
  });

  it("rejects missing required fields", () => {
    expect(() => parseMcpServers(JSON.stringify([{ transport: { type: "sse", url: "x" } }]))).toThrow(/name/);
    expect(() =>
      parseMcpServers(JSON.stringify([{ name: "x", transport: { type: "stdio" } }])),
    ).toThrow(/command/);
    expect(() =>
      parseMcpServers(JSON.stringify([{ name: "x", transport: { type: "boop", url: "x" } }])),
    ).toThrow(/transport.type/);
  });

  it("makeToolName sanitises non-word chars and applies prefix", () => {
    expect(makeToolName("okx", undefined, "search")).toBe("okx__search");
    expect(makeToolName("okx", "okx_", "search-x.y")).toBe("okx_search_x_y");
  });
});
