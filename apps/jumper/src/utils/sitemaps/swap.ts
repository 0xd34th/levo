import { AppPaths } from '@/const/urls';
import { getChainsQuery } from '@/hooks/useChains';
import { buildUrl, toSitemapDate } from '@/utils/sitemap';
import { slugify } from '@/utils/urls/slugify';
import type { SitemapXmlEntry } from '@/utils/sitemaps/xml';

export const getSwapSitemapEntries = async (
  lastModified = toSitemapDate(Date.now()),
): Promise<SitemapXmlEntry[]> => {
  try {
    const { chains } = await getChainsQuery();

    return chains.flatMap((chain) => {
      const chainName = chain.name?.trim();
      if (!chainName) {
        return [];
      }

      return [
        {
          loc: buildUrl(AppPaths.Swap, slugify(chainName)),
          lastModified,
          changeFrequency: 'weekly',
          priority: 0.4,
        },
      ];
    });
  } catch (error) {
    console.warn('Failed to generate swap sitemap entries.', error);
    return [];
  }
};
