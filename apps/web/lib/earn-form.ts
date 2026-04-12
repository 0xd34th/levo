import { getCoinDecimals, isValidAmountInput } from '@/lib/coins';

export interface EarnFormSummary {
  walletReady: boolean;
  availableUsdc: string;
  depositedUsdc: string;
  claimableYieldUsdc: string;
  yieldSettlementMode: 'server_payout' | 'disabled';
}

export interface EarnActionAvailability {
  stake: boolean;
  claim: boolean;
  withdraw: boolean;
}

function parseBaseUnitBalance(value: string): bigint | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  return BigInt(value);
}

export function parseAmountInputToBaseUnits(amountInput: string, coinType: string): bigint | null {
  if (!amountInput || !isValidAmountInput(amountInput, coinType)) {
    return null;
  }

  const [wholeRaw = '0', fractionalRaw = ''] = amountInput.split('.');
  const normalizedWhole = wholeRaw || '0';
  const normalizedFractional = fractionalRaw.padEnd(getCoinDecimals(coinType), '0');
  const parsedAmount = BigInt(`${normalizedWhole}${normalizedFractional}`);

  return parsedAmount > 0n ? parsedAmount : null;
}

export function getEarnActionAvailability(params: {
  amountInput: string;
  busy?: boolean;
  coinType: string;
  summary: EarnFormSummary | null;
}): EarnActionAvailability {
  const { amountInput, busy = false, coinType, summary } = params;
  if (busy || !summary?.walletReady) {
    return {
      stake: false,
      claim: false,
      withdraw: false,
    };
  }

  const availableUsdc = parseBaseUnitBalance(summary.availableUsdc);
  const depositedUsdc = parseBaseUnitBalance(summary.depositedUsdc);
  const claimableYieldUsdc = parseBaseUnitBalance(summary.claimableYieldUsdc);
  if (availableUsdc === null || depositedUsdc === null || claimableYieldUsdc === null) {
    return {
      stake: false,
      claim: false,
      withdraw: false,
    };
  }

  const parsedAmount = parseAmountInputToBaseUnits(amountInput, coinType);

  return {
    stake: availableUsdc > 0n && parsedAmount !== null && parsedAmount <= availableUsdc,
    claim: claimableYieldUsdc > 0n && summary.yieldSettlementMode === 'server_payout',
    withdraw: depositedUsdc > 0n && parsedAmount !== null && parsedAmount <= depositedUsdc,
  };
}
