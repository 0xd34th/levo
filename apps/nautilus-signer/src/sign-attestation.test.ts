import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';
import {
  DEFAULT_ATTESTATION_TTL_MS,
  buildAttestationBytes,
  signAttestation,
} from './sign-attestation';

describe('sign-attestation', () => {
  const env = {
    HOST: '127.0.0.1',
    PORT: '8787',
    ENCLAVE_REGISTRY_ID:
      '0x11cddaae036a2faabc315226ae031d10cd1c488f91dd436fd0aac2157b25715a',
    NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY:
      '0xf98637627e7555b3f40603113378f965788f7f26dca1e5e8505f17e4eacf9c32',
    NAUTILUS_SIGNER_SECRET: '12345678901234567890123456789012',
    NAUTILUS_SIGNER_SEED_BASE64: 'G535YBKX0pkKt4fWrlYAijgdw/R840hgdxPLX5R0WSA=',
  } as const;

  it('signs a fixed attestation deterministically and exposes the derived public key', () => {
    const config = loadConfig(env);

    expect(config.publicKeyHex).toBe(
      '0xf98637627e7555b3f40603113378f965788f7f26dca1e5e8505f17e4eacf9c32',
    );

    const message = buildAttestationBytes({
      xUserId: 12345n,
      suiAddress: '0x2',
      nonce: 1n,
      expiresAt: 1773810000000n,
      registryId: config.registryId,
    });

    // 5 fields: xUserId(8) + suiAddress(32) + nonce(8) + expiresAt(8) + registryId(32) = 88 bytes
    expect(Buffer.from(message).toString('hex')).toBe(
      '39300000000000000000000000000000000000000000000000000000000000000000000000000002010000000000000080a050ff9c01000011cddaae036a2faabc315226ae031d10cd1c488f91dd436fd0aac2157b25715a',
    );

    const first = signAttestation(config, {
      xUserId: '12345',
      suiAddress: '0x2',
      nonce: 1n,
      expiresAt: 1773810000000n,
    });
    const second = signAttestation(config, {
      xUserId: '12345',
      suiAddress: '0x2',
      nonce: 1n,
      expiresAt: 1773810000000n,
    });

    expect(first).toEqual(second);
    expect(first).toEqual({
      signature:
        '0x5e9ce927b160617c744e7cbff30713c3e9223f2941d750f04a56d5b4268a771459b73025f9884069a21fa40a3a8dd2cb629d164e604c38d8e8733c528bb09a01',
      x_user_id: '12345',
      sui_address: '0x0000000000000000000000000000000000000000000000000000000000000002',
      nonce: '1',
      expires_at: '1773810000000',
    });
  });

  it('rejects an invalid x_user_id', () => {
    const config = loadConfig(env);

    expect(() =>
      signAttestation(config, {
        xUserId: '12abc',
        suiAddress: '0x2',
        nonce: 1n,
        expiresAt: 1773810000000n,
      }),
    ).toThrow('Invalid x_user_id');
  });

  it('rejects an invalid sui_address', () => {
    const config = loadConfig(env);

    expect(() =>
      signAttestation(config, {
        xUserId: '12345',
        suiAddress: '0xnot-an-address',
        nonce: 1n,
        expiresAt: 1773810000000n,
      }),
    ).toThrow('Invalid sui_address');
  });

  it('generates expires_at in milliseconds and keeps it sufficiently in the future', () => {
    const config = loadConfig(env);

    const nowMs = Date.parse('2026-03-18T00:00:00.000Z');
    const result = signAttestation(
      config,
      {
        xUserId: '12345',
        suiAddress: '0x2',
      },
      { nowMs },
    );

    expect(result.expires_at).toBe(String(nowMs + DEFAULT_ATTESTATION_TTL_MS));
    expect(Number(result.expires_at)).toBeGreaterThan(nowMs + 30_000);
    expect(Number(result.expires_at)).toBeGreaterThan(1_000_000_000_000);
  });

  it('rejects x_user_id values outside u64 range', () => {
    const config = loadConfig(env);

    expect(() =>
      signAttestation(config, {
        xUserId: '18446744073709551616',
        suiAddress: '0x2',
        nonce: 1n,
        expiresAt: 1773810000000n,
      }),
    ).toThrow('Invalid x_user_id');
  });
});
