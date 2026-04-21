import config from '@/config/env-config';

const stripTrailingSlashes = (url: string) => url.replace(/\/+$/, '');

const getServerOverride = (key: string) => process.env[key]?.trim() ?? '';

export const getBackendOrigin = (): string => {
  const url =
    typeof window === 'undefined'
      ? getServerOverride('JUMPER_INTERNAL_BACKEND_URL') ||
        config.NEXT_PUBLIC_BACKEND_URL
      : config.NEXT_PUBLIC_BACKEND_URL;

  return stripTrailingSlashes(url);
};

export const getLifiBackendOrigin = (): string => {
  const url =
    typeof window === 'undefined'
      ? getServerOverride('LIFI_INTERNAL_BACKEND_URL') ||
        config.NEXT_PUBLIC_LIFI_BACKEND_URL
      : config.NEXT_PUBLIC_LIFI_BACKEND_URL;

  return stripTrailingSlashes(url);
};
