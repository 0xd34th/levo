import { describe, expect, it } from 'vitest';
import { MAINNET_USDC_TYPE } from './coins';

interface EarnFormSummary {
  walletReady: boolean;
  availableUsdc: string;
  depositedUsdc: string;
  claimableYieldUsdc: string;
}

interface EarnActionAvailability {
  stake: boolean;
  claim: boolean;
  withdraw: boolean;
}

interface EarnFormModule {
  parseAmountInputToBaseUnits?: (amountInput: string, coinType: string) => bigint | null;
  getEarnActionAvailability?: (params: {
    amountInput: string;
    busy?: boolean;
    coinType: string;
    summary: EarnFormSummary | null;
  }) => EarnActionAvailability;
}

async function loadEarnFormModule(): Promise<EarnFormModule> {
  try {
    return (await import('./' + 'earn-form')) as EarnFormModule;
  } catch {
    return {};
  }
}

describe('earn-form helpers', () => {
  it('parses positive user-facing USDC amounts into chain base units', async () => {
    const { parseAmountInputToBaseUnits } = await loadEarnFormModule();

    expect(parseAmountInputToBaseUnits?.('1.23', MAINNET_USDC_TYPE)).toBe(1230000n);
    expect(parseAmountInputToBaseUnits?.('0.01', MAINNET_USDC_TYPE)).toBe(10000n);
  });

  it('rejects blank, zero, and incomplete user-facing amounts', async () => {
    const { parseAmountInputToBaseUnits } = await loadEarnFormModule();

    expect(parseAmountInputToBaseUnits?.('', MAINNET_USDC_TYPE)).toBeNull();
    expect(parseAmountInputToBaseUnits?.('.', MAINNET_USDC_TYPE)).toBeNull();
    expect(parseAmountInputToBaseUnits?.('0', MAINNET_USDC_TYPE)).toBeNull();
    expect(parseAmountInputToBaseUnits?.('0.00', MAINNET_USDC_TYPE)).toBeNull();
  });

  it('enables claim only when claimable yield is positive', async () => {
    const { getEarnActionAvailability } = await loadEarnFormModule();

    expect(
      getEarnActionAvailability?.({
        amountInput: '',
        busy: false,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: true,
          availableUsdc: '5000000',
          depositedUsdc: '7000000',
          claimableYieldUsdc: '1',
        },
      }).claim,
    ).toBe(true);

    expect(
      getEarnActionAvailability?.({
        amountInput: '',
        busy: false,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: true,
          availableUsdc: '5000000',
          depositedUsdc: '7000000',
          claimableYieldUsdc: '0',
        },
      }).claim,
    ).toBe(false);
  });

  it('enables stake only when amount is positive and no more than available USDC', async () => {
    const { getEarnActionAvailability } = await loadEarnFormModule();

    expect(
      getEarnActionAvailability?.({
        amountInput: '2.50',
        busy: false,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: true,
          availableUsdc: '2500000',
          depositedUsdc: '7000000',
          claimableYieldUsdc: '0',
        },
      }).stake,
    ).toBe(true);

    expect(
      getEarnActionAvailability?.({
        amountInput: '2.51',
        busy: false,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: true,
          availableUsdc: '2500000',
          depositedUsdc: '7000000',
          claimableYieldUsdc: '0',
        },
      }).stake,
    ).toBe(false);

    expect(
      getEarnActionAvailability?.({
        amountInput: '0.00',
        busy: false,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: true,
          availableUsdc: '2500000',
          depositedUsdc: '7000000',
          claimableYieldUsdc: '0',
        },
      }).stake,
    ).toBe(false);
  });

  it('enables withdraw only when amount is positive and no more than deposited USDC', async () => {
    const { getEarnActionAvailability } = await loadEarnFormModule();

    expect(
      getEarnActionAvailability?.({
        amountInput: '3.00',
        busy: false,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: true,
          availableUsdc: '1000000',
          depositedUsdc: '3000000',
          claimableYieldUsdc: '0',
        },
      }).withdraw,
    ).toBe(true);

    expect(
      getEarnActionAvailability?.({
        amountInput: '3.01',
        busy: false,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: true,
          availableUsdc: '1000000',
          depositedUsdc: '3000000',
          claimableYieldUsdc: '0',
        },
      }).withdraw,
    ).toBe(false);

    expect(
      getEarnActionAvailability?.({
        amountInput: '1.00',
        busy: false,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: true,
          availableUsdc: '1000000',
          depositedUsdc: '0',
          claimableYieldUsdc: '0',
        },
      }).withdraw,
    ).toBe(false);
  });

  it('disables every action when the wallet is not ready or an action is already running', async () => {
    const { getEarnActionAvailability } = await loadEarnFormModule();

    expect(
      getEarnActionAvailability?.({
        amountInput: '1.00',
        busy: true,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: true,
          availableUsdc: '5000000',
          depositedUsdc: '5000000',
          claimableYieldUsdc: '500000',
        },
      }),
    ).toEqual({
      claim: false,
      stake: false,
      withdraw: false,
    });

    expect(
      getEarnActionAvailability?.({
        amountInput: '1.00',
        busy: false,
        coinType: MAINNET_USDC_TYPE,
        summary: {
          walletReady: false,
          availableUsdc: '5000000',
          depositedUsdc: '5000000',
          claimableYieldUsdc: '500000',
        },
      }),
    ).toEqual({
      claim: false,
      stake: false,
      withdraw: false,
    });
  });
});
