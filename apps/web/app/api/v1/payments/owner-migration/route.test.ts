import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  acquireRedisLockMock,
  buildPrivyRawSignAuthorizationRequestMock,
  deriveVaultAddressMock,
  dryRunTransactionBlockMock,
  executeTransactionBlockMock,
  findUniqueMock,
  getGasStationKeypairMock,
  getObjectMock,
  getPrivyClientMock,
  listSuiWalletsForPrivyUserMock,
  rateLimitMock,
  redisDelMock,
  redisGetMock,
  redisSetMock,
  requestOwnerRecoveryAttestationMock,
  signSuiTransactionMock,
  txBuildMock,
  txMoveCallMock,
  txObjectMock,
  txPureAddressMock,
  txPureU64Mock,
  txPureVectorMock,
  txSetGasBudgetMock,
  txSetGasOwnerMock,
  updateMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_PACKAGE_ID = 'package-id';
  process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID = 'registry-id';
  process.env.ENCLAVE_REGISTRY_ID = 'enclave-id';

  return {
    acquireRedisLockMock: vi.fn(),
    buildPrivyRawSignAuthorizationRequestMock: vi.fn(),
    deriveVaultAddressMock: vi.fn(),
    dryRunTransactionBlockMock: vi.fn(),
    executeTransactionBlockMock: vi.fn(),
    findUniqueMock: vi.fn(),
    getGasStationKeypairMock: vi.fn(),
    getObjectMock: vi.fn(),
    getPrivyClientMock: vi.fn(),
    listSuiWalletsForPrivyUserMock: vi.fn(),
    rateLimitMock: vi.fn(),
    redisDelMock: vi.fn(),
    redisGetMock: vi.fn(),
    redisSetMock: vi.fn(),
    requestOwnerRecoveryAttestationMock: vi.fn(),
    signSuiTransactionMock: vi.fn(),
    txBuildMock: vi.fn(),
    txMoveCallMock: vi.fn(),
    txObjectMock: vi.fn(),
    txPureAddressMock: vi.fn(),
    txPureU64Mock: vi.fn(),
    txPureVectorMock: vi.fn(),
    txSetGasBudgetMock: vi.fn(),
    txSetGasOwnerMock: vi.fn(),
    updateMock: vi.fn(),
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
      build: txBuildMock,
    };
  }),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/nautilus', () => ({
  requestOwnerRecoveryAttestation: requestOwnerRecoveryAttestationMock,
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationKeypair: getGasStationKeypairMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

vi.mock('@/lib/privy-auth', () => ({
  getPrivyClient: getPrivyClientMock,
  verifyPrivyXAuth: verifyPrivyXAuthMock,
}));

vi.mock('@/lib/privy-wallet', () => ({
  buildPrivyRawSignAuthorizationRequest: buildPrivyRawSignAuthorizationRequestMock,
  listSuiWalletsForPrivyUser: listSuiWalletsForPrivyUserMock,
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
  getSuiClient: vi.fn(() => ({
    dryRunTransactionBlock: dryRunTransactionBlockMock,
    executeTransactionBlock: executeTransactionBlockMock,
    getObject: getObjectMock,
  })),
}));

import { POST } from './route';

describe('POST /api/v1/payments/owner-migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    verifySameOriginMock.mockReturnValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '1832743034540507136',
        username: 'tenxhunter',
        profilePictureUrl: null,
      },
    });
    acquireRedisLockMock.mockResolvedValue({ status: 'acquired', release: vi.fn() });
    rateLimitMock.mockResolvedValue({ allowed: true });
    findUniqueMock.mockResolvedValue({
      xUserId: '1832743034540507136',
      username: 'tenxhunter',
      privyUserId: 'privy-user',
      privyWalletId: 'old-wallet-id',
      suiAddress: '0xold',
      suiPublicKey: 'old-public-key',
    });
    getPrivyClientMock.mockReturnValue({});
    deriveVaultAddressMock.mockReturnValue('0xvault');
    listSuiWalletsForPrivyUserMock.mockResolvedValue([
      {
        privyWalletId: 'old-wallet-id',
        suiAddress: '0xold',
        suiPublicKey: 'old-public-key',
      },
      {
        privyWalletId: 'new-wallet-id',
        suiAddress: '0xnew',
        suiPublicKey: 'new-public-key',
      },
    ]);
    getObjectMock.mockResolvedValue({
      data: {
        objectId: '0xvault',
        content: {
          dataType: 'moveObject',
          fields: {
            owner: '0xold',
            recovery_counter: '7',
          },
        },
      },
    });
    requestOwnerRecoveryAttestationMock.mockResolvedValue({
      xUserId: 1832743034540507136n,
      vaultId: '0xvault',
      currentOwner: '0xold',
      newOwner: '0xnew',
      recoveryCounter: 7n,
      expiresAt: 999n,
      signature: new Uint8Array([1, 2, 3]),
    });
    getGasStationKeypairMock.mockReturnValue({
      toSuiAddress: () => '0xgas',
      signTransaction: vi.fn().mockResolvedValue({ signature: 'gas-signature' }),
    });
    txObjectMock.mockImplementation((value: string) => `object:${value}`);
    txPureAddressMock.mockImplementation((value: string) => `pure-address:${value}`);
    txPureU64Mock.mockImplementation((value: bigint | number | string) => `pure-u64:${String(value)}`);
    txPureVectorMock.mockImplementation((_type: string, value: number[]) => `pure-vector:${value.join(',')}`);
    txBuildMock.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    dryRunTransactionBlockMock.mockResolvedValue({
      effects: {
        status: { status: 'success' },
      },
    });
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue('OK');
    redisDelMock.mockResolvedValue(1);
    buildPrivyRawSignAuthorizationRequestMock.mockReturnValue({
      version: 1,
      method: 'POST',
      url: 'https://api.privy.io/v1/wallets/old-wallet-id/raw_sign',
      body: { params: { bytes: 'deadbeef', encoding: 'hex', hash_function: 'blake2b256' } },
      headers: { 'privy-app-id': 'privy-app-id' },
    });
    signSuiTransactionMock.mockResolvedValue('sender-signature');
    executeTransactionBlockMock.mockResolvedValue({
      digest: '0xdigest',
      effects: {
        status: { status: 'success' },
      },
    });
    updateMock.mockResolvedValue({});
  });

  it('stages an owner migration authorization request for the current owner wallet', async () => {
    const req = new NextRequest('http://localhost/api/v1/payments/owner-migration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(requestOwnerRecoveryAttestationMock).toHaveBeenCalledWith({
      xUserId: '1832743034540507136',
      vaultId: '0xvault',
      currentOwner: '0xold',
      newOwner: '0xnew',
      recoveryCounter: '7',
    });
    expect(txMoveCallMock).toHaveBeenCalledWith({
      target: 'package-id::x_vault::update_owner',
      arguments: ['object:registry-id', 'object:enclave-id', 'object:0xvault', 'pure-address:0xnew', 'pure-u64:999', 'pure-vector:1,2,3', 'object:0x6'],
    });
    expect(redisSetMock).toHaveBeenCalledWith(
      'pending-owner-migration-auth:1832743034540507136',
      JSON.stringify({
        txBytesBase64: Buffer.from(Uint8Array.from([1, 2, 3])).toString('base64'),
        walletId: 'old-wallet-id',
        storedPublicKey: 'old-public-key',
        targetWalletId: 'new-wallet-id',
        targetWalletAddress: '0xnew',
        targetWalletPublicKey: 'new-public-key',
        vaultAddress: '0xvault',
      }),
      'EX',
      120,
    );
    expect(buildPrivyRawSignAuthorizationRequestMock).toHaveBeenCalledWith(
      'old-wallet-id',
      Uint8Array.from([1, 2, 3]),
    );
    await expect(res.json()).resolves.toEqual({
      status: 'authorization_required',
      authorizationRequest: {
        version: 1,
        method: 'POST',
        url: 'https://api.privy.io/v1/wallets/old-wallet-id/raw_sign',
        body: { params: { bytes: 'deadbeef', encoding: 'hex', hash_function: 'blake2b256' } },
        headers: { 'privy-app-id': 'privy-app-id' },
      },
    });
  });

  it('executes update_owner and updates the stored wallet binding after authorization', async () => {
    redisGetMock.mockResolvedValueOnce(JSON.stringify({
      txBytesBase64: Buffer.from(Uint8Array.from([4, 5, 6])).toString('base64'),
      walletId: 'old-wallet-id',
      storedPublicKey: 'old-public-key',
      targetWalletId: 'new-wallet-id',
      targetWalletAddress: '0xnew',
      targetWalletPublicKey: 'new-public-key',
      vaultAddress: '0xvault',
    }));
    getObjectMock
      .mockResolvedValueOnce({
        data: {
          objectId: '0xvault',
          content: {
            dataType: 'moveObject',
            fields: {
              owner: '0xold',
              recovery_counter: '7',
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          objectId: '0xvault',
          content: {
            dataType: 'moveObject',
            fields: {
              owner: '0xnew',
              recovery_counter: '8',
            },
          },
        },
      });

    const req = new NextRequest('http://localhost/api/v1/payments/owner-migration', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authorizationSignature: 'client-auth-signature' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(signSuiTransactionMock).toHaveBeenCalledWith(
      {},
      'old-wallet-id',
      'old-public-key',
      Uint8Array.from([4, 5, 6]),
      { signatures: ['client-auth-signature'] },
    );
    expect(executeTransactionBlockMock).toHaveBeenCalledWith({
      transactionBlock: Uint8Array.from([4, 5, 6]),
      signature: ['sender-signature', 'gas-signature'],
      options: { showEffects: true },
    });
    expect(updateMock).toHaveBeenCalledWith({
      where: { xUserId: '1832743034540507136' },
      data: {
        privyWalletId: 'new-wallet-id',
        suiAddress: '0xnew',
        suiPublicKey: 'new-public-key',
      },
    });
    await expect(res.json()).resolves.toEqual({
      status: 'migrated',
      txDigest: '0xdigest',
      vaultAddress: '0xvault',
      ownerAddress: '0xnew',
    });
  });
});
