import { beforeEach, describe, expect, it, vi } from 'vitest';

type GasStationKeypairMock = {
  toSuiAddress: () => string;
};

type ManagerKeypairMock = {
  toSuiAddress: () => string;
  signTransaction: () => Promise<{ signature: string }>;
};

const {
  redisStore,
  prismaMock,
  executeTransactionBlockMock,
  devInspectTransactionBlockMock,
  getTransactionBlockMock,
  getBalanceMock,
  dryRunTransactionBlockMock,
  getGasStationAddressMock,
  getGasStationKeypairMock,
  getStableLayerManagerKeypairMock,
  getStableLayerClientMock,
  stableLayerBuildBurnTxMock,
  stableLayerBuildClaimTxMock,
  stableLayerBuildMintTxMock,
  stableLayerGetConstantsMock,
  stableLayerGetTotalSupplyByCoinTypeMock,
  bucketBuildDepositToSavingPoolTransactionMock,
  bucketBuildPSMSwapOutTransactionMock,
  bucketGetConfigMock,
  bucketGetUsdbCoinTypeMock,
  bucketGetSavingPoolObjectInfoMock,
  bucketGetUserAccountsMock,
  releaseRewardsMock,
  signSuiTransactionMock,
  transactionAddMock,
  transactionBuildMock,
  transactionMergeCoinsMock,
  transactionMoveCallMock,
  transactionObjectMock,
  transactionPureStringMock,
  transactionSetSenderMock,
  transactionSetGasOwnerMock,
  transactionSplitCoinsMock,
  transactionTransferObjectsMock,
} = vi.hoisted(() => {
  const redisStore = new Map<string, string>();
  const prismaMock = {
    $transaction: vi.fn(),
    xUser: {
      findUnique: vi.fn(),
    },
    earnAccounting: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    earnGlobalState: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    pendingEarn: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    pendingEarnSettlement: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  return {
    redisStore,
    prismaMock,
    executeTransactionBlockMock: vi.fn(),
    devInspectTransactionBlockMock: vi.fn(),
    getTransactionBlockMock: vi.fn(),
    getBalanceMock: vi.fn(),
    dryRunTransactionBlockMock: vi.fn(),
    getGasStationAddressMock: vi.fn(() => '0xgasstation'),
    getGasStationKeypairMock: vi.fn<() => GasStationKeypairMock | null>(() => null),
    getStableLayerManagerKeypairMock: vi.fn<() => ManagerKeypairMock | null>(() => null),
    getStableLayerClientMock: vi.fn(),
    stableLayerBuildBurnTxMock: vi.fn(),
    stableLayerBuildClaimTxMock: vi.fn(),
    stableLayerBuildMintTxMock: vi.fn(),
    stableLayerGetConstantsMock: vi.fn(),
    stableLayerGetTotalSupplyByCoinTypeMock: vi.fn(),
    bucketBuildDepositToSavingPoolTransactionMock: vi.fn(),
    bucketBuildPSMSwapOutTransactionMock: vi.fn(),
    bucketGetConfigMock: vi.fn(),
    bucketGetUsdbCoinTypeMock: vi.fn(),
    bucketGetSavingPoolObjectInfoMock: vi.fn(),
    bucketGetUserAccountsMock: vi.fn(),
    releaseRewardsMock: vi.fn(),
    signSuiTransactionMock: vi.fn(),
    transactionAddMock: vi.fn((value) => value),
    transactionBuildMock: vi.fn(),
    transactionMoveCallMock: vi.fn(() => 'move-call-result'),
    transactionObjectMock: vi.fn((value) => value),
    transactionPureStringMock: vi.fn((value) => value),
    transactionMergeCoinsMock: vi.fn(),
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
      mergeCoins: transactionMergeCoinsMock,
      moveCall: transactionMoveCallMock,
      object: transactionObjectMock,
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

vi.mock('@/lib/stable-layer-manager', () => ({
  getStableLayerManagerKeypair: getStableLayerManagerKeypairMock,
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
    devInspectTransactionBlock: devInspectTransactionBlockMock,
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
  redisStore.set(
    `earn-preview:${previewToken}`,
    JSON.stringify({
      xUserId: 'x-user-1',
      action: 'claim',
      amount: '0',
      yieldSettlementMode: 'server_payout',
      expectedYieldUsdc: '0',
      expectedPrincipalUsdc: '0',
      ...payload,
    }),
  );
}

function stageAuthorization(previewToken: string, payload: Record<string, unknown>) {
  redisStore.set(
    `earn-authorization:${previewToken}`,
    JSON.stringify({
      action: 'withdraw',
      amount: '100',
      txBytesBase64: Buffer.from('tx-bytes').toString('base64'),
      walletId: 'wallet-id',
      storedPublicKey: 'stored-public-key',
      sponsored: false,
      ...payload,
    }),
  );
}

describe('stable-layer earn helpers', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    redisStore.clear();
    prismaMock.xUser.findUnique.mockReset();
    prismaMock.$transaction.mockReset();
    prismaMock.earnAccounting.upsert.mockReset();
    prismaMock.earnAccounting.findUnique.mockReset();
    prismaMock.earnGlobalState.upsert.mockReset();
    prismaMock.earnGlobalState.findUnique.mockReset();
    prismaMock.pendingEarn.upsert.mockReset();
    prismaMock.pendingEarn.findUnique.mockReset();
    prismaMock.pendingEarn.delete.mockReset();
    prismaMock.pendingEarn.deleteMany.mockReset();
    prismaMock.pendingEarnSettlement.create.mockReset();
    prismaMock.pendingEarnSettlement.findFirst.mockReset();
    prismaMock.pendingEarnSettlement.update.mockReset();
    executeTransactionBlockMock.mockReset();
    devInspectTransactionBlockMock.mockReset();
    getTransactionBlockMock.mockReset();
    getBalanceMock.mockReset();
    dryRunTransactionBlockMock.mockReset();
    getGasStationAddressMock.mockReset();
    getGasStationKeypairMock.mockReset();
    getStableLayerManagerKeypairMock.mockReset();
    getStableLayerClientMock.mockReset();
    stableLayerBuildBurnTxMock.mockReset();
    stableLayerBuildClaimTxMock.mockReset();
    stableLayerBuildMintTxMock.mockReset();
    stableLayerGetConstantsMock.mockReset();
    stableLayerGetTotalSupplyByCoinTypeMock.mockReset();
    bucketBuildDepositToSavingPoolTransactionMock.mockReset();
    bucketBuildPSMSwapOutTransactionMock.mockReset();
    bucketGetConfigMock.mockReset();
    bucketGetUsdbCoinTypeMock.mockReset();
    bucketGetSavingPoolObjectInfoMock.mockReset();
    bucketGetUserAccountsMock.mockReset();
    signSuiTransactionMock.mockReset();
    transactionAddMock.mockReset();
    transactionBuildMock.mockReset();
    transactionMoveCallMock.mockReset();
    transactionObjectMock.mockReset();
    transactionPureStringMock.mockReset();
    transactionMergeCoinsMock.mockReset();
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
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) => callback(prismaMock));
    prismaMock.pendingEarn.upsert.mockResolvedValue(undefined);
    prismaMock.pendingEarn.findUnique.mockResolvedValue(null);
    prismaMock.pendingEarn.delete.mockResolvedValue(undefined);
    prismaMock.pendingEarn.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.earnAccounting.findUnique.mockResolvedValue(null);
    prismaMock.earnAccounting.upsert.mockResolvedValue(undefined);
    prismaMock.earnGlobalState.findUnique.mockResolvedValue(null);
    prismaMock.earnGlobalState.upsert.mockResolvedValue(undefined);
    prismaMock.pendingEarnSettlement.create.mockImplementation(async (data: { data: Record<string, unknown> }) => ({
      id: 'settlement-id',
      xUserId: 'x-user-1',
      action: data.data.action,
      stableCoinType: data.data.stableCoinType,
      previewToken: data.data.previewToken,
      status: data.data.status,
      expectedYieldUsdc: BigInt(data.data.expectedYieldUsdc as bigint | string | number),
      expectedPrincipalUsdc: BigInt(data.data.expectedPrincipalUsdc as bigint | string | number),
      yieldTxDigest: data.data.yieldTxDigest ?? null,
      yieldTxBytesBase64: data.data.yieldTxBytesBase64 ?? null,
      yieldSignatures: data.data.yieldSignatures ?? [],
      principalTxDigest: data.data.principalTxDigest ?? null,
      principalTxBytesBase64: data.data.principalTxBytesBase64 ?? null,
      principalSignatures: data.data.principalSignatures ?? [],
      settlementSnapshot: data.data.settlementSnapshot,
      lastErrorMessage: null,
    }));
    prismaMock.pendingEarnSettlement.findFirst.mockResolvedValue(null);
    prismaMock.pendingEarnSettlement.update.mockResolvedValue(undefined);
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
    devInspectTransactionBlockMock.mockResolvedValue({
      effects: {
        status: {
          status: 'failure',
          error:
            'MoveAbort(MoveLocation { function_name: Some("err_sender_is_not_manager") }, 100) in command 5',
        },
      },
      error: 'ExecutionError: err_sender_is_not_manager',
      results: [
        {
          returnValues: [
            [
              [100, 0, 0, 0, 0, 0, 0, 0],
              'u64',
            ],
          ],
        },
      ],
    });
    getGasStationAddressMock.mockReturnValue('0xgasstation');
    getGasStationKeypairMock.mockReturnValue(null);
    getStableLayerManagerKeypairMock.mockReturnValue(null);
    stableLayerBuildBurnTxMock.mockResolvedValue('principal-usdc-coin');
    stableLayerBuildClaimTxMock.mockResolvedValue('reward-usdb-coin');
    stableLayerBuildMintTxMock.mockResolvedValue(undefined);
    stableLayerGetConstantsMock.mockReturnValue({
      SAVING_TYPE: '0xsaving',
      STABLE_LP_TYPE: '0xlp',
      STABLE_VAULT_FARM_PACKAGE_ID: '0xfarm-pkg',
      STABLE_VAULT_FARM: '0xfarm',
      USDC_TYPE: '0xusdc',
      YUSDB_TYPE: '0xyusdb',
      YIELD_VAULT: '0xyield-vault',
    });
    stableLayerGetTotalSupplyByCoinTypeMock.mockResolvedValue('500000');
    bucketBuildDepositToSavingPoolTransactionMock.mockResolvedValue(undefined);
    bucketBuildPSMSwapOutTransactionMock.mockResolvedValue('reward-usdc-coin');
    bucketGetConfigMock.mockResolvedValue({ FRAMEWORK_PACKAGE_ID: '0xfeed' });
    bucketGetUsdbCoinTypeMock.mockResolvedValue('0xusdb');
    bucketGetSavingPoolObjectInfoMock.mockResolvedValue({
      pool: {
        objectId: '0xsaving-pool',
      },
    });
    bucketGetUserAccountsMock.mockResolvedValue([]);
    releaseRewardsMock.mockResolvedValue(undefined);
    getStableLayerClientMock.mockResolvedValue({
      buildBurnTx: stableLayerBuildBurnTxMock,
      buildClaimTx: stableLayerBuildClaimTxMock,
      buildMintTx: stableLayerBuildMintTxMock,
      getConstants: stableLayerGetConstantsMock,
      getTotalSupplyByCoinType: stableLayerGetTotalSupplyByCoinTypeMock,
      releaseRewards: releaseRewardsMock,
      bucketClient: {
        buildDepositToSavingPoolTransaction: bucketBuildDepositToSavingPoolTransactionMock,
        buildPSMSwapOutTransaction: bucketBuildPSMSwapOutTransactionMock,
        getConfig: bucketGetConfigMock,
        getUsdbCoinType: bucketGetUsdbCoinTypeMock,
        getSavingPoolObjectInfo: bucketGetSavingPoolObjectInfoMock,
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

  it('returns a principal-only withdraw preview when service-side settlement is disabled', async () => {
    getBalanceMock.mockImplementation(async ({ owner, coinType }) => {
      if (owner === '0xsender' && coinType === '0xusdc') {
        return { totalBalance: '100000' };
      }
      if (owner === '0xsender' && coinType === '0xstable') {
        return { totalBalance: '500000' };
      }
      return { totalBalance: '0' };
    });
    devInspectTransactionBlockMock.mockResolvedValueOnce({
      effects: {
        status: {
          status: 'success',
        },
      },
      results: [
        {
          returnValues: [
            [
              [20, 0, 0, 0, 0, 0, 0, 0],
              'u64',
            ],
          ],
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
      yieldSettlementMode: 'disabled',
      action: 'withdraw',
      amount: '100',
      principalReceivesUsdc: '100',
      yieldReceivesUsdc: '0',
      userReceivesUsdc: '100',
      yieldSettlementSkipped: true,
    });

    expect(stableLayerBuildClaimTxMock).not.toHaveBeenCalled();
    expect(transactionSetGasOwnerMock).not.toHaveBeenCalled();
  });

  it('estimates accrued yield from the global farm claimable amount and reports disabled settlement mode', async () => {
    getBalanceMock.mockImplementation(async ({ owner, coinType }) => {
      if (owner === '0xsender' && coinType === '0xusdc') {
        return { totalBalance: '100000' };
      }
      if (owner === '0xsender' && coinType === '0xstable') {
        return { totalBalance: '500000' };
      }
      return { totalBalance: '0' };
    });
    stableLayerGetTotalSupplyByCoinTypeMock.mockResolvedValue('600000');
    devInspectTransactionBlockMock.mockResolvedValueOnce({
      effects: {
        status: {
          status: 'success',
        },
      },
      results: [
        {
          returnValues: [
            [
              [232, 3, 0, 0, 0, 0, 0, 0],
              'u64',
            ],
          ],
        },
      ],
    });

    await expect(getEarnSummary({
      xUserId: 'x-user-1',
    })).resolves.toEqual({
      walletReady: true,
      availableUsdc: '100000',
      depositedUsdc: '500000',
      claimableYieldUsdc: '750',
      claimableYieldReliable: true,
      yieldSettlementMode: 'disabled',
    });

    expect(stableLayerBuildClaimTxMock).not.toHaveBeenCalled();
    expect(transactionSetGasOwnerMock).not.toHaveBeenCalled();
  });

  it('rejects claim preview with a human error when service-side settlement is unavailable', async () => {
    devInspectTransactionBlockMock.mockResolvedValueOnce({
      effects: {
        status: {
          status: 'success',
        },
      },
      results: [
        {
          returnValues: [
            [
              [100, 0, 0, 0, 0, 0, 0, 0],
              'u64',
            ],
          ],
        },
      ],
    });

    await expect(previewEarnAction({
      xUserId: 'x-user-1',
      action: 'claim',
    })).rejects.toThrow('Yield settlement is temporarily unavailable');
  });

  it('rethrows on-chain claim settlement failures instead of downgrading them to pending', async () => {
    getStableLayerManagerKeypairMock.mockReturnValue({
      toSuiAddress: () => '0xmanager',
      signTransaction: vi.fn(async () => ({ signature: 'manager-signature' })),
    });
    stagePreview('preview-token', {
      xUserId: 'x-user-1',
      action: 'claim',
      amount: '0',
      yieldSettlementMode: 'server_payout',
      expectedYieldUsdc: '90',
      expectedPrincipalUsdc: '0',
    });
    devInspectTransactionBlockMock.mockResolvedValueOnce({
      effects: {
        status: {
          status: 'success',
        },
      },
      results: [
        {
          returnValues: [
            [
              [100, 0, 0, 0, 0, 0, 0, 0],
              'u64',
            ],
          ],
        },
      ],
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

    expect(prismaMock.pendingEarnSettlement.create).toHaveBeenCalled();
  });

  it('annotates gas coin execution failures during claim settlement', async () => {
    getStableLayerManagerKeypairMock.mockReturnValue({
      toSuiAddress: () => '0xmanager',
      signTransaction: vi.fn(async () => ({ signature: 'manager-signature' })),
    });
    stagePreview('preview-token', {
      xUserId: 'x-user-1',
      action: 'claim',
      amount: '0',
      yieldSettlementMode: 'server_payout',
      expectedYieldUsdc: '90',
      expectedPrincipalUsdc: '0',
    });
    devInspectTransactionBlockMock.mockResolvedValueOnce({
      effects: {
        status: {
          status: 'success',
        },
      },
      results: [
        {
          returnValues: [
            [
              [100, 0, 0, 0, 0, 0, 0, 0],
              'u64',
            ],
          ],
        },
      ],
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

  it('returns pending when claim settlement submission fails before on-chain status is known', async () => {
    getStableLayerManagerKeypairMock.mockReturnValue({
      toSuiAddress: () => '0xmanager',
      signTransaction: vi.fn(async () => ({ signature: 'manager-signature' })),
    });
    stagePreview('preview-token', {
      xUserId: 'x-user-1',
      action: 'claim',
      amount: '0',
      yieldSettlementMode: 'server_payout',
      expectedYieldUsdc: '90',
      expectedPrincipalUsdc: '0',
    });
    devInspectTransactionBlockMock.mockResolvedValueOnce({
      effects: {
        status: {
          status: 'success',
        },
      },
      results: [
        {
          returnValues: [
            [
              [100, 0, 0, 0, 0, 0, 0, 0],
              'u64',
            ],
          ],
        },
      ],
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

  it('settles claim yield server-side without requesting user authorization', async () => {
    getStableLayerManagerKeypairMock.mockReturnValue({
      toSuiAddress: () => '0xmanager',
      signTransaction: vi.fn(async () => ({ signature: 'manager-signature' })),
    });
    stagePreview('preview-token', {
      xUserId: 'x-user-1',
      action: 'claim',
      amount: '0',
      yieldSettlementMode: 'server_payout',
      expectedYieldUsdc: '90',
      expectedPrincipalUsdc: '0',
    });
    devInspectTransactionBlockMock.mockResolvedValueOnce({
      effects: {
        status: {
          status: 'success',
        },
      },
      results: [
        {
          returnValues: [
            [
              [100, 0, 0, 0, 0, 0, 0, 0],
              'u64',
            ],
          ],
        },
      ],
    });
    executeTransactionBlockMock.mockResolvedValue({
      digest: '0xyield',
      effects: {
        status: {
          status: 'success',
        },
      },
      objectChanges: [],
    });

    await expect(executeEarnAction({
      xUserId: 'x-user-1',
      privyUserId: 'privy-user',
      previewToken: 'preview-token',
    })).resolves.toEqual({
      status: 'confirmed',
      action: 'claim',
      txDigest: '0xyield',
    });

    expect(signSuiTransactionMock).not.toHaveBeenCalled();
    expect(prismaMock.pendingEarnSettlement.create).toHaveBeenCalled();
  });

  it('returns partial when withdraw settles yield but the principal leg fails', async () => {
    getStableLayerManagerKeypairMock.mockReturnValue({
      toSuiAddress: () => '0xmanager',
      signTransaction: vi.fn(async () => ({ signature: 'manager-signature' })),
    });
    stagePreview('preview-token', {
      xUserId: 'x-user-1',
      action: 'withdraw',
      amount: '100',
      yieldSettlementMode: 'server_payout',
      expectedYieldUsdc: '90',
      expectedPrincipalUsdc: '100',
    });
    stageAuthorization('preview-token', {
      action: 'withdraw',
      amount: '100',
    });
    devInspectTransactionBlockMock.mockResolvedValueOnce({
      effects: {
        status: {
          status: 'success',
        },
      },
      results: [
        {
          returnValues: [
            [
              [100, 0, 0, 0, 0, 0, 0, 0],
              'u64',
            ],
          ],
        },
      ],
    });
    executeTransactionBlockMock
      .mockResolvedValueOnce({
        digest: '0xyield',
        effects: {
          status: {
            status: 'success',
          },
        },
        objectChanges: [],
      })
      .mockResolvedValueOnce({
        digest: '0xprincipal',
        effects: {
          status: {
            status: 'failure',
            error: 'principal failed',
          },
        },
      });

    await expect(executeEarnAction({
      xUserId: 'x-user-1',
      privyUserId: 'privy-user',
      previewToken: 'preview-token',
      authorizationSignature: 'auth-signature',
    })).resolves.toEqual({
      status: 'partial',
      action: 'withdraw',
      txDigest: '0xyield',
      message:
        'Yield was settled, but principal withdraw did not complete. Your principal remains in Earn. Retry Withdraw to continue.',
    });

    expect(prismaMock.pendingEarnSettlement.update).toHaveBeenCalledWith({
      where: { id: 'settlement-id' },
      data: {
        status: 'partial',
        lastErrorMessage: 'principal failed',
      },
    });
  });
});
