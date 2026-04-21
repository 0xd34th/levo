import type { StrapiResponse } from '@/types/strapi';
import type { AnnouncementData } from '@/types/announcement';
import config from '@/config/env-config';
import { getStrapiBaseUrl } from '@/utils/strapi/strapiHelper';

export async function getAnnouncements() {
  const apiUrl = new URL(`${getStrapiBaseUrl()}/api/announcements`);
  apiUrl.searchParams.set('populate[0]', 'Logo');
  apiUrl.searchParams.set('sort[0]', 'Priority:desc');

  if (config.NEXT_PUBLIC_ENVIRONMENT !== 'production') {
    apiUrl.searchParams.set('status', 'draft');
  }

  const res = await fetch(decodeURIComponent(apiUrl.href), {
    next: {
      revalidate: 60 * 10,
    },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch announcements');
  }

  const data: StrapiResponse<AnnouncementData> = await res.json();

  return data;
}
