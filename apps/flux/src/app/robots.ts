import { getSiteUrl } from '@/const/urls';
import { getBridgeSitemapChunkIds } from '@/utils/sitemaps/bridge';
import { isProduction } from '@/utils/isProduction';
import type { MetadataRoute } from 'next';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const bridgeSitemaps = (await getBridgeSitemapChunkIds()).map(
    (id) => `${getSiteUrl()}/bridge/sitemap/${id}.xml`,
  );

  return {
    rules: {
      userAgent: '*',
      ...(isProduction ? { allow: '/' } : { disallow: '/' }),
    },
    sitemap: [`${getSiteUrl()}/sitemap.xml`].concat(
      bridgeSitemaps,
      `${getSiteUrl()}/swap/sitemap.xml`,
    ),
  };
}
