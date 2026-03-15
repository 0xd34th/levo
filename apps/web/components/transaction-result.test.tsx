import { describe, expect, it, vi } from 'vitest';
import { TransactionResult } from './transaction-result';

describe('TransactionResult', () => {
  it('does not throw for unsupported coin types', () => {
    expect(() =>
      TransactionResult({
        data: {
          amount: '1',
          coinType: '0xabc::other::OTHER',
          username: 'death_xyz',
          txDigest: '11111111111111111111111111111111',
        },
        network: 'testnet',
        onReset: vi.fn(),
      }),
    ).not.toThrow();
  });
});
