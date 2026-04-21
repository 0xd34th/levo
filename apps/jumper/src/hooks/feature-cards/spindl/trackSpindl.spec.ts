import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callRequest } from 'src/utils/callRequest';
import { trackSpindl } from './trackSpindl';

vi.mock('src/utils/callRequest', () => ({
  callRequest: vi.fn(),
}));

describe('trackSpindl', () => {
  const originalApiKey = process.env.NEXT_PUBLIC_SPINDL_API_KEY;
  const originalApiUrl = process.env.NEXT_PUBLIC_SPINDL_API_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SPINDL_API_KEY = '';
    process.env.NEXT_PUBLIC_SPINDL_API_URL = '';
    vi.mocked(callRequest).mockReset();
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

  it('skips tracking when the Spindl env is missing', async () => {
    await trackSpindl('impression', 'impression-1', 'creative-1');

    expect(callRequest).not.toHaveBeenCalled();
  });

  it('forwards impression tracking when the Spindl env is configured', async () => {
    process.env.NEXT_PUBLIC_SPINDL_API_KEY = 'spindl-key';
    process.env.NEXT_PUBLIC_SPINDL_API_URL = 'https://spindl.example';

    await trackSpindl('impression', 'impression-1', 'creative-1');

    expect(callRequest).toHaveBeenCalledWith({
      method: 'POST',
      path: '/external/track',
      apiUrl: 'https://spindl.example',
      body: {
        type: 'impression',
        placement_id: 'notify_message',
        impression_id: 'impression-1',
        ad_creative_id: 'creative-1',
      },
      headers: {
        'Content-Type': 'application/json',
        'X-API-ACCESS-KEY': 'spindl-key',
      },
    });
  });
});
