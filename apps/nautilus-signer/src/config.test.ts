import { describe, expect, it } from 'vitest';
import {
  REGISTERED_TESTNET_SIGNER_PUBLIC_KEY,
  loadConfig,
} from './config';

describe('loadConfig', () => {
  const env = {
    HOST: '127.0.0.1',
    PORT: '8787',
    ENCLAVE_REGISTRY_ID:
      '0x11cddaae036a2faabc315226ae031d10cd1c488f91dd436fd0aac2157b25715a',
    NAUTILUS_SIGNER_SECRET: '12345678901234567890123456789012',
    NAUTILUS_SIGNER_SEED_BASE64: 'G535YBKX0pkKt4fWrlYAijgdw/R840hgdxPLX5R0WSA=',
  } as const;

  it('defaults to the registered testnet public key and rejects a mismatched fixture seed', () => {
    expect(() => loadConfig(env)).toThrow(
      `Nautilus signer public key mismatch: expected ${REGISTERED_TESTNET_SIGNER_PUBLIC_KEY}`,
    );
  });

  it('accepts a fixture override for unit tests without changing the runtime default', () => {
    const config = loadConfig({
      ...env,
      NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY:
        '0xf98637627e7555b3f40603113378f965788f7f26dca1e5e8505f17e4eacf9c32',
    });

    expect(config.publicKeyHex).toBe(
      '0xf98637627e7555b3f40603113378f965788f7f26dca1e5e8505f17e4eacf9c32',
    );
    expect(config.expectedPublicKeyHex).toBe(
      '0xf98637627e7555b3f40603113378f965788f7f26dca1e5e8505f17e4eacf9c32',
    );
  });

  it('fails startup when an override does not match the derived key', () => {
    expect(() =>
      loadConfig({
        ...env,
        NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY:
          '0x77ea384188b9f8a8f2886fa676d64ca11e2730a6af4e2c181f187b2dc815a705',
      }),
    ).toThrow('Nautilus signer public key mismatch');
  });

  it('rejects signer secrets shorter than 32 characters', () => {
    expect(() =>
      loadConfig({
        ...env,
        NAUTILUS_SIGNER_EXPECTED_PUBLIC_KEY:
          '0xf98637627e7555b3f40603113378f965788f7f26dca1e5e8505f17e4eacf9c32',
        NAUTILUS_SIGNER_SECRET: 'short-secret',
      }),
    ).toThrow();
  });
});
