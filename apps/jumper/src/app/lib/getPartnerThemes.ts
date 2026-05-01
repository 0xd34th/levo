import type { PartnerThemesData, StrapiResponse } from '@/types/strapi';
import { PartnerThemeStrapiApi } from '@/utils/strapi/StrapiApi';
import { getStrapiRequestHeaders } from 'src/utils/strapi/strapiHelper';
import { isStrapiConfigured } from 'src/utils/strapi/strapiServer';

export async function getPartnerThemes(): Promise<
  StrapiResponse<PartnerThemesData>
> {
  if (!isStrapiConfigured()) {
    return {
      data: [],
      meta: {
        pagination: {
          page: 1,
          pageSize: 0,
          pageCount: 0,
          total: 0,
        },
      },
    };
  }

  const urlParams = new PartnerThemeStrapiApi();
  const apiUrl = urlParams.getApiUrl();
  const headers = getStrapiRequestHeaders();

  const res = await fetch(decodeURIComponent(apiUrl), {
    headers,
    next: {
      revalidate: 60 * 5, // revalidate every 5 minutes
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch data');
  }

  const data = await res.json().then((output) => {
    return {
      meta: output.meta,
      data: output.data,
    };
  });

  return { ...data };
}
