import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  loadOwnerWalletMock,
  rateLimitMock,
  resolveEarnMandateTargetMock,
  getDefaultUserAgentMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  loadOwnerWalletMock: vi.fn(),
  rateLimitMock: vi.fn(),
  resolveEarnMandateTargetMock: vi.fn(),
  getDefaultUserAgentMock: vi.fn(),
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
  getAgentMandateConfig: (targetAddress: string, userAgent: { id: string; agentAddress: string; label: string } | null) => ({
    agentAddress: userAgent?.agentAddress ?? '',
    userAgentId: userAgent?.id ?? null,
    agentLabel: userAgent?.label ?? null,
    executionMode: 'external_runner',
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
    agentAddress: '',
    userAgentId: null,
    agentLabel: null,
    executionMode: 'external_runner',
    templates: [],
    error,
  }),
  resolveEarnMandateTarget: resolveEarnMandateTargetMock,
}));

vi.mock('@/lib/agent/user-agent', () => ({
  getDefaultUserAgent: getDefaultUserAgentMock,
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
    resolveEarnMandateTargetMock.mockResolvedValue({
      ok: true,
      targetAddress: TARGET,
    });
    getDefaultUserAgentMock.mockResolvedValue({
      id: 'user-agent-id',
      agentAddress: AGENT,
      label: 'External agent',
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
    expect(resolveEarnMandateTargetMock).not.toHaveBeenCalled();
  });

  it('returns the current wallet StableLayer Earn account target', async () => {
    const req = new NextRequest('http://localhost/api/v1/agent/config', {
      headers: { origin: 'http://localhost' },
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      agentAddress: AGENT,
      userAgentId: 'user-agent-id',
      agentLabel: 'External agent',
      executionMode: 'external_runner',
      templates: [
        {
          id: 'stablelayer-earn',
          label: 'StableLayer Earn',
          description: 'Deposit, withdraw, or harvest yield for your Earn account target.',
          targetAddress: TARGET,
        },
      ],
    });
    expect(resolveEarnMandateTargetMock).toHaveBeenCalledWith({
      xUserId: '12345',
      senderAddress: OWNER_ADDRESS,
    });
  });

  it('returns a disabled config when Earn target resolution fails', async () => {
    resolveEarnMandateTargetMock.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'Wallet binding has an invalid Sui address.',
    });
    const req = new NextRequest('http://localhost/api/v1/agent/config', {
      headers: { origin: 'http://localhost' },
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      agentAddress: '',
      userAgentId: null,
      agentLabel: null,
      executionMode: 'external_runner',
      templates: [],
      error: 'Wallet binding has an invalid Sui address.',
    });
  });
});
