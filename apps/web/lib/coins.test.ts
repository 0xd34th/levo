import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getConfiguredLevoUsdCoinType,
  getCoinDecimals,
  getInputDecimals,
  getCoinLabel,
  getSelectableCoinOptions,
  getExplorerTransactionUrl,
  getTestUsdcCoinType,
  getSettlementCoinType,
  getUserFacingUsdcCoinType,
  MAINNET_USDC_TYPE,
  normalizeCoinTypeForDisplay,
  isDisplaySupportedCoinType,
  isStableLayerEnabled,
  formatAmount,
  isValidAmountInput,
  SUI_COIN_TYPE,
} from './coins';

describe('coin helpers', () => {
  const configuredPackageId = '0xabc';
  const configuredTestUsdc = getTestUsdcCoinType(configuredPackageId)!;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('whitelists SUI and TEST_USDC for display formatting', () => {
    expect(isDisplaySupportedCoinType(SUI_COIN_TYPE)).toBe(true);
    expect(isDisplaySupportedCoinType(configuredTestUsdc, configuredPackageId)).toBe(true);
    expect(
      isDisplaySupportedCoinType('0xdef::test_usdc::TEST_USDC', configuredPackageId),
    ).toBe(false);
    expect(isDisplaySupportedCoinType('0xabc::other::OTHER', configuredPackageId)).toBe(false);
  });

  it('returns the configured decimals for the supported whitelist', () => {
    expect(getCoinDecimals(SUI_COIN_TYPE)).toBe(9);
    expect(getCoinDecimals(configuredTestUsdc, configuredPackageId)).toBe(6);
    expect(getCoinLabel(configuredTestUsdc, configuredPackageId)).toBe('TEST_USDC');
  });

  it('rejects unsupported coin types instead of silently misformatting them', () => {
    expect(() => getCoinDecimals('0xabc::other::OTHER', configuredPackageId)).toThrow(
      'Unsupported coin type: 0xabc::other::OTHER',
    );
    expect(() => getCoinLabel('0xabc::other::OTHER', configuredPackageId)).toThrow(
      'Unsupported coin type: 0xabc::other::OTHER',
    );
    expect(() => getCoinLabel('0xdef::test_usdc::TEST_USDC', configuredPackageId)).toThrow(
      'Unsupported coin type: 0xdef::test_usdc::TEST_USDC',
    );
  });

  it('returns explorer URLs only for valid Sui transaction digests', () => {
    expect(
      getExplorerTransactionUrl('testnet', '11111111111111111111111111111111'),
    ).toBe('https://suiscan.xyz/testnet/tx/11111111111111111111111111111111');
    expect(getExplorerTransactionUrl('testnet', 'not/a-valid-digest')).toBeNull();
  });

  it('trims the configured package id before building the TEST_USDC coin type', () => {
    expect(getTestUsdcCoinType(' 0xabc ')).toBe('0xabc::test_usdc::TEST_USDC');
    expect(getTestUsdcCoinType('   ')).toBeNull();
  });

  it('maps mainnet USDC display semantics to LevoUSD settlement semantics', () => {
    const levoUsdCoinType = '0xlevo::levo_usd::LEVO_USD';

    expect(isStableLayerEnabled('mainnet', configuredPackageId, levoUsdCoinType)).toBe(true);
    expect(getUserFacingUsdcCoinType('mainnet', configuredPackageId)).toBe(MAINNET_USDC_TYPE);
    expect(getConfiguredLevoUsdCoinType(configuredPackageId, levoUsdCoinType)).toBe(levoUsdCoinType);
    expect(getSettlementCoinType(MAINNET_USDC_TYPE, 'mainnet', configuredPackageId, levoUsdCoinType)).toBe(
      levoUsdCoinType,
    );
  });

  it('does not fall back to the bundled contracts coin type on mainnet', () => {
    expect(getConfiguredLevoUsdCoinType(configuredPackageId, undefined, 'mainnet')).toBeNull();
    expect(isStableLayerEnabled('mainnet', configuredPackageId, undefined)).toBe(false);
    expect(getSettlementCoinType(MAINNET_USDC_TYPE, 'mainnet', configuredPackageId, undefined)).toBe(
      MAINNET_USDC_TYPE,
    );
  });

  it('still falls back to the bundled coin type on testnet', () => {
    const expectedFallback = `${configuredPackageId}::levo_usd::LEVO_USD`;
    expect(getConfiguredLevoUsdCoinType(configuredPackageId, undefined, 'testnet')).toBe(expectedFallback);
  });

  it('treats LevoUSD as a displayable USDC balance on mainnet', () => {
    const levoUsdCoinType = '0xlevo::levo_usd::LEVO_USD';

    expect(isDisplaySupportedCoinType(levoUsdCoinType, configuredPackageId, 'mainnet', levoUsdCoinType)).toBe(true);
    expect(getCoinLabel(levoUsdCoinType, configuredPackageId, 'mainnet', levoUsdCoinType)).toBe('USDC');
    expect(getCoinDecimals(levoUsdCoinType, configuredPackageId, 'mainnet', levoUsdCoinType)).toBe(6);
    expect(normalizeCoinTypeForDisplay(levoUsdCoinType, 'mainnet', configuredPackageId, levoUsdCoinType)).toBe(
      MAINNET_USDC_TYPE,
    );
  });

  it('uses the public LevoUSD coin type for browser-side display mapping', () => {
    const levoUsdCoinType = '0xlevo::levo_usd::LEVO_USD';
    vi.stubEnv('NEXT_PUBLIC_LEVO_USD_COIN_TYPE', levoUsdCoinType);
    vi.stubEnv('LEVO_USD_COIN_TYPE', '');

    expect(getConfiguredLevoUsdCoinType(configuredPackageId, undefined, 'mainnet')).toBe(levoUsdCoinType);
    expect(isDisplaySupportedCoinType(levoUsdCoinType, configuredPackageId, 'mainnet')).toBe(true);
    expect(normalizeCoinTypeForDisplay(levoUsdCoinType, 'mainnet', configuredPackageId)).toBe(
      MAINNET_USDC_TYPE,
    );
  });

  it('keeps USDC chain precision but constrains user-facing precision to two decimals', () => {
    const levoUsdCoinType = '0xlevo::levo_usd::LEVO_USD';

    expect(getCoinDecimals(MAINNET_USDC_TYPE)).toBe(6);
    expect(getInputDecimals(MAINNET_USDC_TYPE)).toBe(2);
    expect(getInputDecimals(levoUsdCoinType, configuredPackageId, 'mainnet', levoUsdCoinType)).toBe(2);
    expect(isValidAmountInput('1.23', MAINNET_USDC_TYPE)).toBe(true);
    expect(isValidAmountInput('1.234', MAINNET_USDC_TYPE)).toBe(false);
  });

  it('formats USDC-family balances with fixed two-decimal display', () => {
    const levoUsdCoinType = '0xlevo::levo_usd::LEVO_USD';

    expect(formatAmount('1200000', MAINNET_USDC_TYPE)).toBe('1.20');
    expect(formatAmount('1', MAINNET_USDC_TYPE)).toBe('0.00');
    expect(formatAmount('1234567', levoUsdCoinType, configuredPackageId, 'mainnet', levoUsdCoinType)).toBe('1.23');
    expect(formatAmount('1234567890', SUI_COIN_TYPE)).toBe('1.23456789');
  });

  it('truncates USDC sub-cent balances — never overstates spendable amount', () => {
    expect(formatAmount('1', MAINNET_USDC_TYPE)).toBe('0.00');
    expect(formatAmount('4999', MAINNET_USDC_TYPE)).toBe('0.00');
    expect(formatAmount('5000', MAINNET_USDC_TYPE)).toBe('0.00');
    expect(formatAmount('9999', MAINNET_USDC_TYPE)).toBe('0.00');
    expect(formatAmount('10000', MAINNET_USDC_TYPE)).toBe('0.01');
    expect(formatAmount('15000', MAINNET_USDC_TYPE)).toBe('0.01');
    expect(formatAmount('19999', MAINNET_USDC_TYPE)).toBe('0.01');
    expect(formatAmount('20000', MAINNET_USDC_TYPE)).toBe('0.02');
  });

  it('builds send coin options from built-ins plus configured allowlist entries', () => {
    const options = getSelectableCoinOptions({
      network: 'mainnet',
      configuredCoinsJson: JSON.stringify([
        {
          coinType: '0x123::foo::FOO',
          label: 'FOO',
          decimals: 8,
          inputDecimals: 3,
          caption: 'Foo token',
          iconSrc: '/foo.svg',
        },
      ]),
    });

    expect(options.map((option) => option.coinType)).toEqual([
      MAINNET_USDC_TYPE,
      SUI_COIN_TYPE,
      '0x0000000000000000000000000000000000000000000000000000000000000123::foo::FOO',
    ]);
    expect(getCoinLabel('0x123::foo::FOO', undefined, undefined, undefined, options)).toBe('FOO');
    expect(getCoinDecimals('0x123::foo::FOO', undefined, undefined, undefined, options)).toBe(8);
    expect(getInputDecimals('0x123::foo::FOO', undefined, undefined, undefined, options)).toBe(3);
  });

  it('keeps built-ins first and ignores configured duplicate coin types', () => {
    const options = getSelectableCoinOptions({
      network: 'mainnet',
      configuredCoinsJson: JSON.stringify([
        {
          coinType: MAINNET_USDC_TYPE,
          label: 'Fake USDC',
          decimals: 9,
        },
        {
          coinType: SUI_COIN_TYPE,
          label: 'Fake SUI',
          decimals: 6,
        },
      ]),
    });

    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ coinType: MAINNET_USDC_TYPE, label: 'USDC' });
    expect(options[1]).toMatchObject({ coinType: SUI_COIN_TYPE, label: 'SUI' });
  });

  it('ignores malformed configured coin entries and keeps unsupported coins rejected', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const options = getSelectableCoinOptions({
      network: 'mainnet',
      configuredCoinsJson: JSON.stringify([
        { coinType: 'not-a-coin', label: 'BAD', decimals: 6 },
        { coinType: '0x456::bar::BAR', label: '', decimals: 6 },
        { coinType: '0x789::baz::BAZ', label: 'BAZ', decimals: 42 },
      ]),
    });

    expect(options.map((option) => option.coinType)).toEqual([
      MAINNET_USDC_TYPE,
      SUI_COIN_TYPE,
    ]);
    expect(warn).toHaveBeenCalled();
    expect(() => getCoinLabel('0x456::bar::BAR', undefined, undefined, undefined, options)).toThrow(
      'Unsupported coin type',
    );
    warn.mockRestore();
  });
});
