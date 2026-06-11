import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MAINNET_USDC_TYPE, SUI_COIN_TYPE } from '@/lib/coins';

const {
  buildPrivyRawSignAuthorizationRequestMock,
  buildSevenKSwapTransactionMock,
  clearSwapAuthorizationMock,
  executeTransactionBlockMock,
  findUniqueMock,
  getGasStationKeypairMock,
  getPrivyClientMock,
  getSuiClientMock,
  loadSwapAuthorizationMock,
  loadSwapQuoteMock,
  rateLimitMock,
  signSuiTransactionMock,
  stageSwapAuthorizationMock,
  verifyPrivyXAuthMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  buildPrivyRawSignAuthorizationRequestMock: vi.fn(),
  buildSevenKSwapTransactionMock: vi.fn(),
  clearSwapAuthorizationMock: vi.fn(),
  executeTransactionBlockMock: vi.fn(),
  findUniqueMock: vi.fn(),
  getGasStationKeypairMock: vi.fn(),
  getPrivyClientMock: vi.fn(),
  getSuiClientMock: vi.fn(),
  loadSwapAuthorizationMock: vi.fn(),
  loadSwapQuoteMock: vi.fn(),
  rateLimitMock: vi.fn(),
  signSuiTransactionMock: vi.fn(),
  stageSwapAuthorizationMock: vi.fn(),
  verifyPrivyXAuthMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
}));

vi.mock('@mysten/sui/transactions', () => ({
  TransactionDataBuilder: {
    getDigestFromBytes: vi.fn(() => 'swap-digest'),
  },
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
  rateLimit: rateLimitMock,
}));

vi.mock('@/lib/sui', () => ({
  getSuiClient: getSuiClientMock,
}));

vi.mock('@/lib/swap/seven-k', () => ({
  buildSevenKSwapTransaction: buildSevenKSwapTransactionMock,
}));

vi.mock('@/lib/swap/quote-store', () => ({
  clearSwapAuthorization: clearSwapAuthorizationMock,
  loadSwapAuthorization: loadSwapAuthorizationMock,
  loadSwapQuote: loadSwapQuoteMock,
  stageSwapAuthorization: stageSwapAuthorizationMock,
}));

import { POST } from './route';

describe('POST /api/v1/swap/execute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    verifyPrivyXAuthMock.mockResolvedValue({
      ok: true,
      identity: {
        privyUserId: 'privy-user',
        xUserId: '12345',
      },
    });
    findUniqueMock.mockResolvedValue({
      privyUserId: 'privy-user',
      privyWalletId: 'wallet-id',
      suiAddress: `0x${'0'.repeat(63)}2`,
      suiPublicKey: 'public-key',
    });
    loadSwapQuoteMock.mockResolvedValue({
      senderAddress: `0x${'0'.repeat(63)}2`,
      coinTypeIn: SUI_COIN_TYPE,
      coinTypeOut: MAINNET_USDC_TYPE,
      amountIn: '1000000000',
      quote: {
        id: 'quote-id',
        provider: 'bluefin7k',
        amountIn: '1000000000',
        amountOut: '2500000',
      },
    });
    buildSevenKSwapTransactionMock.mockResolvedValue(Uint8Array.from([1, 2, 3]));
    stageSwapAuthorizationMock.mockResolvedValue(undefined);
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
    loadSwapAuthorizationMock.mockResolvedValue({
      txBytesBase64: Buffer.from(Uint8Array.from([1, 2, 3])).toString('base64'),
      walletId: 'wallet-id',
      storedPublicKey: 'public-key',
    });
    getPrivyClientMock.mockReturnValue({});
    signSuiTransactionMock.mockResolvedValue('user-signature');
    getGasStationKeypairMock.mockReturnValue({
      toSuiAddress: vi.fn(() => '0xgasstation'),
      signTransaction: vi.fn().mockResolvedValue({ signature: 'gas-signature' }),
    });
    executeTransactionBlockMock.mockResolvedValue({
      digest: 'swap-digest',
      effects: { status: { status: 'success' } },
    });
    getSuiClientMock.mockReturnValue({
      executeTransactionBlock: executeTransactionBlockMock,
    });
  });

  it('returns an authorization challenge before signing or submitting', async () => {
    const res = await POST(new NextRequest('http://localhost/api/v1/swap/execute', {
      method: 'POST',
      body: JSON.stringify({ swapQuoteToken: 'swap-token' }),
    }));

    expect(buildSevenKSwapTransactionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAddress: `0x${'0'.repeat(63)}2`,
        coinTypeOut: MAINNET_USDC_TYPE,
        gasOwner: '0xgasstation',
      }),
    );
    expect(signSuiTransactionMock).not.toHaveBeenCalled();
    expect(executeTransactionBlockMock).not.toHaveBeenCalled();
    expect(stageSwapAuthorizationMock).toHaveBeenCalledWith(
      'swap-token',
      expect.any(Uint8Array),
      'wallet-id',
      'public-key',
      expect.any(Number),
    );
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

  it('signs with Privy and gas station after authorization, then submits the swap', async () => {
    const res = await POST(new NextRequest('http://localhost/api/v1/swap/execute', {
      method: 'POST',
      body: JSON.stringify({
        swapQuoteToken: 'swap-token',
        authorizationSignature: 'client-authorization-signature',
      }),
    }));

    expect(buildSevenKSwapTransactionMock).not.toHaveBeenCalled();
    expect(signSuiTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      'wallet-id',
      'public-key',
      expect.any(Uint8Array),
      { signatures: ['client-authorization-signature'] },
    );
    expect(executeTransactionBlockMock).toHaveBeenCalledWith({
      transactionBlock: expect.any(Uint8Array),
      signature: ['user-signature', 'gas-signature'],
      options: {
        showEffects: true,
        showBalanceChanges: true,
        showObjectChanges: true,
      },
    });
    expect(clearSwapAuthorizationMock).toHaveBeenCalledWith('swap-token');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'confirmed',
      txDigest: 'swap-digest',
    });
  });

  it('rejects expired swap quote tokens', async () => {
    loadSwapQuoteMock.mockResolvedValueOnce(null);

    const res = await POST(new NextRequest('http://localhost/api/v1/swap/execute', {
      method: 'POST',
      body: JSON.stringify({ swapQuoteToken: 'expired-token' }),
    }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid or expired swap quote' });
  });
});
