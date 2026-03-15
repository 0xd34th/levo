const TEST_USDC_SUFFIX = '::test_usdc::TEST_USDC';

export const SUI_COIN_TYPE = '0x2::sui::SUI';

export function getTestUsdcCoinType(
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): string | null {
  return packageId ? `${packageId}${TEST_USDC_SUFFIX}` : null;
}

export function requiresPackageIdForCoinType(coinType: string): boolean {
  return coinType.endsWith(TEST_USDC_SUFFIX);
}

export function isSupportedCoinType(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): boolean {
  const testUsdcCoinType = getTestUsdcCoinType(packageId);
  return coinType === SUI_COIN_TYPE || coinType === testUsdcCoinType;
}

export function getCoinLabel(coinType: string): string {
  if (coinType === SUI_COIN_TYPE) {
    return 'SUI';
  }

  const parts = coinType.split('::');
  return parts.length >= 3 ? parts[parts.length - 1]! : 'TOKEN';
}

export function getCoinDecimals(coinType: string): number {
  return coinType === SUI_COIN_TYPE ? 9 : 6;
}

export function isValidAmountInput(value: string, coinType: string): boolean {
  const decimals = getCoinDecimals(coinType);
  return new RegExp(`^\\d*(?:\\.\\d{0,${decimals}})?$`).test(value);
}

export function formatAmount(baseUnits: string, coinType: string): string {
  const decimals = getCoinDecimals(coinType);
  const str = baseUnits.padStart(decimals + 1, '0');
  const whole = str.slice(0, -decimals);
  const frac = str.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

export function getExplorerTransactionUrl(
  network: string,
  txDigest: string,
): string | null {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_SUI_EXPLORER_BASE_URL?.replace(/\/$/, '');
  if (configuredBaseUrl) {
    return `${configuredBaseUrl}/tx/${txDigest}`;
  }

  if (network === 'mainnet' || network === 'testnet' || network === 'devnet') {
    return `https://suiscan.xyz/${network}/tx/${txDigest}`;
  }

  return null;
}
