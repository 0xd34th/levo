import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

describe("/api/jumper/v1/[...path]", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.JUMPER_INTERNAL_BACKEND_URL = "https://api.jumper.xyz/v1";
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.jumper.xyz/v1";
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

  it("proxies POST requests without forwarding browser-origin CORS headers", async () => {
    const request = new NextRequest(
      "https://jumper.krilly.ai/api/jumper/v1/users/events",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          origin: "https://jumper.krilly.ai",
          referer: "https://jumper.krilly.ai/en",
          "user-agent": "codex-test",
        },
        body: JSON.stringify({
          action: "codex_probe",
          data: { from: "codex" },
        }),
      },
    );

    const response = await POST(request, {
      params: Promise.resolve({ path: ["users", "events"] }),
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

    expect(String(target)).toBe("https://api.jumper.xyz/v1/users/events");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("follow");
    expect(new TextDecoder().decode(init.body)).toContain('"action"');
    expect(init.headers.get("origin")).toBeNull();
    expect(init.headers.get("referer")).toBeNull();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("proxies GET requests with the original query string intact", async () => {
    const request = new NextRequest(
      "https://jumper.krilly.ai/api/jumper/v1/leaderboard?address=0xabc",
      {
        headers: {
          accept: "application/json",
          "accept-language": "en-US",
        },
      },
    );

    await GET(request, {
      params: Promise.resolve({ path: ["leaderboard"] }),
    });

    const [target, init] = vi.mocked(fetch).mock.calls[0] as [
      URL,
      {
        headers: Headers;
        method: string;
      },
    ];

    expect(String(target)).toBe(
      "https://api.jumper.xyz/v1/leaderboard?address=0xabc",
    );
    expect(init.method).toBe("GET");
    expect(init.headers.get("accept")).toBe("application/json");
    expect(init.headers.get("accept-language")).toBe("en-US");
  });

  it("ignores same-origin public env values that would loop back into the proxy", async () => {
    Reflect.deleteProperty(process.env, "JUMPER_INTERNAL_BACKEND_URL");
    process.env.NEXT_PUBLIC_SITE_URL = "https://jumper.krilly.ai/en";
    process.env.NEXT_PUBLIC_BACKEND_URL =
      "https://jumper.krilly.ai/api/jumper/v1";

    const request = new NextRequest(
      "https://jumper.krilly.ai/api/jumper/v1/leaderboard",
    );

    await GET(request, {
      params: Promise.resolve({ path: ["leaderboard"] }),
    });

    const [target] = vi.mocked(fetch).mock.calls[0] as [URL];

    expect(String(target)).toBe(
      "https://api-develop.jumper.exchange/v1/leaderboard",
    );
  });

  it("rejects dot-segment traversal attempts before reaching upstream", async () => {
    const request = new NextRequest(
      "https://jumper.krilly.ai/api/jumper/v1/%2E%2E/leaderboard",
    );

    const response = await GET(request, {
      params: Promise.resolve({ path: ["..", "leaderboard"] }),
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid backend proxy path.",
    });
  });
});
