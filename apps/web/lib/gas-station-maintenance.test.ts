import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  executeTransactionBlockMock,
  signTransactionMock,
  transactionBuildMock,
  transactionMergeCoinsMock,
  transactionObjectMock,
  transactionSetGasOwnerMock,
  transactionSetGasPaymentMock,
  transactionSetSenderMock,
} = vi.hoisted(() => ({
  executeTransactionBlockMock: vi.fn(),
  signTransactionMock: vi.fn(),
  transactionBuildMock: vi.fn(),
  transactionMergeCoinsMock: vi.fn(),
  transactionObjectMock: vi.fn(),
  transactionSetGasOwnerMock: vi.fn(),
  transactionSetGasPaymentMock: vi.fn(),
  transactionSetSenderMock: vi.fn(),
}));

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn().mockImplementation(function TransactionMock() {
    return {
      gas: 'gas-coin',
      setSender: transactionSetSenderMock,
      setGasOwner: transactionSetGasOwnerMock,
      setGasPayment: transactionSetGasPaymentMock,
      object: transactionObjectMock,
      mergeCoins: transactionMergeCoinsMock,
      build: transactionBuildMock,
    };
  }),
}));

import {
  formatGasStationHealthSummary,
  mergeGasStationCoins,
  summarizeGasStationCoins,
} from './gas-station-maintenance';

describe('summarizeGasStationCoins', () => {
  it('summarizes balance, fragmentation, and warnings', () => {
    const summary = summarizeGasStationCoins({
      address: '0xgasstation',
      coins: [
        { coinObjectId: '0x1', balance: 50_000_000n, digest: 'd1', version: '1' },
        { coinObjectId: '0x2', balance: 25_000_000n, digest: 'd2', version: '2' },
        { coinObjectId: '0x3', balance: 10_000_000n, digest: 'd3', version: '3' },
      ],
      minTotalBalanceMist: 100_000_000n,
      maxCoinCount: 2,
    });

    expect(summary).toMatchObject({
      address: '0xgasstation',
      coinCount: 3,
      totalBalance: 85_000_000n,
      largestCoinBalance: 50_000_000n,
      smallestCoinBalance: 10_000_000n,
    });
    expect(summary.warnings).toEqual([
      'Total sponsor balance is below the recommended threshold of 0.1000 SUI.',
      'Coin fragmentation is high (3 SUI coins). Consider merging them during a quiet period.',
    ]);
  });

  it('formats a human-readable status line with next-step commands', () => {
    const lines = formatGasStationHealthSummary({
      address: '0xgasstation',
      coinCount: 2,
      totalBalance: 1_250_000_000n,
      largestCoinBalance: 1_000_000_000n,
      smallestCoinBalance: 250_000_000n,
      warnings: ['Coin fragmentation is high (2 SUI coins). Consider merging them during a quiet period.'],
    });

    expect(lines).toEqual([
      'Address: 0xgasstation',
      'Total SUI: 1.2500 (2 coins; largest 1.0000, smallest 0.2500)',
      'Warning: Coin fragmentation is high (2 SUI coins). Consider merging them during a quiet period.',
      'Commands: pnpm --dir apps/web gas-station:status | pnpm --dir apps/web gas-station:merge',
    ]);
  });
});

describe('mergeGasStationCoins', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionObjectMock.mockImplementation((coinObjectId: string) => `object:${coinObjectId}`);
    transactionBuildMock.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    signTransactionMock.mockResolvedValue({ signature: 'gas-signature' });
    executeTransactionBlockMock.mockResolvedValue({ digest: '0xmergedigest' });
  });

  it('rejects merge requests when there are fewer than two SUI coins', async () => {
    await expect(mergeGasStationCoins({
      address: '0xgasstation',
      coins: [{ coinObjectId: '0x1', balance: 1n, digest: 'd1', version: '1' }],
      client: {
        getCoins: vi.fn(),
        executeTransactionBlock: executeTransactionBlockMock,
      },
      keypair: {
        signTransaction: signTransactionMock,
      },
    })).rejects.toThrow('Need at least two SUI coins to merge.');
  });

  it('merges all non-primary coins into the largest SUI coin', async () => {
    const result = await mergeGasStationCoins({
      address: '0xgasstation',
      coins: [
        { coinObjectId: '0xsmall', balance: 10n, digest: 'd1', version: '1' },
        { coinObjectId: '0xlarge', balance: 50n, digest: 'd2', version: '2' },
        { coinObjectId: '0xmid', balance: 25n, digest: 'd3', version: '3' },
      ],
      client: {
        getCoins: vi.fn(),
        executeTransactionBlock: executeTransactionBlockMock,
      },
      keypair: {
        signTransaction: signTransactionMock,
      },
    });

    expect(transactionSetSenderMock).toHaveBeenCalledWith('0xgasstation');
    expect(transactionSetGasOwnerMock).toHaveBeenCalledWith('0xgasstation');
    expect(transactionSetGasPaymentMock).toHaveBeenCalledWith([
      {
        objectId: '0xlarge',
        digest: 'd2',
        version: '2',
      },
    ]);
    expect(transactionMergeCoinsMock).toHaveBeenCalledWith('gas-coin', [
      'object:0xmid',
      'object:0xsmall',
    ]);
    expect(signTransactionMock).toHaveBeenCalledWith(Uint8Array.from([1, 2, 3]));
    expect(executeTransactionBlockMock).toHaveBeenCalledWith({
      transactionBlock: Uint8Array.from([1, 2, 3]),
      signature: 'gas-signature',
      options: {
        showEffects: true,
      },
    });
    expect(result).toEqual({
      mergedCount: 2,
      primaryCoinObjectId: '0xlarge',
      txDigest: '0xmergedigest',
    });
  });
});
