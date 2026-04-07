import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  acquireRedisLockMock,
  buildPrivyRawSignAuthorizationRequestMock,
  buildBurnFromStableCoinTxMock,
  deriveVaultAddressMock,
  findUniqueMock,
  getGasStationKeypairMock,
  getDynamicFieldObjectMock,
  getDynamicFieldsMock,
  getPrivyClientMock,
  redisDelMock,
  redisGetMock,
  redisSetMock,
  dryRunTransactionBlockMock,
  getSuiClientMock,
  requestAttestationMock,
  rateLimitMock,
  signSuiTransactionMock,
  txBuildMock,
  txSetGasBudgetMock,
  txSetGasOwnerMock,
  txMoveCallMock,
  txObjectMock,
  txPureAddressMock,
  txPureU64Mock,
  txPureVectorMock,
  txReceivingRefMock,
  txTransferObjectsMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_PACKAGE_ID = 'package-id';
  process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID = 'registry-id';
  process.env.ENCLAVE_REGISTRY_ID = 'enclave-id';

  return {
    acquireRedisLockMock: vi.fn(),
    buildPrivyRawSignAuthorizationRequestMock: vi.fn(),
    buildBurnFromStableCoinTxMock: vi.fn(),
    deriveVaultAddressMock: vi.fn(),
    dryRunTransactionBlockMock: vi.fn(),
    findUniqueMock: vi.fn(),
    getGasStationKeypairMock: vi.fn(),
    getDynamicFieldObjectMock: vi.fn(),
    getDynamicFieldsMock: vi.fn(),
    getPrivyClientMock: vi.fn(),
    redisDelMock: vi.fn(),
    redisGetMock: vi.fn(),
    redisSetMock: vi.fn(),
    getSuiClientMock: vi.fn(),
    requestAttestationMock: vi.fn(),
    rateLimitMock: vi.fn(),
    signSuiTransactionMock: vi.fn(),
    txBuildMock: vi.fn(),
    txSetGasBudgetMock: vi.fn(),
    txSetGasOwnerMock: vi.fn(),
    txMoveCallMock: vi.fn(),
    txObjectMock: vi.fn(),
    txPureAddressMock: vi.fn(),
    txPureU64Mock: vi.fn(),
    txPureVectorMock: vi.fn(),
    txReceivingRefMock: vi.fn(),
    txTransferObjectsMock: vi.fn(),
    verifyPrivyXAuthMock: vi.fn(),
    verifySameOriginMock: vi.fn(),
  };
});

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn().mockImplementation(function TransactionMock() {
    return {
      setSender: vi.fn(),
      setGasOwner: txSetGasOwnerMock,
      setGasBudget: txSetGasBudgetMock,
      moveCall: txMoveCallMock,
      object: txObjectMock,
      pure: {
        u64: txPureU64Mock,
        address: txPureAddressMock,
        vector: txPureVectorMock,
      },
      receivingRef: txReceivingRefMock,
      transferObjects: txTransferObjectsMock,
      build: txBuildMock,
    };
  }),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/nautilus', () => ({
  requestAttestation: requestAttestationMock,
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationKeypair: getGasStationKeypairMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock('@/lib/privy-auth', () => ({
  getPrivyClient: getPrivyClientMock,
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/privy-wallet', () => ({
  buildPrivyRawSignAuthorizationRequest: buildPrivyRawSignAuthorizationRequestMock,
  signSuiTransaction: signSuiTransactionMock,
}));

vi.mock('@/lib/rate-limit', () => ({
  getRedis: vi.fn(() => ({
    status: 'ready',
    get: redisGetMock,
    set: redisSetMock,
    del: redisDelMock,
  })),
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/redis-lock', () => ({
  acquireRedisLock: acquireRedisLockMock,
}));

vi.mock('@/lib/sui', () => ({
  deriveVaultAddress: deriveVaultAddressMock,
  getSuiClient: getSuiClientMock,
}));

vi.mock('@/lib/stable-layer', () => ({
  buildBurnFromStableCoinTx: buildBurnFromStableCoinTxMock,
}));

import { POST } from './route';

describe('POST /api/v1/payments/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'testnet';
    process.env.LEVO_USD_COIN_TYPE = '0xlevo::levo_usd::LEVO_USD';
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '12345',
        username: 'alice',
        profilePictureUrl: null,
      },
    });
    getPrivyClientMock.mockReturnValue({});
    deriveVaultAddressMock.mockReturnValue('0xvault');
    getGasStationKeypairMock.mockReturnValue(null);
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue('OK');
    redisDelMock.mockResolvedValue(1);
    getSuiClientMock.mockReturnValue({
      dryRunTransactionBlock: dryRunTransactionBlockMock,
      getObject: getDynamicFieldObjectMock,
      getDynamicFieldObject: getDynamicFieldObjectMock,
      getDynamicFields: getDynamicFieldsMock,
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: 'coin-1',
              version: '1',
              digest: 'digest-1',
              type: '0x2::coin::Coin<0x2::sui::SUI>',
              content: {
                dataType: 'moveObject',
                type: '0x2::coin::Coin<0x2::sui::SUI>',
                hasPublicTransfer: true,
                fields: {
                  balance: '1000',
                  id: { id: 'coin-1' },
                },
              },
            },
          },
        ],
        nextCursor: null,
        hasNextPage: false,
      }),
    });
    getDynamicFieldsMock.mockResolvedValue({
      data: [],
      nextCursor: null,
      hasNextPage: false,
    });
    getDynamicFieldObjectMock.mockResolvedValue({ data: null });
    dryRunTransactionBlockMock.mockResolvedValue({
      effects: {
        status: { status: 'success' },
      },
    });
    requestAttestationMock.mockResolvedValue({
      xUserId: 12345n,
      suiAddress: '0xwallet',
      nonce: 1n,
      expiresAt: 1_800_000_000_000n,
      signature: Uint8Array.from([1, 2, 3, 4]),
    });
    txMoveCallMock.mockReturnValue(['move-call-result']);
    txObjectMock.mockImplementation((value: string) => value);
    txPureU64Mock.mockImplementation((value: bigint | number | string) => value);
    txPureAddressMock.mockImplementation((value: string) => value);
    txPureVectorMock.mockImplementation((_type: string, value: number[]) => value);
    txReceivingRefMock.mockImplementation((value: unknown) => value);
    txBuildMock.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    buildPrivyRawSignAuthorizationRequestMock.mockReturnValue({
      version: 1,
      method: 'POST',
      url: 'https://api.privy.io/v1/wallets/wallet-id/raw_sign',
      body: {
        params: {
          bytes: '010203',
          encoding: 'hex',
          hash_function: 'blake2b256',
        },
      },
      headers: {
        'privy-app-id': 'privy-app-id',
      },
    });
    signSuiTransactionMock.mockResolvedValue('user-signature');
    acquireRedisLockMock.mockResolvedValue({
      status: 'acquired',
      release: vi.fn().mockResolvedValue(undefined),
    });
    buildBurnFromStableCoinTxMock.mockResolvedValue('burned-usdc-coin');
  });

  it('rejects claims when the embedded wallet has not been provisioned', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'No embedded wallet found. Please set up your wallet first.',
    });
  });

  it('rejects claims from Privy sessions that do not own the stored embedded wallet', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'different-privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'Wallet ownership could not be verified. Please set up your wallet first.',
    });
  });

  it('returns the existing 502 response shape when attestation fails', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    requestAttestationMock.mockRejectedValueOnce(new Error('signer unavailable'));

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to obtain attestation. Please try again.',
    });
  });

  it('builds a withdraw flow instead of claim_vault when the canonical wallet already owns the vault', async () => {
    getDynamicFieldObjectMock.mockResolvedValueOnce({
      data: {
        objectId: '0xvault',
        content: {
          dataType: 'moveObject',
          fields: {
            owner: '0xwallet',
            recovery_counter: '0',
          },
        },
      },
    });
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(requestAttestationMock).not.toHaveBeenCalled();
    expect(txMoveCallMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ target: 'package-id::x_vault::claim_vault' }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: 'authorization_required',
    });
  });

  it('blocks claims when the vault is owned by another wallet even if the old owner wallet is still known', async () => {
    getDynamicFieldObjectMock.mockResolvedValueOnce({
      data: {
        objectId: '0xvault',
        content: {
          dataType: 'moveObject',
          fields: {
            owner: '0xlegacy',
            recovery_counter: '2',
          },
        },
      },
    });
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-new',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key-new',
    });
    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(buildPrivyRawSignAuthorizationRequestMock).not.toHaveBeenCalled();
    expect(txMoveCallMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'package-id::x_vault::update_owner',
      }),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'This vault is currently controlled by a different wallet and cannot be claimed from this app.',
    });
  });

  it('blocks claims when the vault is owned by a wallet outside the current Privy wallet set', async () => {
    getDynamicFieldObjectMock.mockResolvedValueOnce({
      data: {
        objectId: '0xvault',
        content: {
          dataType: 'moveObject',
          fields: {
            owner: '0xlegacy',
            recovery_counter: '2',
          },
        },
      },
    });
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-new',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key-new',
    });
    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'This vault is currently controlled by a different wallet and cannot be claimed from this app.',
    });
  });

  it('uses the provided authorization signature when signing a claim', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    redisGetMock.mockResolvedValueOnce(JSON.stringify({
      txBytesBase64: Buffer.from(Uint8Array.from([1, 2, 3])).toString('base64'),
      walletId: 'wallet-id',
      storedPublicKey: 'public-key',
    }));
    signSuiTransactionMock.mockRejectedValueOnce(new Error('sign failed'));

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      body: JSON.stringify({
        authorizationSignature: 'client-authorization-signature',
      }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(signSuiTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      'wallet-id',
      'public-key',
      expect.any(Uint8Array),
      { signatures: ['client-authorization-signature'] },
    );
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to sign transaction',
    });
  });

  it('returns an authorization challenge before asking Privy to sign the claim transaction', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(buildPrivyRawSignAuthorizationRequestMock).toHaveBeenCalledWith(
      'wallet-id',
      expect.any(Uint8Array),
    );
    expect(signSuiTransactionMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'authorization_required',
      authorizationRequest: {
        version: 1,
        method: 'POST',
        url: 'https://api.privy.io/v1/wallets/wallet-id/raw_sign',
        body: {
          params: {
            bytes: '010203',
            encoding: 'hex',
            hash_function: 'blake2b256',
          },
        },
        headers: {
          'privy-app-id': 'privy-app-id',
        },
      },
    });
  });

  it('uses StableLayer burn composition for mainnet LevoUSD claims and passes the current registry ABI args', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    getSuiClientMock.mockReturnValueOnce({
      dryRunTransactionBlock: dryRunTransactionBlockMock,
      getObject: getDynamicFieldObjectMock,
      getDynamicFieldObject: getDynamicFieldObjectMock,
      getDynamicFields: getDynamicFieldsMock,
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: 'coin-1',
              version: '1',
              digest: 'digest-1',
              type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
              content: {
                dataType: 'moveObject',
                type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
                hasPublicTransfer: true,
                fields: {
                  balance: '10000',
                  id: { id: 'coin-1' },
                },
              },
            },
          },
        ],
        nextCursor: null,
        hasNextPage: false,
      }),
    });
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    getGasStationKeypairMock.mockReturnValueOnce({
      toSuiAddress: vi.fn().mockReturnValue('0xgas-station'),
    });
    txMoveCallMock
      .mockReturnValueOnce(['vault-object'])
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(['withdrawn-levo-coin']);

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(txMoveCallMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: 'package-id::x_vault::sweep_coin_to_vault',
        typeArguments: ['0xlevo::levo_usd::LEVO_USD'],
        arguments: [
          'registry-id',
          'vault-object',
          expect.objectContaining({
            objectId: 'coin-1',
            version: '1',
            digest: 'digest-1',
          }),
        ],
      }),
    );
    expect(txMoveCallMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        target: 'package-id::x_vault::withdraw',
        typeArguments: ['0xlevo::levo_usd::LEVO_USD'],
        arguments: ['registry-id', 'vault-object', 9999n],
      }),
    );
    expect(buildBurnFromStableCoinTxMock).toHaveBeenCalledWith({
      tx: expect.any(Object),
      senderAddress: '0xwallet',
      stableCoinType: '0xlevo::levo_usd::LEVO_USD',
      stableCoin: 'withdrawn-levo-coin',
    });
    expect(txSetGasOwnerMock).toHaveBeenCalledWith('0xgas-station');
    expect(txSetGasBudgetMock).toHaveBeenCalledWith(50_000_000);
    expect(dryRunTransactionBlockMock).toHaveBeenCalledWith({
      transactionBlock: Uint8Array.from([1, 2, 3]),
    });
    expect(txTransferObjectsMock).toHaveBeenCalledWith(['burned-usdc-coin'], '0xwallet');
    expect(txMoveCallMock).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        target: 'package-id::x_vault::transfer_vault',
        arguments: ['vault-object'],
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: 'authorization_required',
    });
  });

  it('uses the existing vault dust balance to avoid accumulating extra leftovers across claims', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    getSuiClientMock.mockReturnValueOnce({
      dryRunTransactionBlock: dryRunTransactionBlockMock,
      getObject: getDynamicFieldObjectMock,
      getDynamicFieldObject: getDynamicFieldObjectMock,
      getDynamicFields: getDynamicFieldsMock,
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: 'coin-1',
              version: '1',
              digest: 'digest-1',
              type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
              content: {
                dataType: 'moveObject',
                type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
                hasPublicTransfer: true,
                fields: {
                  balance: '10000',
                  id: { id: 'coin-1' },
                },
              },
            },
          },
        ],
        nextCursor: null,
        hasNextPage: false,
      }),
    });
    getDynamicFieldsMock.mockResolvedValueOnce({
      data: [
        {
          objectId: 'field-object',
          name: {
            type: 'package-id::x_vault::BalanceKey<0xlevo::levo_usd::LEVO_USD>',
            value: {},
          },
        },
      ],
      nextCursor: null,
      hasNextPage: false,
    });
    getDynamicFieldObjectMock
      .mockResolvedValueOnce({ error: { code: 'notExists' } })
      .mockResolvedValueOnce({
        data: {
          content: {
            dataType: 'moveObject',
            fields: {
              value: {
                fields: {
                  balance: '1',
                },
              },
            },
          },
        },
      });
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    txMoveCallMock
      .mockReturnValueOnce(['vault-object'])
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(['withdrawn-levo-coin']);

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(txMoveCallMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        target: 'package-id::x_vault::withdraw',
        typeArguments: ['0xlevo::levo_usd::LEVO_USD'],
        arguments: ['registry-id', 'vault-object', 10000n],
      }),
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: 'authorization_required',
    });
  });

  it('returns a redeemable-minimum error when only StableLayer dust remains in the vault', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    getSuiClientMock.mockReturnValueOnce({
      dryRunTransactionBlock: dryRunTransactionBlockMock,
      getObject: getDynamicFieldObjectMock,
      getDynamicFieldObject: getDynamicFieldObjectMock,
      getDynamicFields: getDynamicFieldsMock,
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [],
        nextCursor: null,
        hasNextPage: false,
      }),
    });
    getDynamicFieldsMock.mockResolvedValueOnce({
      data: [
        {
          objectId: 'field-object',
          name: {
            type: 'package-id::x_vault::BalanceKey<0xlevo::levo_usd::LEVO_USD>',
            value: {},
          },
        },
      ],
      nextCursor: null,
      hasNextPage: false,
    });
    getDynamicFieldObjectMock
      .mockResolvedValueOnce({ error: { code: 'notExists' } })
      .mockResolvedValueOnce({
        data: {
          content: {
            dataType: 'moveObject',
            fields: {
              value: {
                fields: {
                  balance: '1',
                },
              },
            },
          },
        },
      });
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(txMoveCallMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ target: 'package-id::x_vault::withdraw' }),
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Current vault balance is below StableLayer\'s redeemable minimum. Wait for more funds before claiming.',
    });
  });

  it('returns the redeemable-minimum error when tx.build hits a zero-padded balance::split MoveAbort', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    getSuiClientMock.mockReturnValueOnce({
      dryRunTransactionBlock: dryRunTransactionBlockMock,
      getObject: getDynamicFieldObjectMock,
      getDynamicFieldObject: getDynamicFieldObjectMock,
      getDynamicFields: getDynamicFieldsMock,
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: 'coin-1',
              version: '1',
              digest: 'digest-1',
              type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
              content: {
                dataType: 'moveObject',
                type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
                hasPublicTransfer: true,
                fields: {
                  balance: '10000',
                  id: { id: 'coin-1' },
                },
              },
            },
          },
        ],
        nextCursor: null,
        hasNextPage: false,
      }),
    });
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    txMoveCallMock
      .mockReturnValueOnce(['vault-object'])
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(['withdrawn-levo-coin']);
    txBuildMock.mockRejectedValueOnce(
      new Error(
        "Transaction resolution failed: MoveAbort in 18th command, abort code: 2, in '0x0000000000000000000000000000000000000000000000000000000000000002::balance::split' (instruction 10)",
      ),
    );

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Current vault balance is below StableLayer\'s redeemable minimum. Wait for more funds before claiming.',
    });
  });

  it('returns the redeemable-minimum error when preflight reports a MoveLocation balance split failure', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    getSuiClientMock.mockReturnValueOnce({
      dryRunTransactionBlock: dryRunTransactionBlockMock,
      getObject: getDynamicFieldObjectMock,
      getDynamicFieldObject: getDynamicFieldObjectMock,
      getDynamicFields: getDynamicFieldsMock,
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: 'coin-1',
              version: '1',
              digest: 'digest-1',
              type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
              content: {
                dataType: 'moveObject',
                type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
                hasPublicTransfer: true,
                fields: {
                  balance: '10000',
                  id: { id: 'coin-1' },
                },
              },
            },
          },
        ],
        nextCursor: null,
        hasNextPage: false,
      }),
    });
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    txMoveCallMock
      .mockReturnValueOnce(['vault-object'])
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(['withdrawn-levo-coin']);
    dryRunTransactionBlockMock.mockResolvedValueOnce({
      effects: {
        status: {
          status: 'failure',
          error: 'MoveAbort(MoveLocation { module: ModuleId { address: 0000000000000000000000000000000000000000000000000000000000000002, name: Identifier("balance") }, function: 7, instruction: 10, function_name: Some("split") }, 2) in command 16',
        },
      },
    });

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Current vault balance is below StableLayer\'s redeemable minimum. Wait for more funds before claiming.',
    });
  });

  it('returns a temporary unavailable error when StableLayer burn composition fails before tx.build', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    getSuiClientMock.mockReturnValueOnce({
      dryRunTransactionBlock: dryRunTransactionBlockMock,
      getObject: getDynamicFieldObjectMock,
      getDynamicFieldObject: getDynamicFieldObjectMock,
      getDynamicFields: getDynamicFieldsMock,
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: 'coin-1',
              version: '1',
              digest: 'digest-1',
              type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
              content: {
                dataType: 'moveObject',
                type: '0x2::coin::Coin<0xlevo::levo_usd::LEVO_USD>',
                hasPublicTransfer: true,
                fields: {
                  balance: '10000',
                  id: { id: 'coin-1' },
                },
              },
            },
          },
        ],
        nextCursor: null,
        hasNextPage: false,
      }),
    });
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    txMoveCallMock
      .mockReturnValueOnce(['vault-object'])
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(['withdrawn-levo-coin']);
    buildBurnFromStableCoinTxMock.mockRejectedValueOnce(new Error('rpc timeout'));

    const req = new NextRequest('http://localhost/api/v1/payments/claim', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(txBuildMock).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: 'Claims are temporarily unavailable. Please retry shortly.',
    });
  });
});
