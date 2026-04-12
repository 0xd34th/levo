import { beforeEach, describe, expect, it, vi } from 'vitest';

type GasStationKeypairMock = {
  toSuiAddress: () => string;
};

const {
  redisStore,
  prismaMock,
  executeTransactionBlockMock,
  getTransactionBlockMock,
  getBalanceMock,
  dryRunTransactionBlockMock,
  getGasStationAddressMock,
  getGasStationKeypairMock,
  getStableLayerClientMock,
  stableLayerGetClaimRewardUsdbAmountMock,
  stableLayerBuildBurnTxMock,
  stableLayerBuildClaimTxMock,
  stableLayerBuildMintTxMock,
  stableLayerGetConstantsMock,
  bucketBuildDepositToSavingPoolTransactionMock,
  bucketBuildPSMSwapOutTransactionMock,
  bucketGetConfigMock,
  bucketGetUserAccountsMock,
  signSuiTransactionMock,
  transactionAddMock,
  transactionBuildMock,
  transactionMoveCallMock,
  transactionPureStringMock,
  transactionSetSenderMock,
  transactionSetGasOwnerMock,
  transactionSplitCoinsMock,
  transactionTransferObjectsMock,
} = vi.hoisted(() => {
  const redisStore = new Map<string, string>();
  const prismaMock = {
    xUser: {
      findUnique: vi.fn(),
    },
    earnAccounting: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    pendingEarn: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  return {
    redisStore,
    prismaMock,
    executeTransactionBlockMock: vi.fn(),
    getTransactionBlockMock: vi.fn(),
    getBalanceMock: vi.fn(),
    dryRunTransactionBlockMock: vi.fn(),
    getGasStationAddressMock: vi.fn(() => '0xgasstation'),
    getGasStationKeypairMock: vi.fn<() => GasStationKeypairMock | null>(() => null),
    getStableLayerClientMock: vi.fn(),
    stableLayerGetClaimRewardUsdbAmountMock: vi.fn(),
    stableLayerBuildBurnTxMock: vi.fn(),
    stableLayerBuildClaimTxMock: vi.fn(),
    stableLayerBuildMintTxMock: vi.fn(),
    stableLayerGetConstantsMock: vi.fn(),
    bucketBuildDepositToSavingPoolTransactionMock: vi.fn(),
    bucketBuildPSMSwapOutTransactionMock: vi.fn(),
    bucketGetConfigMock: vi.fn(),
    bucketGetUserAccountsMock: vi.fn(),
    signSuiTransactionMock: vi.fn(),
    transactionAddMock: vi.fn((value) => value),
    transactionBuildMock: vi.fn(),
    transactionMoveCallMock: vi.fn(() => 'move-call-result'),
    transactionPureStringMock: vi.fn((value) => value),
    transactionSetSenderMock: vi.fn(),
    transactionSetGasOwnerMock: vi.fn(),
    transactionSplitCoinsMock: vi.fn(() => ['split-coin']),
    transactionTransferObjectsMock: vi.fn(),
  };
});

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn().mockImplementation(function TransactionMock() {
    return {
      add: transactionAddMock,
      moveCall: transactionMoveCallMock,
      pure: {
        string: transactionPureStringMock,
      },
      setSender: transactionSetSenderMock,
      setGasOwner: transactionSetGasOwnerMock,
      splitCoins: transactionSplitCoinsMock,
      transferObjects: transactionTransferObjectsMock,
      build: transactionBuildMock,
    };
  }),
  TransactionDataBuilder: {
    getDigestFromBytes: vi.fn(() => '0xtestdigest'),
  },
  coinWithBalance: vi.fn(),
}));

vi.mock('@mysten/sui/utils', () => ({
  normalizeSuiAddress: (value: string) => value.toLowerCase(),
}));

vi.mock('@/lib/coins', () => ({
  MAINNET_USDC_TYPE: '0xusdc',
  SUI_COIN_TYPE: '0x2::sui::SUI',
  getConfiguredLevoUsdCoinType: vi.fn(() => '0xstable'),
  getUserFacingUsdcCoinType: vi.fn(() => '0xusdc'),
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationKeypair: getGasStationKeypairMock,
  getGasStationAddress: getGasStationAddressMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('@/lib/privy-auth', () => ({
  getPrivyClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/privy-wallet', () => ({
  buildPrivyRawSignAuthorizationRequest: vi.fn(),
  signSuiTransaction: signSuiTransactionMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  getRedis: vi.fn(() => ({
    status: 'ready',
    set: vi.fn(async (key: string, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      redisStore.delete(key);
      return 1;
    }),
  })),
}));

vi.mock('@/lib/stable-layer', () => ({
  getStableLayerClient: getStableLayerClientMock,
}));

vi.mock('@/lib/sui', () => ({
  getSuiClient: vi.fn(() => ({
    executeTransactionBlock: executeTransactionBlockMock,
    getTransactionBlock: getTransactionBlockMock,
    getBalance: getBalanceMock,
    dryRunTransactionBlock: dryRunTransactionBlockMock,
  })),
}));

import {
  EARN_RETAINED_ACCOUNT_ALIAS,
  executeEarnAction,
  extractCreatedEarnRetainedAccountId,
  findEarnRetainedAccountId,
  getEarnSummary,
  previewEarnAction,
  resolveClaimableRewardUsdb,
  splitRetainedYieldUsdb,
} from './stable-layer-earn';

const RETAINED_ACCOUNT_ID = '0x00000000000000000000000000000000000000000000000000000000000000aa';
const OTHER_ACCOUNT_ID = '0x00000000000000000000000000000000000000000000000000000000000000bb';

function stagePreview(previewToken: string, payload: Record<string, unknown>) {
  redisStore.set(`earn-preview:${previewToken}`, JSON.stringify(payload));
}

function stageAuthorization(previewToken: string, payload: Record<string, unknown>) {
  redisStore.set(`earn-authorization:${previewToken}`, JSON.stringify(payload));
}

describe('stable-layer earn helpers', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    redisStore.clear();
    prismaMock.xUser.findUnique.mockReset();
    prismaMock.earnAccounting.upsert.mockReset();
    prismaMock.earnAccounting.findUnique.mockReset();
    prismaMock.pendingEarn.upsert.mockReset();
    prismaMock.pendingEarn.findUnique.mockReset();
    prismaMock.pendingEarn.delete.mockReset();
    prismaMock.pendingEarn.deleteMany.mockReset();
    executeTransactionBlockMock.mockReset();
    getTransactionBlockMock.mockReset();
    getBalanceMock.mockReset();
    dryRunTransactionBlockMock.mockReset();
    getGasStationAddressMock.mockReset();
    getGasStationKeypairMock.mockReset();
    getStableLayerClientMock.mockReset();
    stableLayerGetClaimRewardUsdbAmountMock.mockReset();
    stableLayerBuildBurnTxMock.mockReset();
    stableLayerBuildClaimTxMock.mockReset();
    stableLayerBuildMintTxMock.mockReset();
    stableLayerGetConstantsMock.mockReset();
    bucketBuildDepositToSavingPoolTransactionMock.mockReset();
    bucketBuildPSMSwapOutTransactionMock.mockReset();
    bucketGetConfigMock.mockReset();
    bucketGetUserAccountsMock.mockReset();
    signSuiTransactionMock.mockReset();
    transactionAddMock.mockReset();
    transactionBuildMock.mockReset();
    transactionMoveCallMock.mockReset();
    transactionPureStringMock.mockReset();
    transactionSetSenderMock.mockReset();
    transactionSetGasOwnerMock.mockReset();
    transactionSplitCoinsMock.mockReset();
    transactionTransferObjectsMock.mockReset();

    prismaMock.xUser.findUnique.mockResolvedValue({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xsender',
      suiPublicKey: 'stored-public-key',
    });
    prismaMock.pendingEarn.upsert.mockResolvedValue(undefined);
    prismaMock.pendingEarn.findUnique.mockResolvedValue(null);
    prismaMock.pendingEarn.delete.mockResolvedValue(undefined);
    prismaMock.pendingEarn.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.earnAccounting.findUnique.mockResolvedValue(null);
    prismaMock.earnAccounting.upsert.mockResolvedValue(undefined);
    getBalanceMock.mockImplementation(async ({ owner, coinType }) => {
      if (owner === '0xsender' && coinType === '0xusdc') {
        return { totalBalance: '1000000' };
      }
      if (owner === '0xsender' && coinType === '0xstable') {
        return { totalBalance: '500000' };
      }
      return { totalBalance: '0' };
    });
    dryRunTransactionBlockMock.mockResolvedValue({ balanceChanges: [] });
    getGasStationAddressMock.mockReturnValue('0xgasstation');
    getGasStationKeypairMock.mockReturnValue(null);
    stableLayerGetClaimRewardUsdbAmountMock.mockResolvedValue(0n);
    stableLayerBuildBurnTxMock.mockResolvedValue('principal-usdc-coin');
    stableLayerBuildClaimTxMock.mockResolvedValue('reward-usdb-coin');
    stableLayerBuildMintTxMock.mockResolvedValue(undefined);
    stableLayerGetConstantsMock.mockReturnValue({ SAVING_TYPE: '0xsaving' });
    bucketBuildDepositToSavingPoolTransactionMock.mockResolvedValue(undefined);
    bucketBuildPSMSwapOutTransactionMock.mockResolvedValue('reward-usdc-coin');
    bucketGetConfigMock.mockResolvedValue({ FRAMEWORK_PACKAGE_ID: '0xfeed' });
    bucketGetUserAccountsMock.mockResolvedValue([]);
    getStableLayerClientMock.mockResolvedValue({
      buildBurnTx: stableLayerBuildBurnTxMock,
      buildClaimTx: stableLayerBuildClaimTxMock,
      buildMintTx: stableLayerBuildMintTxMock,
      getClaimRewardUsdbAmount: stableLayerGetClaimRewardUsdbAmountMock,
      getConstants: stableLayerGetConstantsMock,
      bucketClient: {
        buildDepositToSavingPoolTransaction: bucketBuildDepositToSavingPoolTransactionMock,
        buildPSMSwapOutTransaction: bucketBuildPSMSwapOutTransactionMock,
        getConfig: bucketGetConfigMock,
        getUserAccounts: bucketGetUserAccountsMock,
      },
    });
    signSuiTransactionMock.mockResolvedValue('user-signature');
    transactionBuildMock.mockResolvedValue(Uint8Array.from([1, 2, 3]));
  });

  it('splits yield into user and retained portions with a strict 90/10 floor', () => {
    expect(splitRetainedYieldUsdb(0n)).toEqual({
      retainedUsdb: 0n,
      userClaimUsdb: 0n,
    });
    expect(splitRetainedYieldUsdb(19n)).toEqual({
      retainedUsdb: 2n,
      userClaimUsdb: 17n,
    });
    expect(splitRetainedYieldUsdb(100n)).toEqual({
      retainedUsdb: 10n,
      userClaimUsdb: 90n,
    });
  });

  it('finds the retained earn account by its reserved alias', () => {
    expect(findEarnRetainedAccountId([
      {
        alias: null,
        id: { id: '0xaaa' },
      },
      {
        alias: EARN_RETAINED_ACCOUNT_ALIAS,
        id: { id: RETAINED_ACCOUNT_ID },
      },
    ])).toBe(RETAINED_ACCOUNT_ID);
    expect(findEarnRetainedAccountId([])).toBeNull();
  });

  it('extracts the created retained account id from transaction object changes', () => {
    expect(extractCreatedEarnRetainedAccountId([
      {
        objectId: RETAINED_ACCOUNT_ID,
        objectType: '0xfeed::account::Account',
        type: 'created',
      },
      {
        objectId: OTHER_ACCOUNT_ID,
        objectType: '0xfeed::something::Else',
        type: 'created',
      },
    ], '0xfeed')).toBe(RETAINED_ACCOUNT_ID);
    expect(extractCreatedEarnRetainedAccountId([], '0xfeed')).toBeNull();
  });

  it('treats claim reward dry-run inference failures as zero during withdraw', async () => {
    await expect(resolveClaimableRewardUsdb({
      action: 'withdraw',
      fetchClaimRewardUsdbAmount: async () => {
        throw new Error(
          'StableLayerClient.getClaimRewardUsdbAmount: dry-run did not succeed; cannot infer claimable USDB.',
        );
      },
    })).resolves.toEqual({ amount: 0n, yieldSettlementSkipped: true });
  });

  it('returns resolved reward with yieldSettlementSkipped false on success', async () => {
    await expect(resolveClaimableRewardUsdb({
      action: 'claim',
      fetchClaimRewardUsdbAmount: async () => 500n,
    })).resolves.toEqual({ amount: 500n, yieldSettlementSkipped: false });
  });

  it('still throws claim reward dry-run inference failures during claim', async () => {
    await expect(resolveClaimableRewardUsdb({
      action: 'claim',
      fetchClaimRewardUsdbAmount: async () => {
        throw new Error(
          'StableLayerClient.getClaimRewardUsdbAmount: dry-run did not succeed; cannot infer claimable USDB.',
        );
      },
    })).rejects.toThrow(
      'StableLayerClient.getClaimRewardUsdbAmount: dry-run did not succeed; cannot infer claimable USDB.',
    );
  });

  it('rethrows unrelated reward lookup failures during withdraw', async () => {
    await expect(resolveClaimableRewardUsdb({
      action: 'withdraw',
      fetchClaimRewardUsdbAmount: async () => {
        throw new Error('RPC unavailable');
      },
    })).rejects.toThrow('RPC unavailable');
  });

  it('uses sponsor gas during withdraw preview simulation when the gas station is configured', async () => {
    getGasStationKeypairMock.mockReturnValue({
      toSuiAddress: () => '0xgasstation',
    });
    getBalanceMock.mockImplementation(async ({ owner, coinType }) => {
      if (owner === '0xsender' && coinType === '0xusdc') {
        return { totalBalance: '100000' };
      }
      if (owner === '0xsender' && coinType === '0xstable') {
        return { totalBalance: '500000' };
      }
      if (owner === '0xgasstation') {
        return { totalBalance: '200000000' };
      }
      return { totalBalance: '0' };
    });
    stableLayerGetClaimRewardUsdbAmountMock.mockRejectedValue(
      new Error(
        'StableLayerClient.getClaimRewardUsdbAmount: dry-run did not succeed; cannot infer claimable USDB.',
      ),
    );
    dryRunTransactionBlockMock
      .mockResolvedValueOnce({
        balanceChanges: [
          {
            owner: { AddressOwner: '0xsender' },
            coinType: '0xreward',
            amount: '20',
          },
        ],
      })
      .mockResolvedValueOnce({
        balanceChanges: [
          {
            owner: { AddressOwner: '0xsender' },
            coinType: '0xusdc',
            amount: '18',
          },
        ],
      })
      .mockResolvedValueOnce({
        balanceChanges: [
          {
            owner: { AddressOwner: '0xsender' },
            coinType: '0xreward',
            amount: '0',
          },
        ],
      })
      .mockResolvedValueOnce({
        balanceChanges: [
          {
            owner: { AddressOwner: '0xsender' },
            coinType: '0xusdc',
            amount: '100',
          },
        ],
      });

    await expect(previewEarnAction({
      xUserId: 'x-user-1',
      action: 'withdraw',
      amount: '100',
    })).resolves.toMatchObject({
      walletReady: true,
      availableUsdc: '100000',
      depositedUsdc: '500000',
      claimableYieldUsdc: '18',
      claimableYieldReliable: true,
      action: 'withdraw',
      amount: '100',
      userReceivesUsdc: '100',
    });

    expect(stableLayerGetClaimRewardUsdbAmountMock).not.toHaveBeenCalled();
    expect(transactionSetGasOwnerMock).toHaveBeenCalledTimes(4);
  });

  it('derives claimable yield from sponsor-backed simulation instead of the sdk helper', async () => {
    getGasStationKeypairMock.mockReturnValue({
      toSuiAddress: () => '0xgasstation',
    });
    getBalanceMock.mockImplementation(async ({ owner, coinType }) => {
      if (owner === '0xsender' && coinType === '0xusdc') {
        return { totalBalance: '100000' };
      }
      if (owner === '0xsender' && coinType === '0xstable') {
        return { totalBalance: '500000' };
      }
      if (owner === '0xgasstation') {
        return { totalBalance: '200000000' };
      }
      return { totalBalance: '0' };
    });
    stableLayerGetClaimRewardUsdbAmountMock.mockRejectedValue(
      new Error(
        'StableLayerClient.getClaimRewardUsdbAmount: dry-run did not succeed; cannot infer claimable USDB.',
      ),
    );
    dryRunTransactionBlockMock
      .mockResolvedValueOnce({
        balanceChanges: [
          {
            owner: { AddressOwner: '0xsender' },
            coinType: '0xreward',
            amount: '1000',
          },
        ],
      })
      .mockResolvedValueOnce({
        balanceChanges: [
          {
            owner: { AddressOwner: '0xsender' },
            coinType: '0xusdc',
            amount: '900',
          },
        ],
      });

    await expect(getEarnSummary({
      xUserId: 'x-user-1',
    })).resolves.toEqual({
      walletReady: true,
      availableUsdc: '100000',
      depositedUsdc: '500000',
      claimableYieldUsdc: '900',
      claimableYieldReliable: true,
    });

    expect(stableLayerGetClaimRewardUsdbAmountMock).not.toHaveBeenCalled();
    expect(transactionSetGasOwnerMock).toHaveBeenNthCalledWith(1, '0xgasstation');
    expect(transactionSetGasOwnerMock).toHaveBeenNthCalledWith(2, '0xgasstation');
  });

  it('rethrows on-chain execute failures instead of downgrading them to pending', async () => {
    stagePreview('preview-token', {
      xUserId: 'x-user-1',
      action: 'claim',
      amount: '0',
    });
    stageAuthorization('preview-token', {
      action: 'claim',
      txBytesBase64: Buffer.from('tx-bytes').toString('base64'),
      walletId: 'wallet-id',
      storedPublicKey: 'stored-public-key',
      sponsored: false,
    });
    executeTransactionBlockMock.mockResolvedValue({
      digest: '0xfailed',
      effects: {
        status: {
          status: 'failure',
          error: 'insufficient balance',
        },
      },
    });

    await expect(executeEarnAction({
      xUserId: 'x-user-1',
      privyUserId: 'privy-user',
      previewToken: 'preview-token',
      authorizationSignature: 'auth-signature',
    })).rejects.toThrow('Earn transaction failed on-chain: insufficient balance');

    expect(prismaMock.pendingEarn.upsert).toHaveBeenCalled();
    expect(prismaMock.pendingEarn.delete).toHaveBeenCalledWith({
      where: { txDigest: '0xtestdigest' },
    });
  });

  it('annotates gas coin execution failures with the gas station address', async () => {
    stagePreview('preview-token', {
      xUserId: 'x-user-1',
      action: 'claim',
      amount: '0',
    });
    stageAuthorization('preview-token', {
      action: 'claim',
      txBytesBase64: Buffer.from('tx-bytes').toString('base64'),
      walletId: 'wallet-id',
      storedPublicKey: 'stored-public-key',
      sponsored: false,
    });
    executeTransactionBlockMock.mockResolvedValue({
      digest: '0xfailed',
      effects: {
        status: {
          status: 'failure',
          error: 'No valid gas coins found for the transaction.',
        },
      },
    });

    await expect(executeEarnAction({
      xUserId: 'x-user-1',
      privyUserId: 'privy-user',
      previewToken: 'preview-token',
      authorizationSignature: 'auth-signature',
    })).rejects.toThrow(
      'Earn transaction failed on-chain: No valid gas coins found for the transaction. Gas station address: 0xgasstation. Check sponsor SUI balance/fragmentation with "pnpm --dir apps/web gas-station:status"; if needed, merge coins with "pnpm --dir apps/web gas-station:merge".',
    );
  });

  it('still returns pending when execute submission fails before on-chain status is known', async () => {
    stagePreview('preview-token', {
      xUserId: 'x-user-1',
      action: 'claim',
      amount: '0',
    });
    stageAuthorization('preview-token', {
      action: 'claim',
      txBytesBase64: Buffer.from('tx-bytes').toString('base64'),
      walletId: 'wallet-id',
      storedPublicKey: 'stored-public-key',
      sponsored: false,
    });
    executeTransactionBlockMock.mockRejectedValue(new Error('RPC timeout'));

    await expect(executeEarnAction({
      xUserId: 'x-user-1',
      privyUserId: 'privy-user',
      previewToken: 'preview-token',
      authorizationSignature: 'auth-signature',
    })).resolves.toEqual({
      status: 'pending',
      action: 'claim',
      txDigest: '0xtestdigest',
    });
  });
});
