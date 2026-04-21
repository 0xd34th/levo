import config from '@/config/env-config';

const stripTrailingSlashes = (url: string) => url.replace(/\/+$/, '');

const getServerOverride = (key: string) => process.env[key]?.trim() ?? '';
const DEFAULT_BACKEND_ORIGIN = 'https://api-develop.jumper.exchange/v1';
const DEFAULT_LIFI_BACKEND_ORIGIN =
  'https://api-develop.jumper.exchange/pipeline';

export const getBackendOrigin = (): string => {
  const url =
    typeof window === 'undefined'
      ? getServerOverride('JUMPER_INTERNAL_BACKEND_URL') ||
        config.NEXT_PUBLIC_BACKEND_URL ||
        DEFAULT_BACKEND_ORIGIN
      : config.NEXT_PUBLIC_BACKEND_URL || '/api/jumper/v1';

  return stripTrailingSlashes(url);
};

export const getLifiBackendOrigin = (): string => {
  const url =
    typeof window === 'undefined'
      ? getServerOverride('LIFI_INTERNAL_BACKEND_URL') ||
        config.NEXT_PUBLIC_LIFI_BACKEND_URL ||
        DEFAULT_LIFI_BACKEND_ORIGIN
      : config.NEXT_PUBLIC_LIFI_BACKEND_URL || '/api/jumper/pipeline';

  return stripTrailingSlashes(url);
};
