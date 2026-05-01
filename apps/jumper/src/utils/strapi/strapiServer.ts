function getServerEnvValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

export function isStrapiConfigured(): boolean {
  return !!getServerEnvValue('STRAPI_URL', 'NEXT_PUBLIC_STRAPI_URL');
}

export function getServerStrapiBaseUrl() {
  const value = getServerEnvValue('STRAPI_URL', 'NEXT_PUBLIC_STRAPI_URL');

  if (!value) {
    throw new Error('Server Strapi URL is not provided.');
  }

  return value.replace(/\/+$/, '');
}

export function getOptionalServerStrapiApiAccessToken() {
  return getServerEnvValue('STRAPI_API_TOKEN', 'NEXT_PUBLIC_STRAPI_API_TOKEN');
}

export function getServerStrapiHeaders(): HeadersInit | undefined {
  const token = getOptionalServerStrapiApiAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}
