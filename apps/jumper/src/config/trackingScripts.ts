interface TrackingScriptConfig {
  addressableTrackingId: string;
  googleAnalyticsTrackingId: string;
}

interface TrackingEnv {
  NEXT_PUBLIC_ADDRESSABLE_TID?: string;
  NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID?: string;
}

const normalizeTrackingId = (value: string | undefined): string => {
  return value?.trim() ?? '';
};

export function getTrackingScriptConfig(env: TrackingEnv): TrackingScriptConfig {
  return {
    googleAnalyticsTrackingId: normalizeTrackingId(
      env.NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID,
    ),
    addressableTrackingId: normalizeTrackingId(env.NEXT_PUBLIC_ADDRESSABLE_TID),
  };
}
