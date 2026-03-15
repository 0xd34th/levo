import { SUI_COIN_TYPE, isValidAmountInput } from '@/lib/coins';

export const MAX_X_HANDLE_LENGTH = 15;

export function normalizeUsernameInput(value: string): string {
  return value.replace(/\s+/g, '').replace(/^@+/, '').slice(0, MAX_X_HANDLE_LENGTH);
}

export function sanitizeAmountForCoinType(amount: string, coinType: string): string {
  return amount === '' || isValidAmountInput(amount, coinType) ? amount : '';
}

export function usesDollarAmountPrefix(coinType: string): boolean {
  return coinType !== SUI_COIN_TYPE;
}
