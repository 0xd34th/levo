import { describe, expect, it } from 'vitest';
import {
  decodeTransactionHistoryCursor,
  encodeTransactionHistoryCursor,
} from './transaction-history-cursor';

describe('transaction history cursors', () => {
  it('round-trips a cursor payload', () => {
    const encoded = encodeTransactionHistoryCursor({
      createdAt: '2026-03-15T00:00:00.000Z',
      id: 'cm8z4x5a00000123abcd4567',
    });

    expect(decodeTransactionHistoryCursor(encoded)).toEqual({
      createdAt: '2026-03-15T00:00:00.000Z',
      id: 'cm8z4x5a00000123abcd4567',
    });
  });

  it('rejects malformed cursor payloads', () => {
    expect(decodeTransactionHistoryCursor('not-base64')).toBeNull();

    const encoded = Buffer.from(
      JSON.stringify({ createdAt: 'nope', id: '' }),
    ).toString('base64url');
    expect(decodeTransactionHistoryCursor(encoded)).toBeNull();
  });
});
