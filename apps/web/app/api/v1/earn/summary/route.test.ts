import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  getEarnSummaryMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
} = vi.hoisted(() => ({
  getEarnSummaryMock: vi.fn(),
  rateLimitMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
  };
});

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/stable-layer-earn', () => ({
  getEarnSummary: getEarnSummaryMock,
}));

import { GET } from './route';

describe('GET /api/v1/earn/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        xUserId: '12345',
      },
    });
    getEarnSummaryMock.mockResolvedValue({
      walletReady: true,
      availableUsdc: '4200000',
      depositedUsdc: '1200000',
      claimableYieldUsdc: '90000',
    });
  });

  it('returns the USDC-only earn summary for the authenticated user', async () => {
    const req = new NextRequest('http://localhost/api/v1/earn/summary');

    const res = await GET(req);

    expect(rateLimitMock).toHaveBeenCalledWith('earn-summary:127.0.0.1', 60, 30);
    expect(getEarnSummaryMock).toHaveBeenCalledWith({
      xUserId: '12345',
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      walletReady: true,
      availableUsdc: '4200000',
      depositedUsdc: '1200000',
      claimableYieldUsdc: '90000',
    });
  });
});
