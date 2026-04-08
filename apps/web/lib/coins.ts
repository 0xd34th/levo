import { fromBase58, normalizeSuiAddress } from '@mysten/sui/utils';

const TEST_USDC_SUFFIX = '::test_usdc::TEST_USDC';
const LEVO_USD_SUFFIX = '::levo_usd::LEVO_USD';
const SUI_DECIMALS = 9;
const TEST_USDC_DECIMALS = 6;
const USDC_DECIMALS = 6;

export const SUI_COIN_TYPE = '0x2::sui::SUI';
export const MAINNET_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

type SuiNetwork = 'testnet' | 'mainnet' | 'devnet';

/**
 * Normalize the address portion of a coin type to the full 64-char hex format.
 * Sui RPCs may return shortened addresses (e.g. `0x62241b...`) that differ from
 * the full form stored in env vars (`0x062241b...`). This ensures comparisons
 * are stable regardless of leading-zero formatting.
 */
function normalizeCoinType(coinType: string): string {
  const idx = coinType.indexOf('::');
  if (idx === -1) return coinType;
  try {
    return normalizeSuiAddress(coinType.slice(0, idx)) + coinType.slice(idx);
  } catch {
    return coinType;
  }
}

function getConfiguredNetwork(
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
): SuiNetwork {
  return network === 'mainnet' || network === 'devnet' || network === 'testnet'
    ? network
    : 'testnet';
}

export function getTestUsdcCoinType(
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): string | null {
  const normalizedPackageId = packageId?.trim();
  return normalizedPackageId ? `${normalizedPackageId}${TEST_USDC_SUFFIX}` : null;
}

export function getConfiguredLevoUsdCoinType(
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  explicitCoinType = process.env.LEVO_USD_COIN_TYPE,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
): string | null {
  const normalizedExplicitCoinType = explicitCoinType?.trim();
  if (normalizedExplicitCoinType) {
    return normalizedExplicitCoinType;
  }

  // On mainnet the active LEVO_USD lives in the standalone
  // packages/levo-usd publish, not in the contracts package.
  // Never derive the mainnet coin type from NEXT_PUBLIC_PACKAGE_ID.
  if (getConfiguredNetwork(network) === 'mainnet') {
    return null;
  }

  const normalizedPackageId = packageId?.trim();
  return normalizedPackageId ? `${normalizedPackageId}${LEVO_USD_SUFFIX}` : null;
}

export function getUserFacingUsdcCoinType(
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): string | null {
  return getConfiguredNetwork(network) === 'mainnet'
    ? MAINNET_USDC_TYPE
    : getTestUsdcCoinType(packageId);
}

export function isStableLayerEnabled(
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
): boolean {
  return (
    getConfiguredNetwork(network) === 'mainnet' &&
    getConfiguredLevoUsdCoinType(packageId, levoUsdCoinType, network) !== null
  );
}

export function getSettlementCoinType(
  coinType: string,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
): string {
  if (
    getConfiguredNetwork(network) === 'mainnet' &&
    coinType === MAINNET_USDC_TYPE
  ) {
    return getConfiguredLevoUsdCoinType(packageId, levoUsdCoinType, network) ?? coinType;
  }

  return coinType;
}

export function normalizeCoinTypeForDisplay(
  coinType: string,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
): string {
  const configuredLevoUsd = getConfiguredLevoUsdCoinType(packageId, levoUsdCoinType, network);
  if (
    getConfiguredNetwork(network) === 'mainnet' &&
    configuredLevoUsd &&
    normalizeCoinType(coinType) === normalizeCoinType(configuredLevoUsd)
  ) {
    return MAINNET_USDC_TYPE;
  }

  return coinType;
}

export function requiresPackageIdForCoinType(coinType: string): boolean {
  return coinType.endsWith(TEST_USDC_SUFFIX);
}

export function isSupportedCoinType(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
): boolean {
  const normalized = normalizeCoinType(coinType);
  const userFacingUsdcCoinType = getUserFacingUsdcCoinType(network, packageId);
  return normalized === normalizeCoinType(SUI_COIN_TYPE) ||
    (userFacingUsdcCoinType !== null && normalized === normalizeCoinType(userFacingUsdcCoinType));
}

function isConfiguredTestUsdcCoinType(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
): boolean {
  const testUsdc = getTestUsdcCoinType(packageId);
  return testUsdc !== null && normalizeCoinType(coinType) === normalizeCoinType(testUsdc);
}

export function getCoinLabel(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
): string {
  const displayCoinType = normalizeCoinTypeForDisplay(
    coinType,
    network,
    packageId,
    levoUsdCoinType,
  );

  if (displayCoinType === MAINNET_USDC_TYPE) {
    return 'USDC';
  }

  if (normalizeCoinType(coinType) === normalizeCoinType(SUI_COIN_TYPE)) {
    return 'SUI';
  }

  if (isConfiguredTestUsdcCoinType(displayCoinType, packageId)) {
    return 'TEST_USDC';
  }

  throw new Error(`Unsupported coin type: ${coinType}`);
}

export function isDisplaySupportedCoinType(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
): boolean {
  const displayCoinType = normalizeCoinTypeForDisplay(
    coinType,
    network,
    packageId,
    levoUsdCoinType,
  );
  return (
    normalizeCoinType(displayCoinType) === normalizeCoinType(SUI_COIN_TYPE) ||
    displayCoinType === MAINNET_USDC_TYPE ||
    isConfiguredTestUsdcCoinType(displayCoinType, packageId)
  );
}

export function getCoinDecimals(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
): number {
  const displayCoinType = normalizeCoinTypeForDisplay(
    coinType,
    network,
    packageId,
    levoUsdCoinType,
  );

  if (normalizeCoinType(displayCoinType) === normalizeCoinType(SUI_COIN_TYPE)) {
    return SUI_DECIMALS;
  }

  if (displayCoinType === MAINNET_USDC_TYPE) {
    return USDC_DECIMALS;
  }

  if (isConfiguredTestUsdcCoinType(displayCoinType, packageId)) {
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
