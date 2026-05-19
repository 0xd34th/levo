import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMandate, type OwnerWallet } from './mandate-flow';
import { issueOwnerTxIntent, type OwnerTxIntentBinding } from './tx-intent';

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

const OWNER: OwnerWallet = {
  xUserId: '12345',
  privyWalletId: 'wallet-id',
  suiAddress: '0x0000000000000000000000000000000000000000000000000000000000000abc',
  suiPublicKey: 'public-key',
};

const SPEC = {
  agent: '0x0000000000000000000000000000000000000000000000000000000000000def',
  actions: 8,
  coinLimits: [
    {
      coinType: '0x2::sui::SUI',
      perTxCap: 1_000_000_000n,
      periodCap: 10_000_000_000n,
    },
  ],
  periodMs: 86_400_000n,
  allowedTargets: ['0x000000000000000000000000000000000000000000000000000000000000be11'],
  expiryMs: 1_800_000_000_000n,
};

const PLAN = [
  {
    actionType: 8,
    coinType: '0x2::sui::SUI',
    target: '0x000000000000000000000000000000000000000000000000000000000000be11',
    amount: 1_000_000_000n,
  },
];

describe('mandate lifecycle transaction binding', () => {
  beforeEach(() => {
    process.env.HMAC_SECRET = 'x'.repeat(64);
  });

  it('rejects create finalization when tx bytes do not match the issued owner intent', async () => {
    const binding: OwnerTxIntentBinding = {
      operation: 'create',
      ownerXUserId: OWNER.xUserId,
      ownerAddress: OWNER.suiAddress,
      txBytesBase64: 'original-bytes',
      requestHash: 'request-hash',
    };

    await expect(
      createMandate({
        owner: OWNER,
        spec: SPEC,
        plan: PLAN,
        authorizationSignature: 'client-authorization-signature',
        txBytesBase64: 'tampered-bytes',
        txIntent: issueOwnerTxIntent(binding, process.env.HMAC_SECRET!, Date.now()),
      }),
    ).rejects.toThrow(/transaction authorization does not match/i);
  });
});
