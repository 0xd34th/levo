import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createMandateMock,
  loadOwnerWalletMock,
  rateLimitMock,
  resolveEarnMandateTargetMock,
  getOrCreateHostedUserAgentMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  createMandateMock: vi.fn(),
  loadOwnerWalletMock: vi.fn(),
  rateLimitMock: vi.fn(),
  resolveEarnMandateTargetMock: vi.fn(),
  getOrCreateHostedUserAgentMock: vi.fn(),
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
  createMandate: createMandateMock,
  loadOwnerWallet: loadOwnerWalletMock,
}));

vi.mock('@/lib/agent/config', () => ({
  resolveEarnMandateTarget: resolveEarnMandateTargetMock,
}));

vi.mock('@/lib/agent/user-agent', () => ({
  getOrCreateHostedUserAgent: getOrCreateHostedUserAgentMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

import { POST } from './route';

const TARGET = '0x000000000000000000000000000000000000000000000000000000000000be11';
const OTHER_TARGET = '0x000000000000000000000000000000000000000000000000000000000000bad1';
const AGENT = '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b';
const OTHER_AGENT = '0x000000000000000000000000000000000000000000000000000000000000dead';
const OWNER_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000123';

function makeBody(overrides: {
  target?: string;
  agent?: string;
  specActions?: number;
  planActionType?: number;
  planCoinType?: string;
  planAmount?: string;
} = {}) {
  const target = overrides.target ?? TARGET;
  const coinType = '0x2::sui::SUI';
  return {
    spec: {
      agent: overrides.agent ?? AGENT,
      actions: overrides.specActions ?? 8,
      coinLimits: [
        {
          coinType,
          perTxCap: '1000000000',
          periodCap: '10000000000',
        },
      ],
      periodMs: '86400000',
      allowedTargets: [target],
      expiryMs: String(Date.now() + 86_400_000),
      metadata: { schedule: '0 9 * * *' },
    },
    plan: [
      {
        actionType: overrides.planActionType ?? 8,
        coinType: overrides.planCoinType ?? coinType,
        target,
        amount: overrides.planAmount ?? '1000000000',
      },
    ],
    metadataName: 'Earn harvest - StableLayer Earn',
  };
}

describe('POST /api/v1/agent/mandate/create', () => {
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
    getOrCreateHostedUserAgentMock.mockResolvedValue({
      id: 'user-agent-id',
      agentAddress: AGENT,
      label: 'Levo hosted agent',
      custodyMode: 'HOSTED',
    });
    createMandateMock.mockResolvedValue({
      status: 'authorization_required',
      authorizationRequest: { version: 1 },
      txBytesBase64: 'AQID',
    });
  });

  it('accepts the wallet StableLayer Earn account target', async () => {
    const req = new NextRequest('http://localhost/api/v1/agent/mandate/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(makeBody()),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(loadOwnerWalletMock).toHaveBeenCalledWith('12345');
    expect(resolveEarnMandateTargetMock).toHaveBeenCalledWith({
      xUserId: '12345',
      senderAddress: OWNER_ADDRESS,
    });
    expect(createMandateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userAgent: expect.objectContaining({ id: 'user-agent-id', agentAddress: AGENT }),
        metadataName: 'Earn harvest - StableLayer Earn',
      }),
    );
  });

  it('uses hosted provisioning instead of failing when no external runner exists', async () => {
    const req = new NextRequest('http://localhost/api/v1/agent/mandate/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(makeBody()),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(getOrCreateHostedUserAgentMock).toHaveBeenCalledWith('12345');
    expect(createMandateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userAgent: expect.objectContaining({
          id: 'user-agent-id',
          agentAddress: AGENT,
        }),
      }),
    );
  });

  it('rejects mandate targets outside the configured template', async () => {
    const req = new NextRequest('http://localhost/api/v1/agent/mandate/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(makeBody({ target: OTHER_TARGET })),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Mandate target is not this wallet's StableLayer Earn account target",
    });
    expect(createMandateMock).not.toHaveBeenCalled();
  });

  it('rejects creation when Earn target resolution fails for the wallet', async () => {
    resolveEarnMandateTargetMock.mockResolvedValue({
      ok: false,
      status: 400,
      error: 'Wallet binding has an invalid Sui address.',
    });
    const req = new NextRequest('http://localhost/api/v1/agent/mandate/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(makeBody()),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Wallet binding has an invalid Sui address.',
    });
    expect(createMandateMock).not.toHaveBeenCalled();
  });

  it('rejects a spec agent outside the active user agent', async () => {
    const req = new NextRequest('http://localhost/api/v1/agent/mandate/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(makeBody({ agent: OTHER_AGENT })),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Mandate agent does not match your hosted agent',
    });
    expect(createMandateMock).not.toHaveBeenCalled();
  });

  it('rejects when hosted provisioning fails', async () => {
    getOrCreateHostedUserAgentMock.mockRejectedValue(new Error('Hosted agent key encryption is not configured.'));
    const req = new NextRequest('http://localhost/api/v1/agent/mandate/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(makeBody()),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Hosted agent key encryption is not configured.',
    });
    expect(createMandateMock).not.toHaveBeenCalled();
  });

  it('rejects a plan action that is not included in the mandate spec', async () => {
    const req = new NextRequest('http://localhost/api/v1/agent/mandate/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(makeBody({ specActions: 2, planActionType: 8 })),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Planned action is not allowed by the mandate spec',
    });
    expect(createMandateMock).not.toHaveBeenCalled();
  });

  it('rejects a plan amount above the per-transaction cap', async () => {
    const req = new NextRequest('http://localhost/api/v1/agent/mandate/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(makeBody({ planAmount: '1000000001' })),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Planned amount exceeds the mandate per-transaction cap',
    });
    expect(createMandateMock).not.toHaveBeenCalled();
  });
});
