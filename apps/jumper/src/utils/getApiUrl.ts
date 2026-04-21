import { getLifiBackendOrigin } from '@/utils/apiOrigins';

const getApiUrl = (): string => {
  const suffix = '/v1';
  let apiUrl = getLifiBackendOrigin();
  if (typeof window === 'undefined') {
    return `${apiUrl}${suffix}`;
  }

  const isBetaEnabled = window?.localStorage.getItem('use-beta');

  if (isBetaEnabled) {
    apiUrl = `${apiUrl}/beta`;
  }

  return `${apiUrl}${suffix}`;
};

export default getApiUrl;
