import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  deriveActionCommit,
  deriveApprovalIdentity,
  generateWitness,
  hexToBytes,
} from './witness';

function makeBytes(byte: number, len = 32): Uint8Array {
  const out = new Uint8Array(len);
  out.fill(byte);
  return out;
}

const sampleContext = {
  mandateId: '0x' + 'aa'.repeat(32),
  coinType: '0x17546269c14c25aa9223a063f11abb2167284a0ffa2dc5c6b9ea740dfe613e1c::test_usdc::TEST_USDC',
  actionType: 2,
  target: '0x' + 'be'.repeat(32),
  amount: 100n,
};

describe('generateWitness', () => {
  it('returns 32 random bytes', () => {
    const w1 = generateWitness();
    const w2 = generateWitness();
    expect(w1).toHaveLength(32);
    expect(w2).toHaveLength(32);
    expect(w1).not.toEqual(w2);
  });
});

describe('deriveActionCommit', () => {
  const witness = makeBytes(0x42);
  const nextCommit = makeBytes(0x99);

  it('returns a 32-byte digest', () => {
    const out = deriveActionCommit({ ...sampleContext, witness, nextCommit });
    expect(out).toHaveLength(32);
  });

  it('is deterministic for identical inputs', () => {
    const a = deriveActionCommit({ ...sampleContext, witness, nextCommit });
    const b = deriveActionCommit({ ...sampleContext, witness, nextCommit });
    expect(bytesToHex(a)).toEqual(bytesToHex(b));
  });

  it('changes when witness changes', () => {
    const a = deriveActionCommit({ ...sampleContext, witness, nextCommit });
    const b = deriveActionCommit({ ...sampleContext, witness: makeBytes(0x43), nextCommit });
    expect(bytesToHex(a)).not.toEqual(bytesToHex(b));
  });

  it('changes when action type changes', () => {
    const a = deriveActionCommit({ ...sampleContext, witness, nextCommit });
    const b = deriveActionCommit({ ...sampleContext, actionType: 4, witness, nextCommit });
    expect(bytesToHex(a)).not.toEqual(bytesToHex(b));
  });

  it('changes when amount changes', () => {
    const a = deriveActionCommit({ ...sampleContext, witness, nextCommit });
    const b = deriveActionCommit({ ...sampleContext, amount: 101n, witness, nextCommit });
    expect(bytesToHex(a)).not.toEqual(bytesToHex(b));
  });

  it('changes when target changes', () => {
    const a = deriveActionCommit({ ...sampleContext, witness, nextCommit });
    const b = deriveActionCommit({
      ...sampleContext,
      target: '0x' + 'cc'.repeat(32),
      witness,
      nextCommit,
    });
    expect(bytesToHex(a)).not.toEqual(bytesToHex(b));
  });

  it('changes when next_commit changes', () => {
    const a = deriveActionCommit({ ...sampleContext, witness, nextCommit });
    const b = deriveActionCommit({
      ...sampleContext,
      witness,
      nextCommit: makeBytes(0xaa),
    });
    expect(bytesToHex(a)).not.toEqual(bytesToHex(b));
  });

  it('rejects wrong-length witness', () => {
    expect(() =>
      deriveActionCommit({
        ...sampleContext,
        witness: makeBytes(0x42, 31),
        nextCommit,
      }),
    ).toThrow(/32 bytes/);
  });
});

describe('deriveApprovalIdentity', () => {
  const currentCommit = makeBytes(0x11);
  const nextCommit = makeBytes(0x22);

  it('returns a 32-byte digest', () => {
    const out = deriveApprovalIdentity({ ...sampleContext, currentCommit, nextCommit });
    expect(out).toHaveLength(32);
  });

  it('is deterministic', () => {
    const a = deriveApprovalIdentity({ ...sampleContext, currentCommit, nextCommit });
    const b = deriveApprovalIdentity({ ...sampleContext, currentCommit, nextCommit });
    expect(bytesToHex(a)).toEqual(bytesToHex(b));
  });

  it('differs from action commit even with overlapping fields', () => {
    // ActionCommitMaterial has `witness` field; ApprovalIdentityMaterial has `current_commit`.
    // Different struct shapes → BCS encodings are disjoint → hash spaces never collide.
    const actionDigest = deriveActionCommit({
      ...sampleContext,
      witness: currentCommit,
      nextCommit,
    });
    const identityDigest = deriveApprovalIdentity({ ...sampleContext, currentCommit, nextCommit });
    expect(bytesToHex(actionDigest)).not.toEqual(bytesToHex(identityDigest));
  });

  it('changes when current_commit changes', () => {
    const a = deriveApprovalIdentity({ ...sampleContext, currentCommit, nextCommit });
    const b = deriveApprovalIdentity({
      ...sampleContext,
      currentCommit: makeBytes(0x55),
      nextCommit,
    });
    expect(bytesToHex(a)).not.toEqual(bytesToHex(b));
  });
});

describe('hex helpers', () => {
  it('roundtrips via bytesToHex / hexToBytes', () => {
    const original = makeBytes(0x7f);
    const hex = bytesToHex(original);
    expect(hex).toMatch(/^0x[0-9a-f]{64}$/);
    const back = hexToBytes(hex);
    expect(back).toEqual(original);
  });

  it('accepts bare hex (no 0x prefix)', () => {
    expect(hexToBytes('deadbeef')).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('rejects odd-length hex', () => {
    expect(() => hexToBytes('0xabc')).toThrow(/odd length/);
  });

  it('rejects invalid hex bytes', () => {
    expect(() => hexToBytes('0xzz')).toThrow(/invalid byte/);
  });
});
