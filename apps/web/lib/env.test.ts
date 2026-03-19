import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasValidHmacSecret } from './env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('hasValidHmacSecret', () => {
  it('accepts trimmed secrets with at least 32 characters', () => {
    expect(hasValidHmacSecret(`  ${'a'.repeat(32)}  `)).toBe(true);
  });

  it('rejects missing or short secrets', () => {
    expect(hasValidHmacSecret(undefined)).toBe(false);
    expect(hasValidHmacSecret('')).toBe(false);
    expect(hasValidHmacSecret('a'.repeat(31))).toBe(false);
  });
});
