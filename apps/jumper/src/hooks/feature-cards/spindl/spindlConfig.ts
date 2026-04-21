import config from '@/config/env-config';

export interface SpindlConfig {
  apiUrl: string;
  headers: {
    'Content-Type': 'application/json';
    'X-API-ACCESS-KEY': string;
  };
}

export const getSpindlConfig = (): SpindlConfig | null => {
  const apiKey = config.NEXT_PUBLIC_SPINDL_API_KEY?.trim();
  const apiUrl = config.NEXT_PUBLIC_SPINDL_API_URL?.trim();

  if (!apiKey || !apiUrl) {
    return null;
  }

  return {
    apiUrl,
    headers: {
      'Content-Type': 'application/json',
      'X-API-ACCESS-KEY': apiKey,
    },
  };
};
