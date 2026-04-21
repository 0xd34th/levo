import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /api/jumper/strapi/[...path]', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.STRAPI_URL = 'https://strapi-staging.jumper.exchange';
    process.env.STRAPI_API_TOKEN = 'server-secret';
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=60',
        },
      }),
    ) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('forwards the request to upstream Strapi with server-side authorization', async () => {
    const request = new NextRequest(
      'https://jumper.krilly.ai/api/jumper/strapi/api/announcements?sort=createdAt:DESC',
      {
        headers: {
          accept: 'application/json',
          'accept-language': 'en-US',
        },
      },
    );

    const response = await GET(request, {
      params: Promise.resolve({ path: ['api', 'announcements'] }),
    });

    expect(fetch).toHaveBeenCalledTimes(1);

    const [target, init] = vi.mocked(fetch).mock.calls[0] as [
      URL,
      {
        headers: Headers;
        method: string;
        redirect: string;
      },
    ];

    expect(String(target)).toBe(
      'https://strapi-staging.jumper.exchange/api/announcements?sort=createdAt:DESC',
    );
    expect(init.method).toBe('GET');
    expect(init.redirect).toBe('follow');

    const forwardedHeaders = (init as {
      headers: Headers;
    }).headers;

    expect(forwardedHeaders.get('Authorization')).toBe(
      'Bearer server-secret',
    );
    expect(forwardedHeaders.get('accept')).toBe('application/json');
    expect(forwardedHeaders.get('accept-language')).toBe('en-US');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({ data: [] });
  });

  it('forwards upload assets without attaching the server bearer token', async () => {
    const request = new NextRequest(
      'https://jumper.krilly.ai/api/jumper/strapi/uploads/logo.png',
      {
        headers: {
          accept: 'image/png',
        },
      },
    );

    await GET(request, {
      params: Promise.resolve({ path: ['uploads', 'logo.png'] }),
    });

    const [target, init] = vi.mocked(fetch).mock.calls[0] as [
      URL,
      {
        headers: Headers;
      },
    ];

    expect(String(target)).toBe(
      'https://strapi-staging.jumper.exchange/uploads/logo.png',
    );
    expect(init.headers.get('Authorization')).toBeNull();
    expect(init.headers.get('accept')).toBe('image/png');
  });

  it('rejects dot-segment traversal attempts before reaching upstream Strapi', async () => {
    const request = new NextRequest(
      'https://jumper.krilly.ai/api/jumper/strapi/%2E%2E/api/users?populate=*',
    );

    const response = await GET(request, {
      params: Promise.resolve({ path: ['..', 'api', 'users'] }),
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid Strapi proxy path.',
    });
  });

  it('rejects server-only Strapi collections outside the public allowlist', async () => {
    const request = new NextRequest(
      'https://jumper.krilly.ai/api/jumper/strapi/api/base-mini-app-settings?filters[url][$eq]=https://jumper.krilly.ai',
    );

    const response = await GET(request, {
      params: Promise.resolve({ path: ['api', 'base-mini-app-settings'] }),
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Invalid Strapi proxy path.',
    });
  });

  it('rejects Strapi Content API requests that omit a collection segment', async () => {
    const request = new NextRequest(
      'https://jumper.krilly.ai/api/jumper/strapi/api',
    );

    const response = await GET(request, {
      params: Promise.resolve({ path: ['api'] }),
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
  });
});
