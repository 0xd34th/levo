import { describe, it, expect } from 'vitest';
import { deriveVaultAddress, getSuiClient } from './sui';

describe('deriveVaultAddress', () => {
  const REGISTRY_ID = '0x0000000000000000000000000000000000000000000000000000000000000001';

  it('returns a valid Sui address (0x-prefixed, 66 chars)', () => {
    const addr = deriveVaultAddress(REGISTRY_ID, 12345n);
    expect(addr).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('is deterministic — same input always returns same address', () => {
    const a = deriveVaultAddress(REGISTRY_ID, 12345n);
    const b = deriveVaultAddress(REGISTRY_ID, 12345n);
    expect(a).toBe(b);
  });

  it('different x_user_ids produce different addresses', () => {
    const a = deriveVaultAddress(REGISTRY_ID, 111n);
    const b = deriveVaultAddress(REGISTRY_ID, 222n);
    expect(a).not.toBe(b);
  });

  it('different registries produce different addresses', () => {
    const other = '0x0000000000000000000000000000000000000000000000000000000000000002';
    const a = deriveVaultAddress(REGISTRY_ID, 12345n);
    const b = deriveVaultAddress(other, 12345n);
    expect(a).not.toBe(b);
  });
});

describe('getSuiClient', () => {
  it('returns a SuiClient instance', () => {
    const client = getSuiClient();
    expect(client).toBeDefined();
  });
});
