import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  acquireRedisLockMock,
  buildPrivyRawSignAuthorizationRequestMock,
  deriveVaultAddressMock,
  findUniqueMock,
  getGasStationKeypairMock,
  getPrivyClientMock,
  redisDelMock,
  redisGetMock,
  redisSetMock,
  getSuiClientMock,
  requestAttestationMock,
  rateLimitMock,
  signSuiTransactionMock,
  txBuildMock,
  txMoveCallMock,
  txObjectMock,
  txPureAddressMock,
  txPureU64Mock,
  txPureVectorMock,
  txReceivingRefMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_PACKAGE_ID = 'package-id';
  process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID = 'registry-id';
  process.env.ENCLAVE_OBJECT_ID = 'enclave-id';

  return {
    acquireRedisLockMock: vi.fn(),
    buildPrivyRawSignAuthorizationRequestMock: vi.fn(),
    deriveVaultAddressMock: vi.fn(),
    findUniqueMock: vi.fn(),
    getGasStationKeypairMock: vi.fn(),
    getPrivyClientMock: vi.fn(),
    redisDelMock: vi.fn(),
    redisGetMock: vi.fn(),
    redisSetMock: vi.fn(),
    getSuiClientMock: vi.fn(),
    requestAttestationMock: vi.fn(),
    rateLimitMock: vi.fn(),
    signSuiTransactionMock: vi.fn(),
    txBuildMock: vi.fn(),
    txMoveCallMock: vi.fn(),
    txObjectMock: vi.fn(),
    txPureAddressMock: vi.fn(),
    txPureU64Mock: vi.fn(),
    txPureVectorMock: vi.fn(),
    txReceivingRefMock: vi.fn(),
    verifyPrivyXAuthMock: vi.fn(),
    verifySameOriginMock: vi.fn(),
  };
});

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn().mockImplementation(function TransactionMock() {
    return {
      setSender: vi.fn(),
      setGasOwner: vi.fn(),
      moveCall: txMoveCallMock,
      object: txObjectMock,
      pure: {
        u64: txPureU64Mock,
        address: txPureAddressMock,
        vector: txPureVectorMock,
      },
      receivingRef: txReceivingRefMock,
      transferObjects: vi.fn(),
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

import { POST } from './route';

describe('POST /api/v1/payments/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: 'coin-1',
              version: '1',
              digest: 'digest-1',
              type: '0x2::coin::Coin<0x2::sui::SUI>',
            },
          },
        ],
        nextCursor: null,
        hasNextPage: false,
      }),
    });
    requestAttestationMock.mockResolvedValue({
      xUserId: 12345n,
      suiAddress: '0xwallet',
      nonce: 1n,
      expiresAt: 1_800_000_000_000n,
      signature: Uint8Array.from([1, 2, 3, 4]),
      intentScope: 0,
      timestampMs: 1_700_000_000_000n,
      registryId: '0x0000000000000000000000000000000000000000000000000000000000000001',
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
});
