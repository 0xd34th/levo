import type { CampaignData, StrapiResponse } from '@/types/strapi';
import { CampaignStrapiApi } from '@/utils/strapi/StrapiApi';
import { getStrapiRequestHeaders } from 'src/utils/strapi/strapiHelper';

export async function getCampaigns(): Promise<StrapiResponse<CampaignData>> {
  const urlParams = new CampaignStrapiApi().useCampaignPageParams();
  const apiUrl = urlParams.getApiUrl();
  const headers = getStrapiRequestHeaders();

  const res = await fetch(decodeURIComponent(apiUrl), {
    headers,
    next: {
      revalidate: 60 * 5, // revalidate every 5 minutes
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch campaign data');
  }

  const data = await res.json();

  return data;
}
