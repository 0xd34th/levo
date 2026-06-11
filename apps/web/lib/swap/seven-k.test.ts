import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAINNET_USDC_TYPE, SUI_COIN_TYPE } from '@/lib/coins';

const {
  buildMock,
  moveCallMock,
  pureAddressMock,
  quoteMock,
  setGasOwnerMock,
  setSenderMock,
  swapMock,
  transactionAddMock,
  transactionSetGasPaymentMock,
} = vi.hoisted(() => ({
  buildMock: vi.fn(),
  moveCallMock: vi.fn(),
  pureAddressMock: vi.fn((value: string) => `address:${value}`),
  quoteMock: vi.fn(),
  setGasOwnerMock: vi.fn(),
  setSenderMock: vi.fn(),
  swapMock: vi.fn(),
  transactionAddMock: vi.fn((value) => value),
  transactionSetGasPaymentMock: vi.fn(),
}));

vi.mock('@7kprotocol/sdk-ts', () => ({
  MetaAg: vi.fn(function MetaAg() {
    return {
      quote: quoteMock,
      swap: swapMock,
    };
  }),
}));

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn().mockImplementation(function TransactionMock() {
    return {
      add: transactionAddMock,
      build: buildMock,
      moveCall: moveCallMock,
      pure: {
        address: pureAddressMock,
      },
      setGasOwner: setGasOwnerMock,
      setGasPayment: transactionSetGasPaymentMock,
      setSender: setSenderMock,
    };
  }),
  coinWithBalance: vi.fn(() => 'coin-in'),
}));

vi.mock('@/lib/sui', () => ({
  getSuiClient: vi.fn(() => ({
    getProtocolConfig: vi.fn(async () => ({
      featureFlags: {
        enable_address_balance_gas_payments: false,
      },
    })),
    core: {
      getBalance: vi.fn(async () => ({
        balance: {
          balance: '0',
          addressBalance: '0',
          coinBalance: '0',
        },
      })),
    },
  })),
}));

import { buildSevenKSwapTransaction, getBestSevenKQuote } from './seven-k';

describe('getBestSevenKQuote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildMock.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    quoteMock.mockReset();
    swapMock.mockResolvedValue('coin-out');
  });

  it('requests a non-simulated quote so simulation failures do not hide valid routes', async () => {
    quoteMock.mockResolvedValueOnce([
      {
        id: 'quote-1',
        provider: 'flowx',
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        amountIn: '1000000000',
        amountOut: '2500000',
      },
    ]);

    await expect(getBestSevenKQuote({
      coinTypeIn: SUI_COIN_TYPE,
      coinTypeOut: MAINNET_USDC_TYPE,
      amount: '1000000000',
      senderAddress: '0xsender',
    })).resolves.toMatchObject({
      provider: 'flowx',
      amountOut: '2500000',
      minAmountOut: '2475000',
    });

    expect(quoteMock).toHaveBeenCalledOnce();
    expect(quoteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amountIn: '1000000000',
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        signer: '0xsender',
        timeout: 7_000,
      }),
    );
  });

  it('selects the best quote by simulated output when simulation succeeds', async () => {
    quoteMock.mockResolvedValueOnce([
      {
        id: 'quote-1',
        provider: 'flowx',
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        amountIn: '1000000000',
        amountOut: '2600000',
        simulatedAmountOut: '2400000',
      },
      {
        id: 'quote-2',
        provider: 'cetus',
        coinTypeIn: SUI_COIN_TYPE,
        coinTypeOut: MAINNET_USDC_TYPE,
        amountIn: '1000000000',
        amountOut: '2500000',
        simulatedAmountOut: '2700000',
      },
    ]);

    await expect(getBestSevenKQuote({
      coinTypeIn: SUI_COIN_TYPE,
      coinTypeOut: MAINNET_USDC_TYPE,
      amount: '1000000000',
      senderAddress: '0xsender',
    })).resolves.toMatchObject({
      provider: 'cetus',
      amountOut: '2700000',
      minAmountOut: '2673000',
    });

    expect(quoteMock).toHaveBeenCalledOnce();
  });

  it('sends swap output to the user address balance', async () => {
    await expect(buildSevenKSwapTransaction({
      quote: { id: 'quote-id' },
      senderAddress: '0xsender',
      coinTypeIn: SUI_COIN_TYPE,
      coinTypeOut: MAINNET_USDC_TYPE,
      amountIn: '1000000000',
      slippageBps: 100,
      gasOwner: '0xgasstation',
    })).resolves.toEqual(Uint8Array.from([1, 2, 3]));

    expect(moveCallMock).toHaveBeenCalledWith({
      target: '0x2::coin::send_funds',
      typeArguments: [MAINNET_USDC_TYPE],
      arguments: ['coin-out', 'address:0xsender'],
    });
  });
});
