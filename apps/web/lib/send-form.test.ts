import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTestUsdcCoinType, SUI_COIN_TYPE } from '@/lib/coins';
import {
  MAX_X_HANDLE_LENGTH,
  normalizeRecipientInput,
  normalizeUsernameInput,
  sanitizeAmountForCoinType,
  usesDollarAmountPrefix,
} from '@/lib/send-form';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('send-form helpers', () => {
  it('normalizes pasted handles before enforcing the max X length', () => {
    expect(normalizeUsernameInput('@abcdefghijklmno')).toBe('abcdefghijklmno');
    expect(normalizeUsernameInput(' @abc def ')).toBe('abcdef');
    expect(normalizeUsernameInput('@abcdefghijklmnop')).toHaveLength(MAX_X_HANDLE_LENGTH);
  });

  it('keeps non-hex 0x handles on the username path', () => {
    expect(normalizeRecipientInput('@0xMert')).toBe('0xMert');
    expect(normalizeRecipientInput('0xFoobar')).toBe('0xFoobar');
    expect(normalizeRecipientInput('0xABCD')).toBe('0xabcd');
  });

  it('clears amounts that become invalid for the selected asset', () => {
    vi.stubEnv('NEXT_PUBLIC_PACKAGE_ID', '0x123');
    const testUsdcCoinType = getTestUsdcCoinType()!;

    expect(sanitizeAmountForCoinType('1.123456789', SUI_COIN_TYPE)).toBe('1.123456789');
    expect(sanitizeAmountForCoinType('1.123456789', testUsdcCoinType)).toBe('');
    expect(sanitizeAmountForCoinType('1.123456', testUsdcCoinType)).toBe('1.123456');
  });

  it('only uses a dollar prefix for dollar-denominated assets', () => {
    vi.stubEnv('NEXT_PUBLIC_PACKAGE_ID', '0x123');

    expect(usesDollarAmountPrefix(SUI_COIN_TYPE)).toBe(false);
    expect(usesDollarAmountPrefix(getTestUsdcCoinType()!)).toBe(true);
  });
});
