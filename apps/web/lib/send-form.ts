import { SUI_COIN_TYPE, isValidAmountInput } from '@/lib/coins';
import { isSuiAddressCandidateInput } from '@/lib/recipient';

export const MAX_X_HANDLE_LENGTH = 15;
export const MAX_SUI_ADDRESS_LENGTH = 66; // 0x + 64 hex chars

export function normalizeUsernameInput(value: string): string {
  return value.replace(/\s+/g, '').replace(/^@+/, '').slice(0, MAX_X_HANDLE_LENGTH);
}

export function normalizeRecipientInput(value: string): string {
  const compactValue = value.replace(/\s+/g, '');
  if (isSuiAddressCandidateInput(compactValue.toLowerCase())) {
    return value.replace(/\s+/g, '').toLowerCase().slice(0, MAX_SUI_ADDRESS_LENGTH);
  }
  // Explicit @ prefix on a hex-only handle (e.g. pasting "@0xABCD" from X) —
  // preserve the @ so detectRecipientType stays on the X_HANDLE path.
  if (compactValue.startsWith('@')) {
    const stripped = compactValue.replace(/^@+/, '');
    if (stripped && isSuiAddressCandidateInput(stripped.toLowerCase())) {
      return '@' + stripped.slice(0, MAX_X_HANDLE_LENGTH);
    }
  }
  return normalizeUsernameInput(value);
}

export function sanitizeAmountForCoinType(amount: string, coinType: string): string {
  return amount === '' || isValidAmountInput(amount, coinType) ? amount : '';
}

export function usesDollarAmountPrefix(coinType: string): boolean {
  return coinType !== SUI_COIN_TYPE;
}
