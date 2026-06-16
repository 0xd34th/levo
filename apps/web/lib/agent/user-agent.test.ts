import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    userAgent: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

const HOSTED_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64');

describe('hosted agent key custody', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.LEVO_HOSTED_AGENT_ENCRYPTION_KEY = HOSTED_KEY;
  });

  it('encrypts and decrypts a hosted agent seed without exposing plaintext', async () => {
    const {
      decryptHostedAgentSeed,
      encryptHostedAgentSeed,
    } = await import('./user-agent');
    const seed = Uint8Array.from(Array.from({ length: 32 }, (_, i) => 255 - i));

    const encrypted = encryptHostedAgentSeed(seed);
    const serialized = Buffer.from(encrypted).toString('utf8');

    expect(Buffer.from(encrypted).equals(Buffer.from(seed))).toBe(false);
    expect(serialized).not.toContain(Buffer.from(seed).toString('base64'));
    expect(serialized).not.toContain(Buffer.from(seed).toString('hex'));
    expect(decryptHostedAgentSeed(encrypted)).toEqual(seed);
  });

  it('returns the existing active hosted default agent without creating another key', async () => {
    const existing = {
      id: 'agent-existing',
      xUserId: '12345',
      agentAddress: '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b',
      label: 'Levo hosted agent',
      status: 'ACTIVE',
      isDefault: true,
      custodyMode: 'HOSTED',
    };
    prismaMock.userAgent.findFirst.mockResolvedValue(existing);

    const { getOrCreateHostedUserAgent } = await import('./user-agent');
    const result = await getOrCreateHostedUserAgent('12345');

    expect(result).toBe(existing);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('provisions a default hosted agent with encrypted seed metadata when none exists', async () => {
    const tx = {
      userAgent: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn(async ({ data }) => ({
          id: 'agent-new',
          ...data,
          createdAt: new Date('2026-06-16T00:00:00.000Z'),
          updatedAt: new Date('2026-06-16T00:00:00.000Z'),
        })),
      },
    };
    prismaMock.userAgent.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation((fn) => fn(tx));

    const { decryptHostedAgentSeed, getOrCreateHostedUserAgent } = await import('./user-agent');
    const result = await getOrCreateHostedUserAgent('12345');

    expect(tx.userAgent.updateMany).toHaveBeenCalledWith({
      where: { xUserId: '12345', isDefault: true },
      data: { isDefault: false },
    });
    expect(tx.userAgent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        xUserId: '12345',
        label: 'Levo hosted agent',
        status: 'ACTIVE',
        isDefault: true,
        custodyMode: 'HOSTED',
        runnerTokenHash: null,
        runnerTokenRotatedAt: null,
        hostedKeyVersion: 'v1',
        hostedProvisionedAt: expect.any(Date),
        hostedEncryptedSeed: expect.any(Uint8Array),
      }),
    });
    expect(result.agentAddress).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.hostedEncryptedSeed).not.toBeNull();
    if (!result.hostedEncryptedSeed) throw new Error('hostedEncryptedSeed missing');
    expect(decryptHostedAgentSeed(result.hostedEncryptedSeed)).toHaveLength(32);
  });
});

describe('owner-authorized user agent binding intent', () => {
  it('accepts the matching owner wallet binding payload and rejects mismatches', async () => {
    process.env.HMAC_SECRET = 'x'.repeat(64);
    const {
      issueOwnerAgentBindingIntent,
      verifyOwnerAgentBindingIntent,
    } = await import('./user-agent');
    const ownerAddress = '0x0000000000000000000000000000000000000000000000000000000000000123';
    const agentAddress = '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b';
    const binding = issueOwnerAgentBindingIntent({
      ownerXUserId: '12345',
      ownerAddress,
      agentAddress,
      label: 'Home runner',
    });

    expect(
      verifyOwnerAgentBindingIntent(binding.bindingIntent, {
        ownerXUserId: '12345',
        ownerAddress,
        agentAddress,
        label: 'Home runner',
        payloadBase64: binding.payloadBase64,
      }),
    ).toEqual({ ok: true });

    expect(
      verifyOwnerAgentBindingIntent(binding.bindingIntent, {
        ownerXUserId: '12345',
        ownerAddress,
        agentAddress: '0x000000000000000000000000000000000000000000000000000000000000dead',
        label: 'Home runner',
        payloadBase64: binding.payloadBase64,
      }),
    ).toEqual({ ok: false, reason: 'agent binding intent mismatch' });
  });
});
