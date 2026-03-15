import { describe, expect, it } from 'vitest';
import { getTestUsdcCoinType, SUI_COIN_TYPE } from '@/lib/coins';
import {
  MAX_X_HANDLE_LENGTH,
  normalizeUsernameInput,
  sanitizeAmountForCoinType,
  usesDollarAmountPrefix,
} from '@/lib/send-form';

describe('send-form helpers', () => {
  it('normalizes pasted handles before enforcing the max X length', () => {
    expect(normalizeUsernameInput('@abcdefghijklmno')).toBe('abcdefghijklmno');
    expect(normalizeUsernameInput(' @abc def ')).toBe('abcdef');
    expect(normalizeUsernameInput('@abcdefghijklmnop')).toHaveLength(MAX_X_HANDLE_LENGTH);
  });

  it('clears amounts that become invalid for the selected asset', () => {
    const testUsdcCoinType = getTestUsdcCoinType('0x123')!;

    expect(sanitizeAmountForCoinType('1.123456789', SUI_COIN_TYPE)).toBe('1.123456789');
    expect(sanitizeAmountForCoinType('1.123456789', testUsdcCoinType)).toBe('');
    expect(sanitizeAmountForCoinType('1.123456', testUsdcCoinType)).toBe('1.123456');
  });

  it('only uses a dollar prefix for dollar-denominated assets', () => {
    expect(usesDollarAmountPrefix(SUI_COIN_TYPE)).toBe(false);
    expect(usesDollarAmountPrefix(getTestUsdcCoinType('0x123')!)).toBe(true);
  });
});
