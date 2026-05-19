import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  loadOwnerWalletMock,
  rateLimitMock,
  resolveEarnRetainedAccountTargetMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  loadOwnerWalletMock: vi.fn(),
  rateLimitMock: vi.fn(),
  resolveEarnRetainedAccountTargetMock: vi.fn(),
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

vi.mock('@/lib/agent/mandate-flow', () => ({
  loadOwnerWallet: loadOwnerWalletMock,
}));

vi.mock('@/lib/agent/config', () => ({
  getAgentMandateConfig: (targetAddress: string) => ({
    agentAddress: process.env.NEXT_PUBLIC_LEVO_AGENT_ADDRESS ?? '',
    templates: [
      {
        id: 'stablelayer-earn',
        label: 'StableLayer Earn',
        description: 'Deposit, withdraw, or harvest yield for your Earn account target.',
        targetAddress,
      },
    ],
  }),
  getDisabledAgentMandateConfig: (error: string) => ({
    agentAddress: process.env.NEXT_PUBLIC_LEVO_AGENT_ADDRESS ?? '',
    templates: [],
    error,
  }),
  resolveEarnRetainedAccountTarget: resolveEarnRetainedAccountTargetMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

import { GET } from './route';

const AGENT = '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b';
const TARGET = '0x000000000000000000000000000000000000000000000000000000000000be11';
const OWNER_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000123';

describe('GET /api/v1/agent/config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_LEVO_AGENT_ADDRESS = AGENT;
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '12345',
        username: 'sender',
        profilePictureUrl: null,
      },
    });
    loadOwnerWalletMock.mockResolvedValue({ xUserId: '12345', suiAddress: OWNER_ADDRESS });
    resolveEarnRetainedAccountTargetMock.mockResolvedValue({
      ok: true,
      targetAddress: TARGET,
    });
  });

  it('requires Privy authentication', async () => {
    const authResponse = new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
    });
    verifyPrivyXAuthMock.mockResolvedValue({ ok: false, response: authResponse });

    const req = new NextRequest('http://localhost/api/v1/agent/config', {
      headers: { origin: 'http://localhost' },
    });

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(resolveEarnRetainedAccountTargetMock).not.toHaveBeenCalled();
  });

  it('returns the current wallet StableLayer Earn account target', async () => {
    const req = new NextRequest('http://localhost/api/v1/agent/config', {
      headers: { origin: 'http://localhost' },
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      agentAddress: AGENT,
      templates: [
        {
          id: 'stablelayer-earn',
          label: 'StableLayer Earn',
          description: 'Deposit, withdraw, or harvest yield for your Earn account target.',
          targetAddress: TARGET,
        },
      ],
    });
    expect(resolveEarnRetainedAccountTargetMock).toHaveBeenCalledWith({
      xUserId: '12345',
      senderAddress: OWNER_ADDRESS,
    });
  });

  it('returns a disabled config when no Earn account target exists', async () => {
    resolveEarnRetainedAccountTargetMock.mockResolvedValue({
      ok: false,
      status: 404,
      error: 'No StableLayer Earn account target found for this wallet.',
    });
    const req = new NextRequest('http://localhost/api/v1/agent/config', {
      headers: { origin: 'http://localhost' },
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      agentAddress: AGENT,
      templates: [],
      error: 'No StableLayer Earn account target found for this wallet.',
    });
  });
});
