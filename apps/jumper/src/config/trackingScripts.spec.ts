import { describe, expect, it } from 'vitest';
import { getTrackingScriptConfig } from './trackingScripts';

describe('getTrackingScriptConfig', () => {
  it('returns empty IDs when tracking config is blank', () => {
    expect(
      getTrackingScriptConfig({
        NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID: '  ',
        NEXT_PUBLIC_ADDRESSABLE_TID: '',
      }),
    ).toEqual({
      googleAnalyticsTrackingId: '',
      addressableTrackingId: '',
    });
  });

  it('trims configured tracking IDs', () => {
    expect(
      getTrackingScriptConfig({
        NEXT_PUBLIC_GOOGLE_ANALYTICS_TRACKING_ID: ' G-TEST ',
        NEXT_PUBLIC_ADDRESSABLE_TID: ' tid-123 ',
      }),
    ).toEqual({
      googleAnalyticsTrackingId: 'G-TEST',
      addressableTrackingId: 'tid-123',
    });
  });
});
