import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  buildEarnAuthorizationRequestMock,
  executeEarnActionMock,
  rateLimitMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  buildEarnAuthorizationRequestMock: vi.fn(),
  executeEarnActionMock: vi.fn(),
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
  buildEarnAuthorizationRequest: buildEarnAuthorizationRequestMock,
  executeEarnAction: executeEarnActionMock,
}));

import { POST } from './route';

describe('POST /api/v1/earn/execute', () => {
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
    buildEarnAuthorizationRequestMock.mockReturnValue({
      version: 1,
      method: 'POST',
      url: 'https://api.privy.io/v1/wallets/wallet-id/raw_sign',
      body: {
        params: {
          bytes: '010203',
          encoding: 'hex',
          hash_function: 'blake2b256',
        },
      },
      headers: {
        'privy-app-id': 'privy-app-id',
      },
    });
  });

  it('returns a Privy authorization request before executing an earn action', async () => {
    executeEarnActionMock.mockResolvedValue({
      status: 'authorization_required',
      authorizationRequest: buildEarnAuthorizationRequestMock(),
    });

    const req = new NextRequest('http://localhost/api/v1/earn/execute', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        previewToken: 'preview-token',
      }),
    });

    const res = await POST(req);

    expect(executeEarnActionMock).toHaveBeenCalledWith({
      xUserId: '12345',
      previewToken: 'preview-token',
      authorizationSignature: undefined,
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'authorization_required',
      authorizationRequest: buildEarnAuthorizationRequestMock(),
    });
  });

  it('returns the final earn execution result after authorization', async () => {
    executeEarnActionMock.mockResolvedValue({
      status: 'confirmed',
      action: 'withdraw',
      txDigest: '4VjVtWjfxk7M6j9U1k7vKJ5d2Ks5FZg7Q5W2E3xYwA1',
    });

    const req = new NextRequest('http://localhost/api/v1/earn/execute', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
      },
      body: JSON.stringify({
        previewToken: 'preview-token',
        authorizationSignature: 'client-authorization-signature',
      }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'confirmed',
      action: 'withdraw',
      txDigest: '4VjVtWjfxk7M6j9U1k7vKJ5d2Ks5FZg7Q5W2E3xYwA1',
    });
  });
});
