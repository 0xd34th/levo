import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnnouncements } from './getAnnouncements';

describe('getAnnouncements', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRAPI_URL =
      'https://jumper.krilly.ai/api/jumper/strapi';
    process.env.NEXT_PUBLIC_ENVIRONMENT = 'production';
    Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_SITE_URL');
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: {} }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    ) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('loads announcements from the configured Strapi origin without an auth header', async () => {
    await expect(getAnnouncements()).resolves.toEqual({
      data: [],
      meta: {},
    });

    const requestUrl = vi.mocked(fetch).mock.calls[0]?.[0];
    expect(typeof requestUrl).toBe('string');

    const apiUrl = new URL(requestUrl as string);
    expect(apiUrl.origin).toBe('https://jumper.krilly.ai');
    expect(apiUrl.pathname).toBe('/api/jumper/strapi/api/announcements');
    expect(apiUrl.searchParams.get('populate[0]')).toBe('Logo');
    expect(apiUrl.searchParams.get('sort[0]')).toBe('Priority:desc');

    expect(fetch).toHaveBeenCalledWith(
      requestUrl,
      expect.objectContaining({
        next: {
          revalidate: 600,
        },
      }),
    );

    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(requestInit?.headers).toBeUndefined();
  });
});
