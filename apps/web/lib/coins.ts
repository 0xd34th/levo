import { fromBase58 } from '@mysten/sui/utils';

const TEST_USDC_SUFFIX = '::test_usdc::TEST_USDC';
const SUI_DECIMALS = 9;
const TEST_USDC_DECIMALS = 6;

export const SUI_COIN_TYPE = '0x2::sui::SUI';

export function getTestUsdcCoinType(
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): string | null {
  const normalizedPackageId = packageId?.trim();
  return normalizedPackageId ? `${normalizedPackageId}${TEST_USDC_SUFFIX}` : null;
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

function isConfiguredTestUsdcCoinType(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): boolean {
  return coinType === getTestUsdcCoinType(packageId);
}

export function getCoinLabel(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): string {
  if (coinType === SUI_COIN_TYPE) {
    return 'SUI';
  }

  if (isConfiguredTestUsdcCoinType(coinType, packageId)) {
    return 'TEST_USDC';
  }

  throw new Error(`Unsupported coin type: ${coinType}`);
}

export function isDisplaySupportedCoinType(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): boolean {
  return coinType === SUI_COIN_TYPE || isConfiguredTestUsdcCoinType(coinType, packageId);
}

export function getCoinDecimals(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): number {
  if (coinType === SUI_COIN_TYPE) {
    return SUI_DECIMALS;
  }

  if (isConfiguredTestUsdcCoinType(coinType, packageId)) {
    return TEST_USDC_DECIMALS;
  }

  throw new Error(`Unsupported coin type: ${coinType}`);
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
  if (!isValidTransactionDigest(txDigest)) {
    return null;
  }

  const configuredBaseUrl = process.env.NEXT_PUBLIC_SUI_EXPLORER_BASE_URL?.replace(/\/$/, '');
  if (configuredBaseUrl) {
    return `${configuredBaseUrl}/tx/${txDigest}`;
  }

  if (network === 'mainnet' || network === 'testnet' || network === 'devnet') {
    return `https://suiscan.xyz/${network}/tx/${txDigest}`;
  }

  return null;
}

function isValidTransactionDigest(txDigest: string): boolean {
  try {
    return fromBase58(txDigest).length === 32;
  } catch {
    return false;
  }
}
