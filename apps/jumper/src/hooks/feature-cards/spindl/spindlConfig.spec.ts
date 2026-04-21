import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSpindlConfig } from './spindlConfig';

describe('getSpindlConfig', () => {
  const originalApiKey = process.env.NEXT_PUBLIC_SPINDL_API_KEY;
  const originalApiUrl = process.env.NEXT_PUBLIC_SPINDL_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SPINDL_API_KEY = '';
    process.env.NEXT_PUBLIC_SPINDL_API_URL = '';
  });

  afterEach(() => {
    if (typeof originalApiKey === 'undefined') {
      delete process.env.NEXT_PUBLIC_SPINDL_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_SPINDL_API_KEY = originalApiKey;
    }

    if (typeof originalApiUrl === 'undefined') {
      delete process.env.NEXT_PUBLIC_SPINDL_API_URL;
    } else {
      process.env.NEXT_PUBLIC_SPINDL_API_URL = originalApiUrl;
    }
  });

  it('returns null when the Spindl env is incomplete', () => {
    process.env.NEXT_PUBLIC_SPINDL_API_KEY = 'test-key';

    expect(getSpindlConfig()).toBeNull();
  });

  it('returns trimmed headers when the Spindl env is configured', () => {
    process.env.NEXT_PUBLIC_SPINDL_API_KEY = '  test-key  ';
    process.env.NEXT_PUBLIC_SPINDL_API_URL = '  https://spindl.example  ';

    expect(getSpindlConfig()).toEqual({
      apiUrl: 'https://spindl.example',
      headers: {
        'Content-Type': 'application/json',
        'X-API-ACCESS-KEY': 'test-key',
      },
    });
  });
});
