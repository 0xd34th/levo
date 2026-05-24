import { fromBase58, isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';

const TEST_USDC_SUFFIX = '::test_usdc::TEST_USDC';
const LEVO_USD_SUFFIX = '::levo_usd::LEVO_USD';
const SUI_DECIMALS = 9;
const TEST_USDC_DECIMALS = 6;
const USDC_DECIMALS = 6;
const USER_FACING_USDC_DECIMALS = 2;
const MAX_CONFIGURED_DECIMALS = 18;

export const SUI_COIN_TYPE = '0x2::sui::SUI';
export const MAINNET_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

type SuiNetwork = 'testnet' | 'mainnet' | 'devnet';

export interface SelectableCoinOption {
  coinType: string;
  label: string;
  decimals: number;
  inputDecimals: number;
  caption: string;
  iconSrc: string;
}

interface SelectableCoinOptionsInput {
  network?: string;
  packageId?: string;
  configuredCoinsJson?: string;
}

/**
 * Normalize the address portion of a coin type to the full 64-char hex format.
 * Sui RPCs may return shortened addresses (e.g. `0x62241b...`) that differ from
 * the full form stored in env vars (`0x062241b...`). This ensures comparisons
 * are stable regardless of leading-zero formatting.
 */
export function normalizeCoinType(coinType: string): string {
  const idx = coinType.indexOf('::');
  if (idx === -1) return coinType;
  try {
    return normalizeSuiAddress(coinType.slice(0, idx)) + coinType.slice(idx);
  } catch {
    return coinType;
  }
}

function isCoinTypeShape(coinType: string): boolean {
  const parts = coinType.split('::');
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return false;
  }
  try {
    return isValidSuiAddress(normalizeSuiAddress(parts[0]));
  } catch {
    return false;
  }
}

function isValidDecimals(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_CONFIGURED_DECIMALS
  );
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

function getBuiltInUsdcOption(network?: string, packageId?: string): SelectableCoinOption {
  const userFacingUsdcCoinType = getUserFacingUsdcCoinType(network, packageId);
  const coinType = userFacingUsdcCoinType ?? MAINNET_USDC_TYPE;
  const label = coinType === MAINNET_USDC_TYPE ? 'USDC' : 'TEST_USDC';

  return {
    coinType,
    label,
    decimals: USDC_DECIMALS,
    inputDecimals: USER_FACING_USDC_DECIMALS,
    caption: 'Stablecoin',
    iconSrc: '/USDC.svg',
  };
}

function getBuiltInSuiOption(): SelectableCoinOption {
  return {
    coinType: SUI_COIN_TYPE,
    label: 'SUI',
    decimals: SUI_DECIMALS,
    inputDecimals: SUI_DECIMALS,
    caption: 'Native',
    iconSrc: '/sui.svg',
  };
}

function parseConfiguredCoinOptions(rawJson: string | undefined): SelectableCoinOption[] {
  const trimmed = rawJson?.trim();
  if (!trimmed) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    console.warn('Ignoring NEXT_PUBLIC_SEND_COIN_OPTIONS because it is not valid JSON', error);
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn('Ignoring NEXT_PUBLIC_SEND_COIN_OPTIONS because it is not a JSON array');
    return [];
  }

  const options: SelectableCoinOption[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) {
      console.warn('Ignoring malformed configured send coin', entry);
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    const rawCoinType = typeof candidate.coinType === 'string' ? candidate.coinType.trim() : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const decimals = candidate.decimals;
    const inputDecimals = candidate.inputDecimals ?? decimals;
    const caption =
      typeof candidate.caption === 'string' && candidate.caption.trim()
        ? candidate.caption.trim()
        : 'Token';
    const iconSrc =
      typeof candidate.iconSrc === 'string' && candidate.iconSrc.trim()
        ? candidate.iconSrc.trim()
        : '/sui.svg';

    if (
      !rawCoinType ||
      !isCoinTypeShape(rawCoinType) ||
      !label ||
      !isValidDecimals(decimals) ||
      !isValidDecimals(inputDecimals) ||
      inputDecimals > decimals
    ) {
      console.warn('Ignoring malformed configured send coin', entry);
      continue;
    }

    options.push({
      coinType: normalizeCoinType(rawCoinType),
      label,
      decimals,
      inputDecimals,
      caption,
      iconSrc,
    });
  }

  return options;
}

export function getSelectableCoinOptions({
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  configuredCoinsJson = process.env.NEXT_PUBLIC_SEND_COIN_OPTIONS,
}: SelectableCoinOptionsInput = {}): SelectableCoinOption[] {
  const options: SelectableCoinOption[] = [
    getBuiltInUsdcOption(network, packageId),
    getBuiltInSuiOption(),
  ];
  const seen = new Set(options.map((option) => normalizeCoinType(option.coinType)));

  for (const configuredOption of parseConfiguredCoinOptions(configuredCoinsJson)) {
    const normalized = normalizeCoinType(configuredOption.coinType);
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    options.push({ ...configuredOption, coinType: normalized });
  }

  return options;
}

function findSelectableCoinOption(
  coinType: string,
  options: SelectableCoinOption[] | undefined,
  packageId: string | undefined,
  network: string | undefined,
): SelectableCoinOption | null {
  const normalized = normalizeCoinType(coinType);
  const candidates = options ?? getSelectableCoinOptions({ network, packageId });
  return candidates.find((option) => normalizeCoinType(option.coinType) === normalized) ?? null;
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
  options?: SelectableCoinOption[],
): boolean {
  return findSelectableCoinOption(coinType, options, packageId, network) !== null;
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
  options?: SelectableCoinOption[],
): string {
  const displayCoinType = normalizeCoinTypeForDisplay(
    coinType,
    network,
    packageId,
    levoUsdCoinType,
  );

  const selectableOption = findSelectableCoinOption(displayCoinType, options, packageId, network);
  if (selectableOption) {
    return selectableOption.label;
  }

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
  options?: SelectableCoinOption[],
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
    isConfiguredTestUsdcCoinType(displayCoinType, packageId) ||
    findSelectableCoinOption(displayCoinType, options, packageId, network) !== null
  );
}

export function getCoinDecimals(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
  options?: SelectableCoinOption[],
): number {
  const displayCoinType = normalizeCoinTypeForDisplay(
    coinType,
    network,
    packageId,
    levoUsdCoinType,
  );

  const selectableOption = findSelectableCoinOption(displayCoinType, options, packageId, network);
  if (selectableOption) {
    return selectableOption.decimals;
  }

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

export function getInputDecimals(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
  options?: SelectableCoinOption[],
): number {
  const displayCoinType = normalizeCoinTypeForDisplay(
    coinType,
    network,
    packageId,
    levoUsdCoinType,
  );

  const selectableOption = findSelectableCoinOption(displayCoinType, options, packageId, network);
  if (selectableOption) {
    return selectableOption.inputDecimals;
  }

  if (
    displayCoinType === MAINNET_USDC_TYPE ||
    isConfiguredTestUsdcCoinType(displayCoinType, packageId)
  ) {
    return USER_FACING_USDC_DECIMALS;
  }

  return getCoinDecimals(coinType, packageId, network, levoUsdCoinType);
}

function getDisplayDecimals(
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
): number {
  return getInputDecimals(coinType, packageId, network, levoUsdCoinType);
}

function formatRoundedBaseUnits(
  baseUnits: string,
  chainDecimals: number,
  displayDecimals: number,
  fixedScale = false,
): string {
  const amount = BigInt(baseUnits);
  const roundingShift = chainDecimals - displayDecimals;

  if (roundingShift < 0) {
    const amountString = amount.toString().padStart(chainDecimals + 1, '0');
    const whole = amountString.slice(0, -chainDecimals);
    const fractional = amountString.slice(-chainDecimals).padEnd(displayDecimals, '0');
    const fixedFraction = fractional.slice(0, displayDecimals);
    if (displayDecimals === 0) {
      return whole;
    }
    if (fixedScale) {
      return `${whole}.${fixedFraction}`;
    }
    const trimmedFraction = fixedFraction.replace(/0+$/, '');
    return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
  }

  const roundingDivisor = 10n ** BigInt(roundingShift);
  const roundedAmount = roundingShift === 0
    ? amount
    : amount / roundingDivisor;
  const roundedString = roundedAmount.toString().padStart(displayDecimals + 1, '0');

  if (displayDecimals === 0) {
    return roundedString;
  }

  const whole = roundedString.slice(0, -displayDecimals);
  const fractional = roundedString.slice(-displayDecimals);

  if (fixedScale) {
    return `${whole}.${fractional}`;
  }

  const trimmedFraction = fractional.replace(/0+$/, '');
  return trimmedFraction ? `${whole}.${trimmedFraction}` : whole;
}

export function isValidAmountInput(value: string, coinType: string): boolean {
  const decimals = getInputDecimals(coinType);
  return new RegExp(`^\\d*(?:\\.\\d{0,${decimals}})?$`).test(value);
}

export function formatAmount(
  baseUnits: string,
  coinType: string,
  packageId = process.env.NEXT_PUBLIC_PACKAGE_ID,
  network = process.env.NEXT_PUBLIC_SUI_NETWORK,
  levoUsdCoinType = process.env.LEVO_USD_COIN_TYPE,
): string {
  const chainDecimals = getCoinDecimals(coinType, packageId, network, levoUsdCoinType);
  const displayDecimals = getDisplayDecimals(coinType, packageId, network, levoUsdCoinType);
  const fixedScale = displayDecimals !== chainDecimals;
  return formatRoundedBaseUnits(baseUnits, chainDecimals, displayDecimals, fixedScale);
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
