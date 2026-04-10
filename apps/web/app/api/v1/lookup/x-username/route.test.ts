import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { TwitterApiError } from '@/lib/twitter';

const {
  buildPublicLookupResponseMock,
  persistReceivedDashboardXUserMock,
  rateLimitMock,
  resolveFreshXUserMock,
} = vi.hoisted(() => ({
  buildPublicLookupResponseMock: vi.fn(),
  persistReceivedDashboardXUserMock: vi.fn(),
  rateLimitMock: vi.fn(),
  resolveFreshXUserMock: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/received-dashboard', () => ({
  buildPublicLookupResponse: buildPublicLookupResponseMock,
  persistReceivedDashboardXUser: persistReceivedDashboardXUserMock,
}));

vi.mock('@/lib/x-user-lookup', async () => {
  return {
    getXLookupErrorDetails: (error: TwitterApiError) => {
      if (error.status === 429) {
        return {
          status: 429,
          error: 'X lookup is temporarily rate limited. Please try again in a minute.',
          headers: { 'Retry-After': '60' },
        };
      }

      if (error.status === 504) {
        return {
          status: 504,
          error: 'X lookup timed out. Please try again.',
        };
      }

      return {
        status: 503,
        error: 'X lookup is temporarily unavailable',
      };
    },
    resolveFreshXUser: resolveFreshXUserMock,
  };
});

import { GET } from './route';

describe('GET /api/v1/lookup/x-username', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    process.env.TWITTER_API_KEY = 'test-api-key';
    rateLimitMock.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds no-store while preserving Retry-After on provider rate-limit errors', async () => {
    resolveFreshXUserMock.mockRejectedValue(new TwitterApiError('Twitter API returned 429', 429));

    const req = new NextRequest('http://localhost/api/v1/lookup/x-username?username=testuser');

    const res = await GET(req);

    expect(res.status).toBe(429);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('retry-after')).toBe('60');
    await expect(res.json()).resolves.toEqual({
      error: 'X lookup is temporarily rate limited. Please try again in a minute.',
    });
  });

  it('builds public lookup responses without requiring any legacy recipient config', async () => {
    resolveFreshXUserMock.mockResolvedValueOnce({
      xUserId: '12345',
      username: 'testuser',
      profilePicture: 'https://pbs.twimg.com/profile_images/testuser.jpg',
      isBlueVerified: true,
    });
    persistReceivedDashboardXUserMock.mockResolvedValueOnce(1);
    buildPublicLookupResponseMock.mockResolvedValueOnce({
      xUserId: '12345',
      username: 'testuser',
      profilePicture: 'https://pbs.twimg.com/profile_images/testuser.jpg',
      isBlueVerified: true,
      derivationVersion: 1,
      recipientAddress: `0x${'1'.repeat(64)}`,
      walletReady: true,
      pendingBalances: [],
      recordedTotals: [],
      recentIncomingPayments: [],
    });
    const req = new NextRequest('http://localhost/api/v1/lookup/x-username?username=testuser');
    const res = await GET(req);

    expect(buildPublicLookupResponseMock).toHaveBeenCalledWith(
      {
        xUserId: '12345',
        username: 'testuser',
        profilePicture: 'https://pbs.twimg.com/profile_images/testuser.jpg',
        isBlueVerified: true,
      },
      1,
    );
    expect(res.status).toBe(200);
  });
});
