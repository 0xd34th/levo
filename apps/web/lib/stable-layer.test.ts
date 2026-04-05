import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-05T00:00:00Z'));

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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reuses cached clients until the TTL expires', async () => {
    const { getStableLayerClient } = await import('./stable-layer');

    await getStableLayerClient(' 0xSender ');
    await getStableLayerClient('0xsender');

    expect(initializeMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60_000 + 1);

    await getStableLayerClient('0xsender');

    expect(initializeMock).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest cached client when the cache exceeds its size cap', async () => {
    const { getStableLayerClient } = await import('./stable-layer');
    const firstAddress = `0x${'0'.repeat(64)}`;

    for (let index = 0; index < 201; index += 1) {
      const senderAddress = `0x${index.toString(16).padStart(64, '0')}`;
      await getStableLayerClient(senderAddress);
    }

    expect(initializeMock).toHaveBeenCalledTimes(201);

    await getStableLayerClient(firstAddress);

    expect(initializeMock).toHaveBeenCalledTimes(202);
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

  it('throws a clear error when stable-layer-sdk internals are unavailable', async () => {
    initializeMock.mockResolvedValueOnce({
      buildMintTx: buildMintTxMock,
    });

    const { buildBurnFromStableCoinTx } = await import('./stable-layer');

    await expect(buildBurnFromStableCoinTx({
      tx: {} as never,
      senderAddress: '0xsender',
      stableCoinType: '0xbrand::levo_usd::LEVO_USD',
      stableCoin: 'withdrawn-stable-coin' as never,
    })).rejects.toThrow(
      'stable-layer-sdk internals changed; apps/web/lib/stable-layer.ts currently supports 3.1.0',
    );
  });
});
