import config from '@/config/env-config';
import {
  getServerStrapiBaseUrl,
  getServerStrapiHeaders,
} from './strapiServer';

export function getStrapiBaseUrl() {
  // Server-side reads always target the direct Strapi origin so the bearer
  // token attached by `getStrapiRequestHeaders()` never traverses the public
  // app-origin proxy hop. The browser receives the normalized same-origin
  // proxy URL from `config.NEXT_PUBLIC_STRAPI_URL` and never carries a bearer.
  const strapiUrl =
    typeof window === 'undefined'
      ? getServerStrapiBaseUrl()
      : config.NEXT_PUBLIC_STRAPI_URL;

  if (!strapiUrl) {
    console.error('Strapi URL is not provided.');
    throw new Error('Strapi URL is not provided.');
  }
  return strapiUrl.replace(/\/+$/, '');
}

export function getStrapiRequestHeaders(): HeadersInit | undefined {
  return typeof window === 'undefined' ? getServerStrapiHeaders() : undefined;
}
