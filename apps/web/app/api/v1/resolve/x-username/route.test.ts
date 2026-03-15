import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  deriveVaultAddressMock,
  rateLimitMock,
  resolveFreshXUserMock,
  upsertMock,
} = vi.hoisted(() => ({
  deriveVaultAddressMock: vi.fn(),
  rateLimitMock: vi.fn(),
  resolveFreshXUserMock: vi.fn(),
  upsertMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getClientIp: () => '127.0.0.1',
  invalidInputResponse: () =>
    new Response(JSON.stringify({ error: 'Invalid input' }), {
      status: 400,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
    }),
  noStoreJson: (body: unknown, init?: ResponseInit) =>
    new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    }),
}));

vi.mock('@/lib/sui', () => ({
  deriveVaultAddress: deriveVaultAddressMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      upsert: upsertMock,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/x-user-lookup', () => ({
  getXLookupErrorDetails: () => ({
    status: 503,
    error: 'X lookup is temporarily unavailable',
  }),
  resolveFreshXUser: resolveFreshXUserMock,
}));

import { POST } from './route';

describe('POST /api/v1/resolve/x-username', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TWITTER_API_KEY = 'test-api-key';
    process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID = 'test-registry-id';
    rateLimitMock.mockResolvedValue({ allowed: true });
    deriveVaultAddressMock.mockReturnValue('0xvault');
    upsertMock.mockResolvedValue({});
  });

  it('sanitizes untrusted profile picture URLs before persistence and response', async () => {
    resolveFreshXUserMock.mockResolvedValue({
      xUserId: '12345',
      username: 'testuser',
      profilePicture: 'https://evil.twimg.com/avatar.jpg',
      isBlueVerified: true,
    });

    const req = new NextRequest('http://localhost/api/v1/resolve/x-username', {
      method: 'POST',
      body: JSON.stringify({ username: 'testuser' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(upsertMock).toHaveBeenCalledWith({
      where: { xUserId: '12345' },
      update: {
        username: 'testuser',
        profilePicture: null,
        isBlueVerified: true,
      },
      create: {
        xUserId: '12345',
        username: 'testuser',
        profilePicture: null,
        isBlueVerified: true,
        derivationVersion: 1,
      },
    });
    await expect(res.json()).resolves.toEqual({
      xUserId: '12345',
      username: 'testuser',
      profilePicture: null,
      isBlueVerified: true,
      derivationVersion: 1,
      vaultAddress: '0xvault',
    });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
