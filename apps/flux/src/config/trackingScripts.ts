interface TrackingScriptConfig {
  addressableTrackingId: string;
  googleAnalyticsTrackingId: string;
  jumperTrackingEnabled: boolean;
}

interface TrackingEnv {
  NEXT_PUBLIC_ADDRESSABLE_TID?: string;
  NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID?: string;
  NEXT_PUBLIC_JUMPER_TRACKING_ENABLED?: string;
}

const normalizeTrackingId = (value: string | undefined): string => {
  return value?.trim() ?? '';
};

const normalizeTrackingFlag = (value: string | undefined): boolean => {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
};

export function getTrackingScriptConfig(env: TrackingEnv): TrackingScriptConfig {
  return {
    googleAnalyticsTrackingId: normalizeTrackingId(
      env.NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID,
    ),
    addressableTrackingId: normalizeTrackingId(env.NEXT_PUBLIC_ADDRESSABLE_TID),
    jumperTrackingEnabled: normalizeTrackingFlag(
      env.NEXT_PUBLIC_JUMPER_TRACKING_ENABLED,
    ),
  };
}

export function isJumperTrackingEnabled(env: TrackingEnv): boolean {
  return getTrackingScriptConfig(env).jumperTrackingEnabled;
}
