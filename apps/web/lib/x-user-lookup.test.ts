import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findFirst, normalizeXUsername, resolveXUser } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  resolveXUser: vi.fn(),
  normalizeXUsername: vi.fn((username: string) =>
    username.startsWith('@') ? username.slice(1) : username,
  ),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findFirst,
    },
  },
}));

vi.mock('@/lib/twitter', async () => {
  const actual = await vi.importActual<typeof import('@/lib/twitter')>('@/lib/twitter');
  return {
    ...actual,
    normalizeXUsername,
    resolveXUser,
  };
});

import { TwitterApiError } from '@/lib/twitter';
import { getXLookupErrorDetails, resolveFreshXUser } from './x-user-lookup';

describe('resolveFreshXUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a recent cached user before calling the provider', async () => {
    findFirst.mockResolvedValueOnce({
      xUserId: '123',
      username: 'death_xyz',
      profilePicture: 'https://example.com/pfp.png',
      isBlueVerified: true,
    });

    const result = await resolveFreshXUser('@death_xyz', 'test-api-key');

    expect(normalizeXUsername).toHaveBeenCalledWith('@death_xyz');
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        accountStatus: 'ACTIVE',
        updatedAt: { gte: expect.any(Date) },
        username: {
          equals: 'death_xyz',
          mode: 'insensitive',
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    expect(resolveXUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      xUserId: '123',
      username: 'death_xyz',
      profilePicture: 'https://example.com/pfp.png',
      isBlueVerified: true,
    });
  });

  it('falls back to the provider when no fresh cache entry exists', async () => {
    findFirst.mockResolvedValueOnce(null);
    resolveXUser.mockResolvedValueOnce({
      xUserId: '456',
      username: 'fresh_user',
      profilePicture: null,
      isBlueVerified: false,
    });

    const result = await resolveFreshXUser('fresh_user', 'test-api-key');

    expect(resolveXUser).toHaveBeenCalledWith('fresh_user', 'test-api-key');
    expect(result).toEqual({
      xUserId: '456',
      username: 'fresh_user',
      profilePicture: null,
      isBlueVerified: false,
    });
  });
});

describe('getXLookupErrorDetails', () => {
  it('preserves upstream rate limiting as a client-visible 429', () => {
    expect(
      getXLookupErrorDetails(new TwitterApiError('Twitter API returned 429', 429)),
    ).toEqual({
      status: 429,
      error: 'X lookup is temporarily rate limited. Please try again in a minute.',
      headers: { 'Retry-After': '60' },
    });
  });

  it('maps upstream timeouts to 504', () => {
    expect(
      getXLookupErrorDetails(new TwitterApiError('Twitter API request timed out', 504)),
    ).toEqual({
      status: 504,
      error: 'X lookup timed out. Please try again.',
    });
  });

  it('maps other failures to 503', () => {
    expect(getXLookupErrorDetails(new Error('boom'))).toEqual({
      status: 503,
      error: 'X lookup is temporarily unavailable',
    });
  });
});
