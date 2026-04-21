import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('learn sitemap helpers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails open when chunk ids cannot be precomputed in production', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.doMock('@/utils/isProduction', () => ({
      isProduction: true,
    }));
    vi.doMock('@/app/lib/getArticles', () => ({
      getArticles: vi.fn().mockRejectedValue(new Error('Failed to fetch data')),
    }));

    const { getLearnSitemapChunkIds } = await import('./learn');

    await expect(getLearnSitemapChunkIds()).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Failed to precompute learn sitemap chunk ids.',
      expect.any(Error),
    );
  });

  it('filters articles without a usable slug', async () => {
    vi.doMock('@/utils/isProduction', () => ({
      isProduction: false,
    }));
    vi.doMock('@/utils/strapi/strapiHelper', () => ({
      getStrapiBaseUrl: () => 'https://strapi.example.com',
    }));
    vi.doMock('@/app/lib/getArticles', () => ({
      getArticles: vi.fn().mockResolvedValue({
        data: [
          {
            Slug: 'sui-guide',
            updatedAt: '2026-04-20T00:00:00.000Z',
            publishedAt: '2026-04-19T00:00:00.000Z',
            Image: { url: '/uploads/sui-guide.png' },
          },
          {
            Slug: '   ',
            updatedAt: '2026-04-20T00:00:00.000Z',
            publishedAt: '2026-04-19T00:00:00.000Z',
          },
        ],
        meta: {
          pagination: {
            total: 2,
          },
        },
      }),
    }));

    const { getLearnSitemapEntriesForChunk } = await import('./learn');

    await expect(getLearnSitemapEntriesForChunk(0)).resolves.toEqual([
      {
        loc: '/learn/sui-guide',
        lastModified: '2026-04-20',
        changeFrequency: 'weekly',
        priority: 0.8,
        images: ['https://strapi.example.com/uploads/sui-guide.png'],
      },
    ]);
  });

  it('fails open when fetching a learn sitemap chunk errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.doMock('@/utils/isProduction', () => ({
      isProduction: false,
    }));
    vi.doMock('@/app/lib/getArticles', () => ({
      getArticles: vi.fn().mockRejectedValue(new Error('Failed to fetch data')),
    }));

    const { getLearnSitemapEntriesForChunk } = await import('./learn');

    await expect(getLearnSitemapEntriesForChunk(0)).resolves.toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'Failed to generate learn sitemap chunk 0.',
      expect.any(Error),
    );
  });
});
