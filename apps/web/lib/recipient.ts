export type RecipientType = 'X_HANDLE' | 'SUI_ADDRESS';

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{1,64}$/;
const SUI_ADDRESS_CANDIDATE_RE = /^0x[a-fA-F0-9]*$/;

export function isSuiAddressCandidateInput(input: string): boolean {
  return SUI_ADDRESS_CANDIDATE_RE.test(input);
}

/**
 * Auto-detect recipient type from user input.
 * Returns null for empty input.
 */
export function detectRecipientType(input: string): RecipientType | null {
  if (!input) return null;
  if (isSuiAddressCandidateInput(input)) return 'SUI_ADDRESS';
  return 'X_HANDLE';
}

/**
 * Light client-side check for Sui address format.
 * Full validation (normalization + checksum) happens server-side via parseSuiAddress.
 */
export function isValidSuiAddressInput(input: string): boolean {
  return SUI_ADDRESS_RE.test(input);
}
