import { beforeEach, describe, expect, it, vi } from 'vitest';

const getIdentityTokenMock = vi.fn();

vi.mock('@privy-io/react-auth', () => ({
  getIdentityToken: getIdentityTokenMock,
}));

describe('resolvePrivySignerTokens', () => {
  beforeEach(() => {
    vi.resetModules();
    getIdentityTokenMock.mockReset();
  });

  it('prefers the cached identity token from the Privy provider state', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('session-access-token');
    const { resolvePrivySignerTokens } = await import(
      './resolvePrivySignerTokens'
    );

    await expect(
      resolvePrivySignerTokens({
        cachedIdentityToken: 'cached-identity-token',
        getAccessToken,
      }),
    ).resolves.toEqual({
      identityToken: 'cached-identity-token',
      sessionJwt: 'session-access-token',
    });

    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(getIdentityTokenMock).not.toHaveBeenCalled();
  });

  it('falls back to the headless Privy getter when the cached identity token is missing', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('session-access-token');
    getIdentityTokenMock.mockResolvedValue('fresh-identity-token');
    const { resolvePrivySignerTokens } = await import(
      './resolvePrivySignerTokens'
    );

    await expect(
      resolvePrivySignerTokens({
        cachedIdentityToken: null,
        getAccessToken,
      }),
    ).resolves.toEqual({
      identityToken: 'fresh-identity-token',
      sessionJwt: 'session-access-token',
    });

    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(getIdentityTokenMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast when the Privy session token is missing', async () => {
    const getAccessToken = vi.fn().mockResolvedValue(null);
    const { resolvePrivySignerTokens } = await import(
      './resolvePrivySignerTokens'
    );

    await expect(
      resolvePrivySignerTokens({
        cachedIdentityToken: 'cached-identity-token',
        getAccessToken,
      }),
    ).rejects.toThrow('Missing Privy session token');

    expect(getIdentityTokenMock).not.toHaveBeenCalled();
  });

  it('surfaces a missing identity token after the headless fallback', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('session-access-token');
    getIdentityTokenMock.mockResolvedValue(null);
    const { resolvePrivySignerTokens } = await import(
      './resolvePrivySignerTokens'
    );

    await expect(
      resolvePrivySignerTokens({
        cachedIdentityToken: null,
        getAccessToken,
      }),
    ).rejects.toThrow('Missing Privy identity token');
  });
});
