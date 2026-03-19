import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { privyAuthenticatedFetch } from './privy-fetch';

describe('privyAuthenticatedFetch', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds the bearer access token while preserving existing headers', async () => {
    await privyAuthenticatedFetch(
      async () => 'privy-access-token',
      '/api/v1/wallet/setup',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/wallet/setup', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        Authorization: 'Bearer privy-access-token',
      }),
    });
  });

  it('adds the Privy identity token when provided', async () => {
    await privyAuthenticatedFetch(
      async () => 'privy-access-token',
      '/api/v1/payments/send',
      {
        method: 'POST',
      },
      {
        identityToken: 'privy-identity-token',
      },
    );

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/payments/send', {
      method: 'POST',
      headers: new Headers({
        Authorization: 'Bearer privy-access-token',
        'X-Privy-Identity-Token': 'privy-identity-token',
      }),
    });
  });

  it('fails fast when the user is not authenticated', async () => {
    await expect(
      privyAuthenticatedFetch(async () => null, '/api/v1/wallet/setup'),
    ).rejects.toThrow('Not authenticated');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
