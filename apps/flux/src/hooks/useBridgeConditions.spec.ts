import { describe, expect, it } from 'vitest';
import { isStaleAutoToAddress } from './useBridgeConditions';

describe('isStaleAutoToAddress', () => {
  it('detects a stale automatically written destination address', () => {
    expect(
      isStaleAutoToAddress({
        lastAutoToAddress: '0xsui-auto',
        toAddress: '0xsui-auto',
      }),
    ).toBe(true);
  });

  it('does not treat a user-entered destination address as stale', () => {
    expect(
      isStaleAutoToAddress({
        lastAutoToAddress: '0xsui-auto',
        toAddress: 'solana-user-address',
      }),
    ).toBe(false);
  });
});
