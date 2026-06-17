import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createMandateMock,
  loadOwnerWalletMock,
  rateLimitMock,
  resolveEarnMandateTargetMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
  isDelegatedSigningConfiguredMock,
  xUserFindUniqueMock,
} = vi.hoisted(() => ({
  createMandateMock: vi.fn(),
  loadOwnerWalletMock: vi.fn(),
  rateLimitMock: vi.fn(),
  resolveEarnMandateTargetMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
  isDelegatedSigningConfiguredMock: vi.fn(),
  xUserFindUniqueMock: vi.fn(),
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

vi.mock('@/lib/agent/delegated-signing', () => ({
  isDelegatedSigningConfigured: isDelegatedSigningConfiguredMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { xUser: { findUnique: xUserFindUniqueMock } },
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
const OWNER_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000123';

function makeBody(overrides: {
  target?: string;
  specActions?: number;
  planActionType?: number;
  planAmount?: string;
} = {}) {
  const target = overrides.target ?? TARGET;
  const coinType = '0x2::sui::SUI';
  return {
    spec: {
      agent: AGENT,
      actions: overrides.specActions ?? 8,
      coinLimits: [{ coinType, perTxCap: '1000000000', periodCap: '10000000000' }],
      periodMs: '86400000',
      allowedTargets: [target],
      expiryMs: String(Date.now() + 86_400_000),
      metadata: { schedule: '0 9 * * *' },
    },
    plan: [
      {
        actionType: overrides.planActionType ?? 8,
        coinType,
        target,
        amount: overrides.planAmount ?? '1000000000',
      },
    ],
    metadataName: 'Earn harvest - StableLayer Earn',
  };
}

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/v1/agent/mandate/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/v1/agent/mandate/create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    isDelegatedSigningConfiguredMock.mockReturnValue(true);
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
    xUserFindUniqueMock.mockResolvedValue({ agentDelegatedAt: new Date() });
    resolveEarnMandateTargetMock.mockResolvedValue({ ok: true, targetAddress: TARGET });
    createMandateMock.mockResolvedValue({ status: 'confirmed', mandateRowId: 'mandate-1' });
  });

  it('persists a mandate when the wallet is delegated', async () => {
    const res = await POST(makeReq(makeBody()));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'confirmed', mandateRowId: 'mandate-1' });
    expect(loadOwnerWalletMock).toHaveBeenCalledWith('12345');
    expect(createMandateMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadataName: 'Earn harvest - StableLayer Earn' }),
    );
    // No on-chain hosted agent is involved in the DB mandate path.
    expect(createMandateMock.mock.calls[0][0]).not.toHaveProperty('userAgent');
  });

  it('requires delegation before creating a mandate', async () => {
    xUserFindUniqueMock.mockResolvedValue({ agentDelegatedAt: null });

    const res = await POST(makeReq(makeBody()));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'delegation_required' });
    expect(createMandateMock).not.toHaveBeenCalled();
  });

  it('rejects mandate targets outside the configured template', async () => {
    const res = await POST(makeReq(makeBody({ target: OTHER_TARGET })));

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

    const res = await POST(makeReq(makeBody()));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Wallet binding has an invalid Sui address.',
    });
    expect(createMandateMock).not.toHaveBeenCalled();
  });

  it('rejects a plan action that is not included in the mandate spec', async () => {
    const res = await POST(makeReq(makeBody({ specActions: 2, planActionType: 8 })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Planned action is not allowed by the mandate spec',
    });
    expect(createMandateMock).not.toHaveBeenCalled();
  });

  it('rejects a plan amount above the per-transaction cap', async () => {
    const res = await POST(makeReq(makeBody({ planAmount: '1000000001' })));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Planned amount exceeds the mandate per-transaction cap',
    });
    expect(createMandateMock).not.toHaveBeenCalled();
  });
});
