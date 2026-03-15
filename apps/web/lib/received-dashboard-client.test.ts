import { describe, expect, it } from 'vitest';
import { truncateAddress } from './received-dashboard-client';

describe('truncateAddress', () => {
  it('returns an empty string for missing addresses', () => {
    expect(truncateAddress(null)).toBe('');
    expect(truncateAddress(undefined)).toBe('');
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('0x123456789abc')).toBe('0x123456789abc');
  });

  it('truncates long addresses to the expected prefix and suffix', () => {
    expect(truncateAddress('0x1234567890abcdef1234567890abcdef')).toBe('0x123456...abcdef');
  });
});
