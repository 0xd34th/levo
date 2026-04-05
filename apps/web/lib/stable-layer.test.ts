import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  aggregatePricesMock,
  buildMintTxMock,
  checkWithdrawResponseMock,
  getBucketPSMPoolMock,
  getBucketSavingPoolMock,
  initializeMock,
  moveCallMock,
  objectMock,
  releaseRewardsMock,
  treasuryMock,
} = vi.hoisted(() => ({
  aggregatePricesMock: vi.fn(),
  buildMintTxMock: vi.fn(),
  checkWithdrawResponseMock: vi.fn(),
  getBucketPSMPoolMock: vi.fn(),
  getBucketSavingPoolMock: vi.fn(),
  initializeMock: vi.fn(),
  moveCallMock: vi.fn(),
  objectMock: vi.fn(),
  releaseRewardsMock: vi.fn(),
  treasuryMock: vi.fn(),
}));

vi.mock('stable-layer-sdk', () => ({
  StableLayerClient: {
    initialize: initializeMock,
    getConstants: vi.fn(() => ({
      STABLE_LAYER_PACKAGE_ID: 'stable-layer-package',
      STABLE_REGISTRY: 'stable-registry',
      USDC_TYPE: 'mainnet-usdc',
      STABLE_VAULT_FARM_PACKAGE_ID: 'stable-vault-farm-package',
      STABLE_LP_TYPE: 'lake-usdc',
      YUSDB_TYPE: 'yesusdb',
      SAVING_TYPE: 'susdb',
      STABLE_VAULT_FARM: 'stable-vault-farm',
      STABLE_VAULT: 'stable-vault',
      YIELD_VAULT: 'yield-vault',
    })),
  },
}));

describe('stable-layer helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    aggregatePricesMock.mockResolvedValue(['u-price']);
    getBucketPSMPoolMock.mockResolvedValue('psm-pool');
    getBucketSavingPoolMock.mockResolvedValue('saving-pool');
    treasuryMock.mockReturnValue('usdb-treasury');
    releaseRewardsMock.mockResolvedValue(undefined);
    buildMintTxMock.mockResolvedValue('stable-coin');

    initializeMock.mockResolvedValue({
      buildMintTx: buildMintTxMock,
      bucketClient: {
        treasury: treasuryMock,
        aggregatePrices: aggregatePricesMock,
        checkWithdrawResponse: checkWithdrawResponseMock,
      },
      getBucketPSMPool: getBucketPSMPoolMock,
      getBucketSavingPool: getBucketSavingPoolMock,
      releaseRewards: releaseRewardsMock,
    });

    objectMock.mockImplementation((value: string) => value);
    moveCallMock.mockReturnValueOnce('burn-request').mockReturnValueOnce('withdraw-response').mockReturnValueOnce('usdc-coin');
  });

  it('passes the Sui clock object to stable_vault_farm::pay during burn composition', async () => {
    const { buildBurnFromStableCoinTx } = await import('./stable-layer');

    const tx = {
      moveCall: moveCallMock,
      object: objectMock,
    } as const;

    const result = await buildBurnFromStableCoinTx({
      tx: tx as never,
      senderAddress: '0xsender',
      stableCoinType: '0xbrand::levo_usd::LEVO_USD',
      stableCoin: 'withdrawn-stable-coin' as never,
    });

    expect(moveCallMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: 'stable-vault-farm-package::stable_vault_farm::pay',
        arguments: [
          'stable-vault-farm',
          'burn-request',
          'stable-vault',
          'usdb-treasury',
          'psm-pool',
          'saving-pool',
          'yield-vault',
          'u-price',
          '0x6',
        ],
      }),
    );
    expect(checkWithdrawResponseMock).toHaveBeenCalledWith(tx, {
      lpType: 'susdb',
      withdrawResponse: 'withdraw-response',
    });
    expect(result).toBe('usdc-coin');
  });
});
