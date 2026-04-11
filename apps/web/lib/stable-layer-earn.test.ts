import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  redisStore,
  prismaMock,
  executeTransactionBlockMock,
  getTransactionBlockMock,
  getGasStationAddressMock,
  signSuiTransactionMock,
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
    getGasStationAddressMock: vi.fn(() => '0xgasstation'),
    signSuiTransactionMock: vi.fn(),
  };
});

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: class {},
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
  getConfiguredLevoUsdCoinType: vi.fn(() => '0xstable'),
  getUserFacingUsdcCoinType: vi.fn(() => '0xusdc'),
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationKeypair: vi.fn(() => null),
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
  getStableLayerClient: vi.fn(),
}));

vi.mock('@/lib/sui', () => ({
  getSuiClient: vi.fn(() => ({
    executeTransactionBlock: executeTransactionBlockMock,
    getTransactionBlock: getTransactionBlockMock,
  })),
}));

import {
  EARN_RETAINED_ACCOUNT_ALIAS,
  executeEarnAction,
  extractCreatedEarnRetainedAccountId,
  findEarnRetainedAccountId,
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
    getGasStationAddressMock.mockReset();
    signSuiTransactionMock.mockReset();

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
    getGasStationAddressMock.mockReturnValue('0xgasstation');
    signSuiTransactionMock.mockResolvedValue('user-signature');
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
      'Earn transaction failed on-chain: No valid gas coins found for the transaction. Gas station address: 0xgasstation',
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
