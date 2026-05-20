import { describe, expect, it } from 'vitest';
import { MAINNET_USDC_TYPE, SUI_COIN_TYPE } from '@/lib/coins';
import { formatEarnEstimateAmount } from './earn-display';

describe('formatEarnEstimateAmount', () => {
  it('shows sub-cent USDC-family estimates as less than one cent instead of 0.00', () => {
    expect(formatEarnEstimateAmount('1', MAINNET_USDC_TYPE)).toBe('<0.01');
    expect(formatEarnEstimateAmount('9999', MAINNET_USDC_TYPE)).toBe('<0.01');
    expect(formatEarnEstimateAmount('10000', MAINNET_USDC_TYPE)).toBe('0.01');
  });

  it('keeps zero and non-usdc values on the normal formatter path', () => {
    expect(formatEarnEstimateAmount('0', MAINNET_USDC_TYPE)).toBe('0.00');
    expect(formatEarnEstimateAmount('1234567890', SUI_COIN_TYPE)).toBe('1.23456789');
  });
});
