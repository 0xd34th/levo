import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  confirmEarnActionMock,
  getGasStationAddressMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  confirmEarnActionMock: vi.fn(),
  getGasStationAddressMock: vi.fn(() => '0xgasstation'),
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
  confirmEarnAction: confirmEarnActionMock,
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationAddress: getGasStationAddressMock,
}));

import { POST } from './route';

describe('POST /api/v1/earn/confirm', () => {
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
    getGasStationAddressMock.mockReturnValue('0xgasstation');
  });

  it('returns 202 while the earn transaction is still pending', async () => {
    confirmEarnActionMock.mockResolvedValue({
      status: 'pending',
      txDigest: '4VjVtWjfxk7M6j9U1k7vKJ5d2Ks5FZg7Q5W2E3xYwA1',
    });

    const req = new NextRequest('http://localhost/api/v1/earn/confirm', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        txDigest: '4VjVtWjfxk7M6j9U1k7vKJ5d2Ks5FZg7Q5W2E3xYwA1',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({
      status: 'pending',
      txDigest: '4VjVtWjfxk7M6j9U1k7vKJ5d2Ks5FZg7Q5W2E3xYwA1',
    });
  });

  it('annotates raw sponsor gas errors at the confirm route boundary', async () => {
    confirmEarnActionMock.mockRejectedValue(
      new Error('No valid gas coins found for the transaction.'),
    );

    const req = new NextRequest('http://localhost/api/v1/earn/confirm', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        txDigest: '4VjVtWjfxk7M6j9U1k7vKJ5d2Ks5FZg7Q5W2E3xYwA1',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'No valid gas coins found for the transaction. Gas station address: 0xgasstation',
    });
  });
});
