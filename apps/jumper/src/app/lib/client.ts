import { JumperBackend } from '@/types/jumper-backend';
import { getBackendOrigin } from '@/utils/apiOrigins';

const OPTIONAL_V1_SUFFIX = /\/v1\/?$/;

export const makeClient = (): JumperBackend<unknown> => {
  const baseUrl = getBackendOrigin();
  const baseUrlWithoutV1 = baseUrl.replace(OPTIONAL_V1_SUFFIX, '');

  return new JumperBackend({
    baseUrl: baseUrlWithoutV1,
  });
};
