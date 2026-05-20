import type { HttpResponse, PosthogFeatureFlag } from '@/types/jumper-backend';
import { makeClient } from './client';

export type GetPosthogFeatureFlagResult = HttpResponse<
  PosthogFeatureFlag,
  unknown
>;

export const getPosthogFeatureFlag = async (
  feature: string,
  distinctId: string,
): Promise<GetPosthogFeatureFlagResult> => {
  const client = makeClient();
  return client.v1.postHogControllerGetFeatureFlagV1({
    key: feature,
    distinctId: distinctId,
  });
};
