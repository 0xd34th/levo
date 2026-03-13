import { describe, it, expect, beforeAll } from 'vitest';
import { signQuoteToken, verifyQuoteToken, type QuotePayload } from './hmac';

const TEST_SECRET = 'a'.repeat(64); // 32-byte hex secret

const validPayload: QuotePayload = {
  xUserId: '12345',
  derivationVersion: 1,
  vaultAddress: '0xabc',
  coinType: '0x2::sui::SUI',
  amount: '1000000',
  senderAddress: '0xdef',
  nonce: 'test-nonce-123',
  expiresAt: Math.floor(Date.now() / 1000) + 300, // 5 min from now
};

describe('signQuoteToken', () => {
  it('returns a non-empty string', () => {
    const token = signQuoteToken(validPayload, TEST_SECRET);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('is deterministic', () => {
    const a = signQuoteToken(validPayload, TEST_SECRET);
    const b = signQuoteToken(validPayload, TEST_SECRET);
    expect(a).toBe(b);
  });
});

describe('verifyQuoteToken', () => {
  it('returns the payload for a valid token', () => {
    const token = signQuoteToken(validPayload, TEST_SECRET);
    const result = verifyQuoteToken(token, TEST_SECRET);
    expect(result).not.toBeNull();
    expect(result!.xUserId).toBe('12345');
    expect(result!.amount).toBe('1000000');
  });

  it('returns null for a tampered token', () => {
    const token = signQuoteToken(validPayload, TEST_SECRET);
    const tampered = token.slice(0, -4) + 'xxxx';
    const result = verifyQuoteToken(tampered, TEST_SECRET);
    expect(result).toBeNull();
  });

  it('returns null for a wrong secret', () => {
    const token = signQuoteToken(validPayload, TEST_SECRET);
    const result = verifyQuoteToken(token, 'b'.repeat(64));
    expect(result).toBeNull();
  });

  it('returns null for an expired token', () => {
    const expiredPayload = { ...validPayload, expiresAt: Math.floor(Date.now() / 1000) - 10 };
    const token = signQuoteToken(expiredPayload, TEST_SECRET);
    const result = verifyQuoteToken(token, TEST_SECRET);
    expect(result).toBeNull();
  });
});
