import { describe, expect, it, vi } from 'vitest';

import {
  ADDRESS_BALANCE_GAS_FEATURE_FLAG,
  buildTransactionBytesWithGasPreference,
  getAddressBalanceGasStatus,
  sendFundsToAddressBalance,
} from './address-balance';

function makeClient(params: {
  featureEnabled?: boolean;
  addressBalance?: string;
  coinBalance?: string;
}) {
  const addressBalance = params.addressBalance ?? '0';
  const coinBalance = params.coinBalance ?? '0';
  const totalBalance = (BigInt(addressBalance) + BigInt(coinBalance)).toString();

  return {
    getProtocolConfig: vi.fn(async () => ({
      featureFlags: {
        [ADDRESS_BALANCE_GAS_FEATURE_FLAG]: params.featureEnabled ?? false,
      },
    })),
    core: {
      getBalance: vi.fn(async () => ({
        balance: {
          balance: totalBalance,
          addressBalance,
          coinBalance,
        },
      })),
    },
  };
}

function makeTx(bytes: number[]) {
  return {
    setGasOwner: vi.fn(),
    setGasPayment: vi.fn(),
    build: vi.fn(async () => Uint8Array.from(bytes)),
  };
}

describe('address balance helpers', () => {
  it('reports address-balance gas as available only when the feature flag and SUI address balance are present', async () => {
    const client = makeClient({
      featureEnabled: true,
      addressBalance: '200',
      coinBalance: '50',
    });

    await expect(getAddressBalanceGasStatus({
      client,
      owner: '0xsponsor',
      minBalanceMist: 100n,
    })).resolves.toEqual({
      featureEnabled: true,
      addressBalance: 200n,
      coinBalance: 50n,
      totalBalance: 250n,
      available: true,
      reason: null,
    });
  });

  it('sets empty gas payment for address-balance gas and builds the transaction bytes', async () => {
    const client = makeClient({
      featureEnabled: true,
      addressBalance: '1000',
      coinBalance: '0',
    });
    const tx = makeTx([1, 2, 3]);
    const buildTransaction = vi.fn(() => tx);

    await expect(buildTransactionBytesWithGasPreference({
      client,
      gasOwner: '0xsponsor',
      buildTransaction,
      minAddressBalanceMist: 1n,
    })).resolves.toMatchObject({
      txBytes: Uint8Array.from([1, 2, 3]),
      gasMode: 'address-balance',
    });

    expect(buildTransaction).toHaveBeenCalledTimes(1);
    expect(tx.setGasOwner).toHaveBeenCalledWith('0xsponsor');
    expect(tx.setGasPayment).toHaveBeenCalledWith([]);
    expect(tx.build).toHaveBeenCalledWith({ client });
  });

  it('rebuilds from the callback when address-balance gas falls back to legacy coin gas', async () => {
    const client = makeClient({
      featureEnabled: true,
      addressBalance: '1000',
      coinBalance: '1000',
    });
    const abTx = makeTx([1, 2, 3]);
    abTx.build.mockRejectedValueOnce(new Error('address balance temporarily unavailable'));
    const legacyTx = makeTx([4, 5, 6]);
    const buildTransaction = vi.fn()
      .mockReturnValueOnce(abTx)
      .mockReturnValueOnce(legacyTx);

    await expect(buildTransactionBytesWithGasPreference({
      client,
      gasOwner: '0xsponsor',
      buildTransaction,
      minAddressBalanceMist: 1n,
      allowLegacyFallback: true,
    })).resolves.toMatchObject({
      txBytes: Uint8Array.from([4, 5, 6]),
      gasMode: 'legacy-coin',
    });

    expect(buildTransaction).toHaveBeenCalledTimes(2);
    expect(abTx.setGasPayment).toHaveBeenCalledWith([]);
    expect(legacyTx.setGasOwner).toHaveBeenCalledWith('0xsponsor');
    expect(legacyTx.setGasPayment).not.toHaveBeenCalled();
  });

  it('emits coin::send_funds for address-balance settlement', () => {
    const tx = {
      moveCall: vi.fn(),
      pure: {
        address: vi.fn((value: string) => `address:${value}`),
      },
    };

    sendFundsToAddressBalance({
      tx: tx as never,
      coin: 'coin-object' as never,
      recipient: '0xrecipient',
      coinType: '0x2::sui::SUI',
    });

    expect(tx.moveCall).toHaveBeenCalledWith({
      target: '0x2::coin::send_funds',
      typeArguments: ['0x2::sui::SUI'],
      arguments: ['coin-object', 'address:0xrecipient'],
    });
  });
});
