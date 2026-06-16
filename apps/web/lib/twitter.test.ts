import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseXUserId, resolveXUser, TwitterApiError } from './twitter';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const MOCK_TWITTERAPI_RESPONSE = {
  id: '123456789',
  userName: 'death_xyz',
  name: 'Death',
  profilePicture: 'https://pbs.twimg.com/photo.jpg',
  isBlueVerified: true,
  unavailable: false,
};

const MOCK_FXTWITTER_RESPONSE = {
  code: 200,
  message: 'OK',
  user: {
    id: '987654321',
    name: 'Death',
    screen_name: 'death_xyz',
    avatar_url: 'https://pbs.twimg.com/fx-photo.jpg',
    verification: {
      verified: true,
    },
  },
};

describe('resolveXUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user info from FxTwitter for a valid username without a paid fallback key', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_FXTWITTER_RESPONSE,
    });

    const result = await resolveXUser('death_xyz');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.fxtwitter.com/death_xyz',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({
      xUserId: '987654321',
      username: 'death_xyz',
      profilePicture: 'https://pbs.twimg.com/fx-photo.jpg',
      isBlueVerified: true,
    });
  });

  it('returns null on FxTwitter 404 without calling the paid fallback', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await resolveXUser('nonexistent_usr', 'test-api-key');

    expect(result).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to twitterapi.io when FxTwitter has a transient provider failure', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: MOCK_TWITTERAPI_RESPONSE,
        }),
      });

    const result = await resolveXUser('death_xyz', 'fallback-api-key');

    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://api.twitterapi.io/twitter/user/info?userName=death_xyz',
      expect.objectContaining({
        method: 'GET',
        headers: { 'X-API-Key': 'fallback-api-key' },
      }),
    );
    expect(result).toEqual({
      xUserId: '123456789',
      username: 'death_xyz',
      profilePicture: 'https://pbs.twimg.com/photo.jpg',
      isBlueVerified: true,
    });
  });

  it('returns a temporary error when FxTwitter is transiently unavailable without a fallback key', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));

    await expect(resolveXUser('death_xyz')).rejects.toEqual(
      new TwitterApiError('X lookup is temporarily unavailable', 503),
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('still parses the legacy twitterapi.io root response shape through fallback', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MOCK_TWITTERAPI_RESPONSE,
      });

    const result = await resolveXUser('death_xyz', 'test-api-key');

    expect(result).toEqual({
      xUserId: '123456789',
      username: 'death_xyz',
      profilePicture: 'https://pbs.twimg.com/photo.jpg',
      isBlueVerified: true,
    });
  });

  it('returns null when the fallback reports the user is unavailable', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      })
      .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ...MOCK_TWITTERAPI_RESPONSE, unavailable: true }),
    });

    const result = await resolveXUser('suspended_user', 'test-api-key');
    expect(result).toBeNull();
  });

  it('sanitizes username — strips @ prefix', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_FXTWITTER_RESPONSE,
    });

    await resolveXUser('@death_xyz');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.fxtwitter.com/death_xyz',
      expect.anything(),
    );
  });

  it('throws on invalid username format', async () => {
    await expect(resolveXUser('inv@lid!')).rejects.toThrow('Invalid username');
  });

  it('treats malformed FxTwitter ids as transient and uses fallback when available', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...MOCK_FXTWITTER_RESPONSE,
          user: { ...MOCK_FXTWITTER_RESPONSE.user, id: 'abc123' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => MOCK_TWITTERAPI_RESPONSE,
      });

    const result = await resolveXUser('death_xyz', 'test-api-key');

    expect(result?.xUserId).toBe('123456789');
  });
});

describe('parseXUserId', () => {
  it('rejects zero-valued ids', () => {
    expect(parseXUserId('0')).toBeNull();
    expect(parseXUserId(0)).toBeNull();
    expect(parseXUserId('0000')).toBeNull();
  });

  it('accepts positive integer ids', () => {
    expect(parseXUserId('1')).toBe('1');
    expect(parseXUserId(123456789)).toBe('123456789');
  });
});
