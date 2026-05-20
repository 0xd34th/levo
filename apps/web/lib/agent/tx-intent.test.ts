import { describe, expect, it } from 'vitest';
import {
  issueOwnerTxIntent,
  verifyOwnerTxIntent,
  type OwnerTxIntentBinding,
} from './tx-intent';

const SECRET = 'x'.repeat(64);
const NOW = Date.UTC(2026, 4, 19, 0, 0, 0);

const BINDING: OwnerTxIntentBinding = {
  operation: 'create',
  ownerXUserId: '12345',
  ownerAddress: '0x0000000000000000000000000000000000000000000000000000000000000abc',
  txBytesBase64: 'AQIDBA==',
  requestHash: 'request-hash',
};

describe('owner tx intent binding', () => {
  it('accepts an untampered owner transaction intent', () => {
    const token = issueOwnerTxIntent(BINDING, SECRET, NOW);

    expect(verifyOwnerTxIntent(token, BINDING, SECRET, NOW + 1_000)).toEqual({
      ok: true,
    });
  });

  it('rejects client-round-tripped transaction bytes that do not match the issued intent', () => {
    const token = issueOwnerTxIntent(BINDING, SECRET, NOW);

    expect(
      verifyOwnerTxIntent(
        token,
        {
          ...BINDING,
          txBytesBase64: 'tampered-bytes',
        },
        SECRET,
        NOW + 1_000,
      ),
    ).toEqual({
      ok: false,
      reason: 'owner tx intent mismatch',
    });
  });
});
