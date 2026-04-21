import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('client-side Strapi app/lib helpers', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(process.env, 'STRAPI_URL');
    Reflect.deleteProperty(process.env, 'STRAPI_API_TOKEN');
    Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_STRAPI_API_TOKEN');
    process.env.NEXT_PUBLIC_ENVIRONMENT = 'production';
    global.fetch = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: [], meta: {} }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }),
    ) as typeof fetch;

    Object.defineProperty(globalThis, 'window', {
      value: {
        _env_: {
          NEXT_PUBLIC_ENVIRONMENT: 'production',
          NEXT_PUBLIC_STRAPI_URL:
            'https://jumper.krilly.ai/api/jumper/strapi',
        },
      },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it('routes client-invoked Strapi reads through the same-origin proxy without auth headers', async () => {
    const { getFeaturedArticle } = await import('./getFeaturedArticle');
    const { searchArticles } = await import('./searchArticles');
    const { getPerks } = await import('./getPerks');
    const { getQuestsWithNoCampaignAttached } = await import(
      './getQuestsWithNoCampaignAttached'
    );

    await getFeaturedArticle();
    await searchArticles('bridge');
    await getPerks({
      page: 2,
      pageSize: 5,
      withCount: true,
    });
    await getQuestsWithNoCampaignAttached({
      page: 3,
      pageSize: 4,
      withCount: true,
    });

    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(4);

    const [featuredUrl, searchUrl, perksUrl, questsUrl] = calls.map(
      ([requestUrl]) => new URL(String(requestUrl)),
    );

    expect(featuredUrl.origin).toBe('https://jumper.krilly.ai');
    expect(featuredUrl.pathname).toBe('/api/jumper/strapi/api/blog-articles');
    expect(searchUrl.origin).toBe('https://jumper.krilly.ai');
    expect(searchUrl.pathname).toBe('/api/jumper/strapi/api/blog-articles');
    expect(perksUrl.origin).toBe('https://jumper.krilly.ai');
    expect(perksUrl.pathname).toBe('/api/jumper/strapi/api/perks');
    expect(questsUrl.origin).toBe('https://jumper.krilly.ai');
    expect(questsUrl.pathname).toBe('/api/jumper/strapi/api/quests');

    for (const [, requestInit] of calls) {
      const headers = new Headers((requestInit as RequestInit | undefined)?.headers);
      expect(headers.has('Authorization')).toBe(false);
    }
  });
});
