import { describe, expect, it } from 'vitest';
import {
  detectRecipientType,
  isSuiAddressCandidateInput,
  isValidSuiAddressInput,
} from '@/lib/recipient';

describe('recipient helpers', () => {
  it('treats hex-only 0x inputs as Sui address candidates', () => {
    expect(isSuiAddressCandidateInput('0x')).toBe(true);
    expect(isSuiAddressCandidateInput('0xABCD')).toBe(true);
    expect(detectRecipientType('0xABCD')).toBe('SUI_ADDRESS');
    expect(isValidSuiAddressInput('0xABCD')).toBe(true);
  });

  it('keeps non-hex 0x handles on the X handle path', () => {
    expect(isSuiAddressCandidateInput('0xMert')).toBe(false);
    expect(detectRecipientType('0xMert')).toBe('X_HANDLE');
    expect(detectRecipientType('0xFoobar')).toBe('X_HANDLE');
    expect(isValidSuiAddressInput('0xMert')).toBe(false);
  });

  it('treats @-prefixed hex handles as X handles, not addresses', () => {
    expect(detectRecipientType('@0xABCD')).toBe('X_HANDLE');
    expect(detectRecipientType('@0xBEEF')).toBe('X_HANDLE');
    expect(detectRecipientType('@0x')).toBe('X_HANDLE');
  });
});
