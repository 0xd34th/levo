import { describe, expect, it } from 'vitest';
import {
  getCoinDecimals,
  getCoinLabel,
  getExplorerTransactionUrl,
  getTestUsdcCoinType,
  isDisplaySupportedCoinType,
  SUI_COIN_TYPE,
} from './coins';

describe('coin helpers', () => {
  const configuredPackageId = '0xabc';
  const configuredTestUsdc = getTestUsdcCoinType(configuredPackageId)!;

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
});
