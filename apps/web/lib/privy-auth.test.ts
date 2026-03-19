import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authVerifyAccessTokenMock,
  cookiesMock,
  userGetByIdMock,
  userGetFromIdentityTokenMock,
} = vi.hoisted(() => ({
  authVerifyAccessTokenMock: vi.fn(),
  cookiesMock: vi.fn(),
  userGetByIdMock: vi.fn(),
  userGetFromIdentityTokenMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('@privy-io/node', () => {
  class InvalidAuthTokenError extends Error {}

  class PrivyClient {
    users() {
      return {
        _get: userGetByIdMock,
        get: userGetFromIdentityTokenMock,
      };
    }

    utils() {
      return {
        auth() {
          return {
            verifyAccessToken: authVerifyAccessTokenMock,
          };
        },
      };
    }
  }

  return {
    InvalidAuthTokenError,
    PrivyClient,
  };
});

import {
  getPrivyAccessToken,
  getPrivyUserJwt,
  verifyPrivyXAuth,
} from './privy-auth';

describe('getPrivyAccessToken', () => {
  it('returns the bearer access token from the request when present', () => {
    expect(
      getPrivyAccessToken(
        new Request('http://localhost/api/v1/payments/send', {
          headers: { Authorization: 'Bearer privy-access-token' },
        }),
      ),
    ).toBe('privy-access-token');
  });

  it('returns null when the bearer access token is missing', () => {
    expect(getPrivyAccessToken()).toBeNull();
  });
});

describe('getPrivyUserJwt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
  });

  it('prefers the Privy identity token header from the request', async () => {
    const token = await getPrivyUserJwt(
      new Request('http://localhost/api/v1/payments/claim', {
        headers: { 'X-Privy-Identity-Token': 'privy-identity-token' },
      }),
    );

    expect(token).toBe('privy-identity-token');
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it('falls back to the identity-token cookie', async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn((name: string) => (name === 'privy-id-token' ? { value: 'privy-id-token' } : undefined)),
    });

    await expect(getPrivyUserJwt()).resolves.toBe('privy-id-token');
  });
});

describe('verifyPrivyXAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'privy-app-id';
    process.env.PRIVY_APP_SECRET = 'privy-app-secret';

    authVerifyAccessTokenMock.mockResolvedValue({
      user_id: 'did:privy:user-123',
    });
    userGetByIdMock.mockResolvedValue({
      id: 'did:privy:user-123',
      linked_accounts: [
        {
          type: 'twitter_oauth',
          subject: '12345',
          username: 'alice',
          profile_picture_url: 'https://pbs.twimg.com/profile_images/alice.jpg',
        },
      ],
    });
    userGetFromIdentityTokenMock.mockResolvedValue({
      id: 'did:privy:user-123',
      linked_accounts: [
        {
          type: 'twitter_oauth',
          subject: '12345',
          username: 'alice',
          profile_picture_url: 'https://pbs.twimg.com/profile_images/alice.jpg',
        },
      ],
    });
    cookiesMock.mockResolvedValue({
      get: vi.fn(() => undefined),
    });
  });

  it('authenticates with a bearer access token when provided', async () => {
    const result = await verifyPrivyXAuth(
      new Request('http://localhost/api/v1/wallet/setup', {
        headers: { Authorization: 'Bearer privy-access-token' },
      }),
    );

    expect(result).toEqual({
      ok: true,
      identity: {
        privyUserId: 'did:privy:user-123',
        xUserId: '12345',
        username: 'alice',
        profilePictureUrl: 'https://pbs.twimg.com/profile_images/alice.jpg',
      },
    });
    expect(authVerifyAccessTokenMock).toHaveBeenCalledWith('privy-access-token');
    expect(userGetByIdMock).toHaveBeenCalledWith('did:privy:user-123');
    expect(cookiesMock).not.toHaveBeenCalled();
  });

  it('falls back to the identity-token cookie when no bearer token is present', async () => {
    cookiesMock.mockResolvedValue({
      get: vi.fn((name: string) => (name === 'privy-id-token' ? { value: 'privy-id-token' } : undefined)),
    });

    const result = await verifyPrivyXAuth();

    expect(result).toEqual({
      ok: true,
      identity: {
        privyUserId: 'did:privy:user-123',
        xUserId: '12345',
        username: 'alice',
        profilePictureUrl: 'https://pbs.twimg.com/profile_images/alice.jpg',
      },
    });
    expect(userGetFromIdentityTokenMock).toHaveBeenCalledWith({ id_token: 'privy-id-token' });
  });

  it('returns 401 when the bearer token is invalid', async () => {
    const { InvalidAuthTokenError } = await import('@privy-io/node');
    authVerifyAccessTokenMock.mockRejectedValue(new InvalidAuthTokenError('bad token'));

    const result = await verifyPrivyXAuth(
      new Request('http://localhost/api/v1/wallet/setup', {
        headers: { Authorization: 'Bearer invalid-token' },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });
});
