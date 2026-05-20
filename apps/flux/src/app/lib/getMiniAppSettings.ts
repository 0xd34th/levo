import {
  getServerStrapiHeaders,
  getServerStrapiBaseUrl,
  isStrapiConfigured,
} from 'src/utils/strapi/strapiServer';
import envConfig from '@/config/env-config';
import type { StrapiResponse } from '@/types/strapi';

const BASE_MINI_APP_SETTING_API_ENDPOINT = 'base-mini-app-settings';

export interface MiniAppSettingAttributes {
  id: number;
  documentId: string;
  appId: string;
  url: string;
  // Using any, because it's just a JSON object
  accountAssociation: any;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

const EMPTY_MINI_APP_SETTINGS: MiniAppSettingAttributes = {
  id: 0,
  documentId: '',
  appId: '',
  url: '',
  accountAssociation: {},
  createdAt: '',
  updatedAt: '',
};

export async function getMiniAppSettings(): Promise<MiniAppSettingAttributes> {
  if (!isStrapiConfigured()) {
    return EMPTY_MINI_APP_SETTINGS;
  }

  const publicUrl = new URL(envConfig.NEXT_PUBLIC_SITE_URL);

  const baseUrl = getServerStrapiBaseUrl();
  const headers = getServerStrapiHeaders();

  const apiUrl = new URL(
    `${baseUrl}/api/${BASE_MINI_APP_SETTING_API_ENDPOINT}`,
  );
  apiUrl.searchParams.set('filters[url][$eq]', publicUrl.origin);

  const res = await fetch(apiUrl.toString(), {
    headers,
    next: { revalidate: 60 * 5 },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch mini app settings: ${apiUrl.toString()} - ${res.statusText}`,
    );
  }

  const data: StrapiResponse<MiniAppSettingAttributes> = await res.json();
  if (!data.data[0]) {
    throw new Error(`No mini app settings found for ${publicUrl.origin}`);
  }
  return data.data[0];
}
