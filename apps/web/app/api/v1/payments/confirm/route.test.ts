import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  rateLimitMock,
  verifyQuoteTokenMock,
  getTransactionBlockMock,
  getGasStationAddressMock,
  findUniqueMock,
  findFirstMock,
  updateManyMock,
  transactionMock,
  verifySameOriginMock,
} = vi.hoisted(() => ({
  rateLimitMock: vi.fn(),
  verifyQuoteTokenMock: vi.fn(),
  getTransactionBlockMock: vi.fn(),
  getGasStationAddressMock: vi.fn(() => '0xgasstation'),
  findUniqueMock: vi.fn(),
  findFirstMock: vi.fn(),
  updateManyMock: vi.fn(),
  transactionMock: vi.fn(),
  verifySameOriginMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    getClientIp: () => '127.0.0.1',
    invalidInputResponse: () =>
      new Response(JSON.stringify({ error: 'Invalid input' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    verifySameOrigin: verifySameOriginMock,
  };
});

vi.mock('@/lib/hmac', () => ({
  verifyQuoteToken: verifyQuoteTokenMock,
}));

vi.mock('@/lib/sui', () => ({
  getSuiClient: () => ({
    getTransactionBlock: getTransactionBlockMock,
  }),
}));

vi.mock('@/lib/gas-station', () => ({
  getGasStationAddress: getGasStationAddressMock,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    paymentLedger: {
      findUnique: findUniqueMock,
    },
    paymentQuote: {
      findFirst: findFirstMock,
      updateMany: updateManyMock,
    },
    $transaction: transactionMock,
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: rateLimitMock,
}));

import { POST } from './route';

const VALID_TX_DIGEST = '4'.repeat(44);

function makeQuotePayload() {
  return {
    xUserId: '12345',
    derivationVersion: 1,
    vaultAddress: '0xvault',
    coinType: '0x2::sui::SUI',
    amount: '1000000',
    senderAddress: '0xsender',
    nonce: 'test-nonce',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
  };
}

describe('POST /api/v1/payments/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.HMAC_SECRET = 'a'.repeat(64);
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'testnet';
    process.env.LEVO_USD_COIN_TYPE = '0xlevo::levo_usd::LEVO_USD';
    rateLimitMock.mockResolvedValue({ allowed: true });
    verifySameOriginMock.mockReturnValue({ ok: true });
    getGasStationAddressMock.mockReturnValue('0xgasstation');
  });

  it('rejects cross-origin confirmation requests before touching quote state', async () => {
    verifySameOriginMock.mockReturnValueOnce({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Invalid request origin' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(verifyQuoteTokenMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: 'Invalid request origin' });
  });

  it('rate limits repeated confirmations for the same quote token', async () => {
    rateLimitMock
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(rateLimitMock).toHaveBeenNthCalledWith(1, 'confirm:127.0.0.1', 60, 20);
    expect(rateLimitMock).toHaveBeenNthCalledWith(2, 'confirm:token:quote-token', 60, 5);
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(verifyQuoteTokenMock).not.toHaveBeenCalled();
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({ error: 'Rate limit exceeded' });
  });

  it('marks regenerated pending quotes confirmed when a matching ledger entry already exists', async () => {
    const quotePayload = makeQuotePayload();
    const txDigest = VALID_TX_DIGEST;

    verifyQuoteTokenMock.mockReturnValue(quotePayload);
    findUniqueMock.mockResolvedValue({
      txDigest,
      senderAddress: quotePayload.senderAddress,
      xUserId: quotePayload.xUserId,
      vaultAddress: quotePayload.vaultAddress,
      coinType: quotePayload.coinType,
      amount: BigInt(quotePayload.amount),
    });
    findFirstMock.mockResolvedValue(null);
    updateManyMock.mockResolvedValue({ count: 1 });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        hmacToken: 'quote-token',
        status: 'PENDING',
        senderAddress: quotePayload.senderAddress,
        xUserId: quotePayload.xUserId,
        vaultAddress: quotePayload.vaultAddress,
        coinType: quotePayload.coinType,
        amount: BigInt(quotePayload.amount),
      },
      data: {
        status: 'CONFIRMED',
        confirmedTxDigest: txDigest,
      },
    });
    await expect(res.json()).resolves.toEqual({
      status: 'confirmed',
      amount: quotePayload.amount,
      vaultAddress: quotePayload.vaultAddress,
      txDigest,
    });
  });

  it('syncs regenerated pending quotes after a ledger conflict resolves idempotently', async () => {
    const quotePayload = makeQuotePayload();
    const txDigest = VALID_TX_DIGEST;

    verifyQuoteTokenMock.mockReturnValue(quotePayload);
    findUniqueMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        txDigest,
        senderAddress: quotePayload.senderAddress,
        xUserId: quotePayload.xUserId,
        vaultAddress: quotePayload.vaultAddress,
        coinType: quotePayload.coinType,
        amount: BigInt(quotePayload.amount),
      });
    findFirstMock.mockResolvedValue(null);
    getTransactionBlockMock.mockResolvedValue({
      effects: { status: { status: 'success' } },
      transaction: { data: { sender: quotePayload.senderAddress } },
      objectChanges: [
        {
          type: 'created',
          owner: { AddressOwner: quotePayload.vaultAddress },
          objectType: `0x2::coin::Coin<${quotePayload.coinType}>`,
        },
      ],
      balanceChanges: [
        {
          owner: { AddressOwner: quotePayload.vaultAddress },
          coinType: quotePayload.coinType,
          amount: quotePayload.amount,
        },
      ],
    });
    transactionMock.mockRejectedValue({ code: 'P2002' });
    updateManyMock.mockResolvedValue({ count: 1 });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        hmacToken: 'quote-token',
        status: 'PENDING',
        senderAddress: quotePayload.senderAddress,
        xUserId: quotePayload.xUserId,
        vaultAddress: quotePayload.vaultAddress,
        coinType: quotePayload.coinType,
        amount: BigInt(quotePayload.amount),
      },
      data: {
        status: 'CONFIRMED',
        confirmedTxDigest: txDigest,
      },
    });
    await expect(res.json()).resolves.toEqual({
      status: 'confirmed',
      amount: quotePayload.amount,
      vaultAddress: quotePayload.vaultAddress,
      txDigest,
    });
  });

  it('returns a confirmed response with no-store headers on the first successful confirmation', async () => {
    const quotePayload = makeQuotePayload();
    const quoteUpdateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const ledgerCreateMock = vi.fn().mockResolvedValue({});

    verifyQuoteTokenMock.mockReturnValue(quotePayload);
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue(null);
    getTransactionBlockMock.mockResolvedValue({
      effects: { status: { status: 'success' } },
      transaction: { data: { sender: quotePayload.senderAddress } },
      objectChanges: [
        {
          type: 'created',
          owner: { AddressOwner: quotePayload.vaultAddress },
          objectType: `0x2::coin::Coin<${quotePayload.coinType}>`,
        },
      ],
      balanceChanges: [
        {
          owner: { AddressOwner: quotePayload.vaultAddress },
          coinType: quotePayload.coinType,
          amount: quotePayload.amount,
        },
      ],
    });
    transactionMock.mockImplementation(async (callback) =>
      callback({
        paymentQuote: { updateMany: quoteUpdateManyMock },
        paymentLedger: { create: ledgerCreateMock },
      }),
    );

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(quoteUpdateManyMock).toHaveBeenCalled();
    expect(ledgerCreateMock).toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe('no-store');
    await expect(res.json()).resolves.toEqual({
      status: 'confirmed',
      amount: quotePayload.amount,
      vaultAddress: quotePayload.vaultAddress,
      txDigest: VALID_TX_DIGEST,
    });
  });

  it('recovers an expired pending quote when the stored digest matches and the ledger already exists', async () => {
    const quotePayload = makeQuotePayload();
    const txDigest = VALID_TX_DIGEST;

    verifyQuoteTokenMock.mockReturnValue(null);
    findFirstMock.mockResolvedValue({
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000),
      amount: BigInt(quotePayload.amount),
      senderAddress: quotePayload.senderAddress,
      xUserId: quotePayload.xUserId,
      vaultAddress: quotePayload.vaultAddress,
      coinType: quotePayload.coinType,
      confirmedTxDigest: txDigest,
    });
    findUniqueMock.mockResolvedValue({
      txDigest,
      senderAddress: quotePayload.senderAddress,
      xUserId: quotePayload.xUserId,
      vaultAddress: quotePayload.vaultAddress,
      coinType: quotePayload.coinType,
      amount: BigInt(quotePayload.amount),
    });
    updateManyMock.mockResolvedValue({ count: 1 });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest, quoteToken: 'expired-quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        hmacToken: 'expired-quote-token',
        status: 'PENDING',
        senderAddress: quotePayload.senderAddress,
        xUserId: quotePayload.xUserId,
        vaultAddress: quotePayload.vaultAddress,
        coinType: quotePayload.coinType,
        amount: BigInt(quotePayload.amount),
      },
      data: {
        status: 'CONFIRMED',
        confirmedTxDigest: txDigest,
      },
    });
    await expect(res.json()).resolves.toEqual({
      status: 'confirmed',
      amount: quotePayload.amount,
      vaultAddress: quotePayload.vaultAddress,
      txDigest,
    });
  });

  it('rejects an expired pending quote when the submitted digest does not match the stored staged digest', async () => {
    const quotePayload = makeQuotePayload();

    verifyQuoteTokenMock.mockReturnValue(null);
    findFirstMock.mockResolvedValue({
      status: 'PENDING',
      expiresAt: new Date(Date.now() - 60_000),
      amount: BigInt(quotePayload.amount),
      senderAddress: quotePayload.senderAddress,
      xUserId: quotePayload.xUserId,
      vaultAddress: quotePayload.vaultAddress,
      coinType: quotePayload.coinType,
      confirmedTxDigest: '5'.repeat(44),
    });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'expired-quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid or expired quote token',
    });
  });

  it('marks quotes failed when the transaction failed on-chain', async () => {
    const quotePayload = makeQuotePayload();

    verifyQuoteTokenMock.mockReturnValue(quotePayload);
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue(null);
    getTransactionBlockMock.mockResolvedValue({
      effects: { status: { status: 'failure' } },
    });
    updateManyMock.mockResolvedValue({ count: 1 });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        hmacToken: 'quote-token',
        status: 'PENDING',
        confirmedTxDigest: VALID_TX_DIGEST,
      },
      data: { status: 'FAILED' },
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Transaction failed on-chain',
      txDigest: VALID_TX_DIGEST,
    });
  });

  it('includes the gas station address when the on-chain failure is missing sponsor gas coins', async () => {
    const quotePayload = makeQuotePayload();

    verifyQuoteTokenMock.mockReturnValue(quotePayload);
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue(null);
    getTransactionBlockMock.mockResolvedValue({
      effects: {
        status: {
          status: 'failure',
          error: 'No valid gas coins found for the transaction.',
        },
      },
    });
    updateManyMock.mockResolvedValue({ count: 1 });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'No valid gas coins found for the transaction. Gas station address: 0xgasstation. Check sponsor SUI balance/fragmentation with "pnpm --dir apps/web gas-station:status"; if needed, merge coins with "pnpm --dir apps/web gas-station:merge".',
      txDigest: VALID_TX_DIGEST,
    });
  });

  it('rejects confirmations when the on-chain sender does not match the quote sender', async () => {
    const quotePayload = makeQuotePayload();

    verifyQuoteTokenMock.mockReturnValue(quotePayload);
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue(null);
    getTransactionBlockMock.mockResolvedValue({
      effects: { status: { status: 'success' } },
      transaction: { data: { sender: '0xsomeone-else' } },
    });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Transaction sender does not match quote',
    });
  });

  it('rejects confirmations when the on-chain amount does not match the quote', async () => {
    const quotePayload = makeQuotePayload();

    verifyQuoteTokenMock.mockReturnValue(quotePayload);
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue(null);
    getTransactionBlockMock.mockResolvedValue({
      effects: { status: { status: 'success' } },
      transaction: { data: { sender: quotePayload.senderAddress } },
      objectChanges: [
        {
          type: 'created',
          owner: { AddressOwner: quotePayload.vaultAddress },
          objectType: `0x2::coin::Coin<${quotePayload.coinType}>`,
        },
      ],
      balanceChanges: [
        {
          owner: { AddressOwner: quotePayload.vaultAddress },
          coinType: quotePayload.coinType,
          amount: '999999',
        },
      ],
    });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Amount mismatch',
      expected: quotePayload.amount,
      actual: '999999',
    });
  });

  it('rejects confirmations when no matching vault balance change is present', async () => {
    const quotePayload = makeQuotePayload();

    verifyQuoteTokenMock.mockReturnValue(quotePayload);
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue(null);
    getTransactionBlockMock.mockResolvedValue({
      effects: { status: { status: 'success' } },
      transaction: { data: { sender: quotePayload.senderAddress } },
      objectChanges: [
        {
          type: 'created',
          owner: { AddressOwner: quotePayload.vaultAddress },
          objectType: `0x2::coin::Coin<${quotePayload.coinType}>`,
        },
      ],
      balanceChanges: [],
    });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'No matching balance change found for vault',
    });
  });

  it('rejects malformed short transaction digests before calling the RPC', async () => {
    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: '4'.repeat(32), quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(getTransactionBlockMock).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid input' });
  });

  it('accepts mainnet USDC direct-wallet settlement for X-handle quotes', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';

    const quotePayload = {
      ...makeQuotePayload(),
      coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    };
    const quoteUpdateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const ledgerCreateMock = vi.fn().mockResolvedValue({});

    verifyQuoteTokenMock.mockReturnValue(quotePayload);
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue(null);
    getTransactionBlockMock.mockResolvedValue({
      effects: { status: { status: 'success' } },
      transaction: { data: { sender: quotePayload.senderAddress } },
      objectChanges: [
        {
          type: 'created',
          owner: { AddressOwner: quotePayload.vaultAddress },
          objectType: `0x2::coin::Coin<${quotePayload.coinType}>`,
        },
      ],
      balanceChanges: [
        {
          owner: { AddressOwner: quotePayload.vaultAddress },
          coinType: quotePayload.coinType,
          amount: quotePayload.amount,
        },
      ],
    });
    transactionMock.mockImplementation(async (callback: (client: unknown) => Promise<void>) => {
      await callback({
        paymentQuote: {
          updateMany: quoteUpdateManyMock,
        },
        paymentLedger: {
          create: ledgerCreateMock,
        },
      });
    });

    const req = new NextRequest('http://localhost/api/v1/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ txDigest: VALID_TX_DIGEST, quoteToken: 'quote-token' }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'confirmed',
      amount: quotePayload.amount,
      vaultAddress: quotePayload.vaultAddress,
      txDigest: VALID_TX_DIGEST,
    });
    expect(quoteUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          coinType: quotePayload.coinType,
        }),
      }),
    );
    expect(ledgerCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          coinType: quotePayload.coinType,
        }),
      }),
    );
  });
});
