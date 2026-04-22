import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

describe("/api/jumper/pipeline/[...path]", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.LIFI_INTERNAL_BACKEND_URL = "https://api.jumper.xyz/pipeline";
    process.env.NEXT_PUBLIC_LIFI_BACKEND_URL =
      "https://api.jumper.xyz/pipeline";
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=60",
        },
      }),
    ) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it("proxies POST advanced/routes while preserving referer but stripping origin", async () => {
    const request = new NextRequest(
      "https://jumper.krilly.ai/api/jumper/pipeline/v1/advanced/routes",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "cf-connecting-ip": "198.51.100.10",
          origin: "https://jumper.krilly.ai",
          referer: "https://jumper.krilly.ai/en",
          "user-agent": "codex-test",
          "x-forwarded-for": "198.51.100.10, 10.0.0.1",
          "x-lifi-integrator": "jumper.krilly.ai",
          "x-lifi-sdk": "4.0.0-beta.5",
          "x-lifi-widget": "4.0.0-beta.14",
        },
        body: JSON.stringify({
          fromAmount: "100000000",
          fromChainId: 1,
          fromTokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
          toChainId: 1,
          toTokenAddress: "0x0000000000000000000000000000000000000000",
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ path: ["v1", "advanced", "routes"] }),
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    const [target, init] = vi.mocked(fetch).mock.calls[0] as [
      URL,
      {
        body: ArrayBuffer;
        headers: Headers;
        method: string;
        redirect: string;
      },
    ];

    expect(String(target)).toBe(
      "https://api.jumper.xyz/pipeline/v1/advanced/routes",
    );
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("follow");
    expect(new TextDecoder().decode(init.body)).toContain('"fromAmount"');
    expect(init.headers.get("content-type")).toBe("application/json");
    expect(init.headers.get("x-lifi-integrator")).toBe("jumper.krilly.ai");
    expect(init.headers.get("cf-connecting-ip")).toBe("198.51.100.10");
    expect(init.headers.get("origin")).toBeNull();
    expect(init.headers.get("referer")).toBe("https://jumper.krilly.ai/en");
    expect(init.headers.get("x-forwarded-for")).toBe(
      "198.51.100.10, 10.0.0.1",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("proxies GET requests with the original query string intact", async () => {
    const request = new NextRequest(
      "https://jumper.krilly.ai/api/jumper/pipeline/v1/chains?chainTypes=EVM%2CSVM",
      {
        headers: {
          accept: "application/json",
          "accept-language": "en-US",
          "x-forwarded-for": "203.0.113.11",
        },
      },
    );

    await GET(request, {
      params: Promise.resolve({ path: ["v1", "chains"] }),
    });

    const [target, init] = vi.mocked(fetch).mock.calls[0] as [
      URL,
      {
        headers: Headers;
        method: string;
      },
    ];

    expect(String(target)).toBe(
      "https://api.jumper.xyz/pipeline/v1/chains?chainTypes=EVM%2CSVM",
    );
    expect(init.method).toBe("GET");
    expect(init.headers.get("accept")).toBe("application/json");
    expect(init.headers.get("accept-language")).toBe("en-US");
    expect(init.headers.get("referer")).toBeNull();
    expect(init.headers.get("x-forwarded-for")).toBe("203.0.113.11");
  });

  it("ignores same-origin public env values that would loop back into the proxy", async () => {
    Reflect.deleteProperty(process.env, "LIFI_INTERNAL_BACKEND_URL");
    process.env.NEXT_PUBLIC_SITE_URL = "https://jumper.krilly.ai/en";
    process.env.NEXT_PUBLIC_LIFI_BACKEND_URL =
      "https://jumper.krilly.ai/api/jumper/pipeline";

    const request = new NextRequest(
      "https://jumper.krilly.ai/api/jumper/pipeline/v1/chains",
    );

    await GET(request, {
      params: Promise.resolve({ path: ["v1", "chains"] }),
    });

    const [target] = vi.mocked(fetch).mock.calls[0] as [URL];

    expect(String(target)).toBe(
      "https://api-develop.jumper.exchange/pipeline/v1/chains",
    );
  });

  it("rejects dot-segment traversal attempts before reaching upstream", async () => {
    const request = new NextRequest(
      "https://jumper.krilly.ai/api/jumper/pipeline/%2E%2E/v1/chains",
    );

    const response = await GET(request, {
      params: Promise.resolve({ path: ["..", "v1", "chains"] }),
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid pipeline proxy path.",
    });
  });
});
