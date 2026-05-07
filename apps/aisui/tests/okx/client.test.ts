import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { okxGet, okxPost } from "@/lib/okx/client";
import { OkxApiError, OkxNotConfiguredError } from "@/lib/okx/types";

const ORIGINAL = { ...process.env };

describe("OKX client", () => {
  beforeEach(() => {
    process.env.OKX_API_KEY = "test-key";
    process.env.OKX_SECRET_KEY = "test-secret";
    process.env.OKX_API_PASSPHRASE = "test-pass";
    process.env.OKX_PROJECT_ID = "test-project";
    process.env.OKX_BASE_URL = "https://test-okx.local";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  it("attaches the five required signing headers on GET", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      captured.url = url;
      captured.init = init;
      return new Response(JSON.stringify({ code: "0", data: { ok: true } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const out = await okxGet<{ ok: boolean }>(
      "/api/v5/dex/aggregator/quote",
      { chainIndex: "784", amount: "100", excluded: undefined },
      { ttl: 0, swr: 0, noCache: true },
    );
    expect(out.ok).toBe(true);
    expect(captured.url).toBe(
      "https://test-okx.local/api/v5/dex/aggregator/quote?amount=100&chainIndex=784",
    );
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers["OK-ACCESS-KEY"]).toBe("test-key");
    expect(headers["OK-ACCESS-PROJECT"]).toBe("test-project");
    expect(headers["OK-ACCESS-PASSPHRASE"]).toBe("test-pass");
    expect(headers["OK-ACCESS-SIGN"]).toMatch(/.+/);
    expect(headers["OK-ACCESS-TIMESTAMP"]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("serialises POST body and signs it", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      captured.url = url;
      captured.init = init;
      return new Response(JSON.stringify({ code: "0", data: { txData: "AA==" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await okxPost<{ txData: string }>("/api/v5/dex/aggregator/swap", {
      chainIndex: "784",
      fromTokenAddress: "0x2::sui::SUI",
    });
    expect(captured.url).toBe("https://test-okx.local/api/v5/dex/aggregator/swap");
    expect(captured.init?.body).toBe(
      JSON.stringify({ chainIndex: "784", fromTokenAddress: "0x2::sui::SUI" }),
    );
    const headers = captured.init?.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
  });

  it("throws OkxApiError on non-zero code", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({ code: "50111", msg: "Invalid sign", data: null }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    await expect(
      okxGet("/api/v5/x", {}, { ttl: 0, swr: 0, noCache: true, retries: 0 }),
    ).rejects.toBeInstanceOf(OkxApiError);
  });

  it("throws OkxNotConfiguredError when credentials are missing", async () => {
    delete process.env.OKX_API_KEY;
    delete process.env.OKX_SECRET_KEY;
    delete process.env.OKX_API_PASSPHRASE;
    delete process.env.OKX_PROJECT_ID;
    await expect(
      okxGet("/api/v5/x", {}, { ttl: 0, swr: 0, noCache: true }),
    ).rejects.toBeInstanceOf(OkxNotConfiguredError);
  });

  it("retries on 429 then succeeds", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response("rate limit", { status: 429 });
      return new Response(JSON.stringify({ code: "0", data: { ok: true } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const out = await okxGet<{ ok: boolean }>(
      "/api/v5/dex/aggregator/quote",
      { chainIndex: "784", retryProbe: String(Math.random()) },
      { ttl: 0, swr: 0, noCache: true, retries: 2 },
    );
    expect(out.ok).toBe(true);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
