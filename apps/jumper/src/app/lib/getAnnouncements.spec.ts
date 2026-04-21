import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAnnouncements } from './getAnnouncements';

describe('getAnnouncements', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRAPI_URL =
      'https://jumper.krilly.ai/api/jumper/strapi';
    process.env.NEXT_PUBLIC_ENVIRONMENT = 'production';
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

  it('loads announcements from the same-origin Strapi proxy without an auth header', async () => {
    await expect(getAnnouncements()).resolves.toEqual({
      data: [],
      meta: {},
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://jumper.krilly.ai/api/jumper/strapi/api/announcements?sort=createdAt:DESC',
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
