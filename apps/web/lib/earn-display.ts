import { formatAmount, getInputDecimals } from '@/lib/coins';

function buildLessThanLabel(displayDecimals: number) {
  if (displayDecimals <= 0) {
    return '<1';
  }

  return `<0.${'0'.repeat(displayDecimals - 1)}1`;
}

export function formatEarnEstimateAmount(baseUnits: string, coinType: string) {
  const formatted = formatAmount(baseUnits, coinType);
  if (!/^\d+$/.test(baseUnits) || BigInt(baseUnits) <= 0n) {
    return formatted;
  }

  const displayDecimals = getInputDecimals(coinType);
  const zeroDisplay = displayDecimals > 0 ? `0.${'0'.repeat(displayDecimals)}` : '0';

  if (formatted === zeroDisplay) {
    return buildLessThanLabel(displayDecimals);
  }

  return formatted;
}
