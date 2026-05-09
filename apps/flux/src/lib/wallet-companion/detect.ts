import type { CompanionProviderName } from './types';

/**
 * Maps a Sui dApp-Kit `UiWallet.name` to a known multi-chain provider, or
 * `null` when we don't recognize it. Used as the explicit-consent anchor:
 * the user must have actively connected this provider via dApp-Kit before
 * we will probe its other namespaces.
 */
export const detectCompanionProvider = (
  uiWalletName?: string | null,
): CompanionProviderName | null => {
  if (!uiWalletName) {
    return null;
  }
  const lower = uiWalletName.toLowerCase();
  if (lower.includes('phantom')) {
    return 'phantom';
  }
  if (lower.includes('okx')) {
    return 'okx';
  }
  if (lower.includes('backpack')) {
    return 'backpack';
  }
  return null;
};
