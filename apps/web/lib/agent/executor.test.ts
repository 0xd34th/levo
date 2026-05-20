import { describe, expect, it } from 'vitest';
import { getMandateExecutionBlockReason } from './execution-guard';

const baseMandate = {
  status: 'ACTIVE' as const,
  expiryMs: 2_000n,
  witnessCommit: '0xabc',
  revokedAt: null,
  revokedTxDigest: null,
  destroyedAt: null,
  destroyedTxDigest: null,
};

describe('getMandateExecutionBlockReason', () => {
  it('allows initialized active mandates before expiry', () => {
    expect(getMandateExecutionBlockReason(baseMandate, 1_000)).toBeNull();
  });

  it('fails closed for paused, revoked, destroyed, expired, and uninitialized mandates', () => {
    expect(
      getMandateExecutionBlockReason(
        { ...baseMandate, status: 'PAUSED_BY_USER' as const },
        1_000,
      ),
    ).toContain('not active');
    expect(
      getMandateExecutionBlockReason(
        { ...baseMandate, revokedTxDigest: 'abc' },
        1_000,
      ),
    ).toContain('revoked');
    expect(
      getMandateExecutionBlockReason(
        { ...baseMandate, destroyedAt: new Date() },
        1_000,
      ),
    ).toContain('destroyed');
    expect(getMandateExecutionBlockReason(baseMandate, 2_000)).toContain('expired');
    expect(
      getMandateExecutionBlockReason(
        { ...baseMandate, witnessCommit: null },
        1_000,
      ),
    ).toContain('not initialized');
  });
});
