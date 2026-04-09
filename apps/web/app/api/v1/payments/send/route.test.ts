import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  buildPrivyRawSignAuthorizationRequestMock,
  buildMintIntoVaultTxMock,
  findFirstMock,
  findUniqueMock,
  getGasStationKeypairMock,
  getPrivyClientMock,
  redisDelMock,
  redisGetMock,
  redisSetMock,
  getSuiClientMock,
  rateLimitMock,
  signSuiTransactionMock,
  txAddMock,
  txBuildMock,
  verifyQuoteTokenMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  buildPrivyRawSignAuthorizationRequestMock: vi.fn(),
  buildMintIntoVaultTxMock: vi.fn(),
  findFirstMock: vi.fn(),
  findUniqueMock: vi.fn(),
  getGasStationKeypairMock: vi.fn(),
  getPrivyClientMock: vi.fn(),
  redisDelMock: vi.fn(),
  redisGetMock: vi.fn(),
  redisSetMock: vi.fn(),
  getSuiClientMock: vi.fn(),
  rateLimitMock: vi.fn(),
  signSuiTransactionMock: vi.fn(),
  txAddMock: vi.fn(),
  txBuildMock: vi.fn(),
  verifyQuoteTokenMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
}));

vi.mock('@mysten/sui/transactions', () => ({
  Transaction: vi.fn().mockImplementation(function TransactionMock() {
    return {
      setSender: vi.fn(),
      setGasOwner: vi.fn(),
      add: txAddMock,
      transferObjects: vi.fn(),
      build: txBuildMock,
    };
  }),
  TransactionDataBuilder: {
    getDigestFromBytes: vi.fn(() => 'staged-digest'),
  },
  coinWithBalance: vi.fn(() => 'coin-with-balance'),
}));

vi.mock('@/app/api/v1/payments/confirm/route', () => ({
  POST: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/gas-station', () => ({
  getGasStationKeypair: getGasStationKeypairMock,
}));

vi.mock('@/lib/hmac', () => ({
  verifyQuoteToken: verifyQuoteTokenMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findUnique: findUniqueMock,
    },
    paymentQuote: {
      findFirst: findFirstMock,
      updateMany: vi.fn(),
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

vi.mock('@/lib/sui', () => ({
  getSuiClient: getSuiClientMock,
}));

vi.mock('@/lib/stable-layer', () => ({
  buildMintIntoVaultTx: buildMintIntoVaultTxMock,
}));

import { POST } from './route';

describe('POST /api/v1/payments/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HMAC_SECRET = 'x'.repeat(64);
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
    getGasStationKeypairMock.mockReturnValue(null);
    redisGetMock.mockResolvedValue(null);
    redisSetMock.mockResolvedValue('OK');
    redisDelMock.mockResolvedValue(1);
    getSuiClientMock.mockReturnValue({});
    txAddMock.mockReturnValue('coin-object');
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
    findFirstMock.mockResolvedValue(null);
    verifyQuoteTokenMock.mockReturnValue({
      xUserId: '99999',
      derivationVersion: 1,
      vaultAddress: '0xvault',
      coinType: '0x2::sui::SUI',
      amount: '1000000',
      senderAddress: '0xwallet',
      nonce: 'nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    buildMintIntoVaultTxMock.mockResolvedValue(undefined);
  });

  it('rejects sends when no embedded wallet has been provisioned', async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({ quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'No embedded wallet found. Please set up your wallet first.',
    });
  });

  it('rejects sends from Privy sessions that do not own the stored embedded wallet', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'different-privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({ quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'Wallet ownership could not be verified. Please set up your wallet first.',
    });
  });

  it('hides the specific quote status when the quote is no longer pending', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    findFirstMock.mockResolvedValueOnce({
      status: 'FAILED',
      confirmedTxDigest: null,
    });

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({ quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Quote is no longer available',
    });
  });

  it('uses the provided authorization signature when signing a send', async () => {
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

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({
        quoteToken: 'quote-token',
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

  it('returns an authorization challenge before asking Privy to sign the send transaction', async () => {
    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({ quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
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

  it('builds mainnet USDC X-handle sends as direct transfers without StableLayer minting', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    delete process.env.LEVO_USD_COIN_TYPE;

    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    verifyQuoteTokenMock.mockReturnValueOnce({
      xUserId: '99999',
      derivationVersion: 1,
      vaultAddress: '0xvault',
      coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      amount: '1000000',
      senderAddress: '0xwallet',
      nonce: 'nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({ quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(buildMintIntoVaultTxMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: 'authorization_required',
    });
  });

  it('does not require StableLayer configuration for mainnet USDC X-handle sends', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    delete process.env.LEVO_USD_COIN_TYPE;

    findUniqueMock.mockResolvedValueOnce({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: '0xwallet',
      suiPublicKey: 'public-key',
    });
    verifyQuoteTokenMock.mockReturnValueOnce({
      xUserId: '99999',
      derivationVersion: 1,
      vaultAddress: '0xvault',
      coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
      amount: '1000000',
      senderAddress: '0xwallet',
      nonce: 'nonce',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });

    const req = new NextRequest('http://localhost/api/v1/payments/send', {
      method: 'POST',
      body: JSON.stringify({ quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
    });

    const res = await POST(req);

    expect(buildMintIntoVaultTxMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: 'authorization_required',
    });
  });
});
