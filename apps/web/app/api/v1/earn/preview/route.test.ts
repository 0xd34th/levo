import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  previewEarnActionMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  previewEarnActionMock: vi.fn(),
  rateLimitMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/stable-layer-earn', () => ({
  previewEarnAction: previewEarnActionMock,
}));

import { POST } from './route';

describe('POST /api/v1/earn/preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        xUserId: '12345',
      },
    });
    previewEarnActionMock.mockResolvedValue({
      previewToken: 'preview-token',
      action: 'claim',
      amount: '0',
      availableUsdc: '4200000',
      depositedUsdc: '1200000',
      claimableYieldUsdc: '90000',
      claimableYieldReliable: true,
      yieldSettlementMode: 'server_payout',
      principalReceivesUsdc: '0',
      yieldReceivesUsdc: '90000',
      userReceivesUsdc: '90000',
    });
  });

  it('returns a USDC-denominated preview token for claim', async () => {
    const req = new NextRequest('http://localhost/api/v1/earn/preview', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        action: 'claim',
      }),
    });

    const res = await POST(req);

    expect(previewEarnActionMock).toHaveBeenCalledWith({
      xUserId: '12345',
      action: 'claim',
      amount: undefined,
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      previewToken: 'preview-token',
      action: 'claim',
      amount: '0',
      availableUsdc: '4200000',
      depositedUsdc: '1200000',
      claimableYieldUsdc: '90000',
      claimableYieldReliable: true,
      yieldSettlementMode: 'server_payout',
      principalReceivesUsdc: '0',
      yieldReceivesUsdc: '90000',
      userReceivesUsdc: '90000',
    });
  });
});
