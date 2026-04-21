import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getStrapiBaseUrl', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    for (const key of [
      'STRAPI_URL',
      'STRAPI_API_TOKEN',
      'NEXT_PUBLIC_STRAPI_URL',
      'NEXT_PUBLIC_STRAPI_API_TOKEN',
      'NEXT_PUBLIC_SITE_URL',
    ]) {
      Reflect.deleteProperty(process.env, key);
    }
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('returns the direct Strapi origin on the server even when NEXT_PUBLIC_SITE_URL is set', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://jumper.krilly.ai';
    process.env.NEXT_PUBLIC_STRAPI_URL = 'https://strapi-staging.jumper.exchange';

    const { getStrapiBaseUrl } = await import('./strapiHelper');

    expect(getStrapiBaseUrl()).toBe('https://strapi-staging.jumper.exchange');
  });

  it('prefers STRAPI_URL over NEXT_PUBLIC_STRAPI_URL on the server', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://jumper.krilly.ai';
    process.env.NEXT_PUBLIC_STRAPI_URL = 'https://strapi-public.jumper.exchange';
    process.env.STRAPI_URL = 'https://strapi-internal.jumper.exchange';

    const { getStrapiBaseUrl } = await import('./strapiHelper');

    expect(getStrapiBaseUrl()).toBe('https://strapi-internal.jumper.exchange');
  });

  it('never resolves to the public app proxy origin on the server', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://jumper.krilly.ai';

    const { getStrapiBaseUrl } = await import('./strapiHelper');

    const resolved = getStrapiBaseUrl();
    expect(resolved).not.toContain('/api/jumper/strapi');
    expect(resolved.startsWith('https://')).toBe(true);
  });

  it('returns the normalized same-origin proxy on the client', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        _env_: {
          NEXT_PUBLIC_STRAPI_URL:
            'https://jumper.krilly.ai/api/jumper/strapi',
        },
      },
      configurable: true,
      writable: true,
    });

    const { getStrapiBaseUrl } = await import('./strapiHelper');

    expect(getStrapiBaseUrl()).toBe(
      'https://jumper.krilly.ai/api/jumper/strapi',
    );
  });
});

describe('server-side Strapi readers with NEXT_PUBLIC_SITE_URL', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(process.env, 'STRAPI_URL');
    Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_STRAPI_API_TOKEN');
    process.env.NEXT_PUBLIC_SITE_URL = 'https://jumper.krilly.ai';
    process.env.NEXT_PUBLIC_STRAPI_URL = 'https://strapi.example.com';
    process.env.STRAPI_API_TOKEN = 'server-bearer';
    process.env.NEXT_PUBLIC_ENVIRONMENT = 'production';

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('never sends the Strapi bearer to the public app-origin proxy', async () => {
    const { getArticles } = await import('../../app/lib/getArticles');
    await getArticles();

    const [requestUrl, requestInit] = vi.mocked(fetch).mock.calls[0] ?? [];
    const parsed = new URL(String(requestUrl));

    expect(parsed.origin).toBe('https://strapi.example.com');
    expect(parsed.pathname.startsWith('/api/jumper/strapi')).toBe(false);

    const headers = new Headers(
      (requestInit as RequestInit | undefined)?.headers,
    );
    expect(headers.get('Authorization')).toBe('Bearer server-bearer');
  });

  it('does not carry the bearer to the normalized public proxy URL', async () => {
    const { getPartnerThemes } = await import(
      '../../app/lib/getPartnerThemes'
    );
    await getPartnerThemes();

    const [requestUrl, requestInit] = vi.mocked(fetch).mock.calls[0] ?? [];
    const parsed = new URL(String(requestUrl));

    expect(parsed.origin).not.toBe('https://jumper.krilly.ai');
    expect(parsed.pathname.startsWith('/api/jumper/strapi')).toBe(false);

    const headers = new Headers(
      (requestInit as RequestInit | undefined)?.headers,
    );
    expect(headers.get('Authorization')).toBe('Bearer server-bearer');
  });
});
