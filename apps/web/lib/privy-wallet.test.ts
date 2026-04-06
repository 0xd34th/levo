import { afterEach, describe, expect, it, vi } from 'vitest';
import { blake2b } from '@noble/hashes/blake2.js';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { toBase58, toHex } from '@mysten/sui/utils';
import type { PrivyClient } from '@privy-io/node';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import {
  getOrCreateSuiWallet,
  buildPrivyRawSignAuthorizationRequest,
  decodeStoredSuiPublicKey,
  signSuiTransaction,
} from './privy-wallet';
import { prisma } from '@/lib/prisma';

function toAsyncIterable<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

describe('decodeStoredSuiPublicKey', () => {
  const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(7));
  const publicKey = keypair.getPublicKey();
  const address = publicKey.toSuiAddress();

  it('accepts Privy hex-encoded Sui public keys', () => {
    const privyPublicKey = toHex(publicKey.toSuiBytes());

    const parsed = decodeStoredSuiPublicKey(privyPublicKey, address);

    expect(parsed.toRawBytes()).toEqual(publicKey.toRawBytes());
    expect(parsed.toSuiAddress()).toBe(address);
  });

  it('accepts legacy base58-encoded raw public keys', () => {
    const legacyPublicKey = toBase58(publicKey.toRawBytes());

    const parsed = decodeStoredSuiPublicKey(legacyPublicKey, address);

    expect(parsed.toRawBytes()).toEqual(publicKey.toRawBytes());
    expect(parsed.toSuiAddress()).toBe(address);
  });
});

describe('getOrCreateSuiWallet', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reconciles an incomplete stored binding from an existing Privy Sui wallet instead of creating a new one', async () => {
    const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(5));
    const publicKey = keypair.getPublicKey();
    const walletAddress = publicKey.toSuiAddress();
    const listMock = vi.fn().mockReturnValue(
      toAsyncIterable([
        {
          id: 'wallet-existing',
          address: walletAddress,
          public_key: toHex(publicKey.toSuiBytes()),
        },
      ]),
    );
    const createMock = vi.fn();

    vi.mocked(prisma.xUser.findUnique).mockResolvedValueOnce({
      privyWalletId: null,
      suiAddress: walletAddress,
      suiPublicKey: null,
    } as never);

    const privy = {
      wallets: () => ({
        list: listMock,
        create: createMock,
      }),
    } as unknown as PrivyClient;

    await expect(
      getOrCreateSuiWallet(privy, 'privy-user', '12345'),
    ).resolves.toEqual({
      privyWalletId: 'wallet-existing',
      suiAddress: walletAddress,
      suiPublicKey: toHex(publicKey.toSuiBytes()),
    });

    expect(listMock).toHaveBeenCalledWith({
      user_id: 'privy-user',
      chain_type: 'sui',
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(prisma.xUser.upsert).toHaveBeenCalledWith({
      where: { xUserId: '12345' },
      update: {
        privyUserId: 'privy-user',
        privyWalletId: 'wallet-existing',
        suiAddress: walletAddress,
        suiPublicKey: toHex(publicKey.toSuiBytes()),
      },
      create: {
        xUserId: '12345',
        username: '12345',
        privyUserId: 'privy-user',
        privyWalletId: 'wallet-existing',
        suiAddress: walletAddress,
        suiPublicKey: toHex(publicKey.toSuiBytes()),
      },
    });
  });

  it('rejects Privy wallet data that conflicts with a stored canonical Sui address', async () => {
    const listMock = vi.fn().mockReturnValue(toAsyncIterable([]));
    const createMock = vi.fn().mockResolvedValue({
      id: 'wallet-id',
      address: '0x3',
      public_key: '11111111111111111111111111111111',
    });
    vi.mocked(prisma.xUser.findUnique).mockResolvedValueOnce({
      privyWalletId: null,
      suiAddress: '0x0000000000000000000000000000000000000000000000000000000000000002',
      suiPublicKey: null,
    } as never);

    const privy = {
      wallets: () => ({
        list: listMock,
        create: createMock,
      }),
    } as unknown as PrivyClient;

    await expect(
      getOrCreateSuiWallet(privy, 'privy-user', '12345'),
    ).rejects.toThrow('Stored wallet binding conflicts with Privy wallet data.');
    expect(prisma.xUser.upsert).not.toHaveBeenCalled();
  });

  it('uses the Privy SDK idempotency key when creating a new wallet', async () => {
    const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(6));
    const publicKey = keypair.getPublicKey();
    const walletAddress = publicKey.toSuiAddress();
    const listMock = vi.fn().mockReturnValue(toAsyncIterable([]));
    const createMock = vi.fn().mockResolvedValue({
      id: 'wallet-id',
      address: walletAddress,
      public_key: toHex(publicKey.toSuiBytes()),
    });

    vi.mocked(prisma.xUser.findUnique).mockResolvedValueOnce(null as never);

    const privy = {
      wallets: () => ({
        list: listMock,
        create: createMock,
      }),
    } as unknown as PrivyClient;

    await getOrCreateSuiWallet(privy, 'privy-user', '12345');

    expect(createMock).toHaveBeenCalledWith({
      chain_type: 'sui',
      owner: { user_id: 'privy-user' },
      idempotency_key: 'sui-wallet-12345',
    });
  });
});

describe('signSuiTransaction', () => {
  const keypair = Ed25519Keypair.fromSecretKey(new Uint8Array(32).fill(9));
  const publicKey = keypair.getPublicKey();
  const storedPublicKey = toHex(publicKey.toSuiBytes());
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes the access token through authorization_context', async () => {
    const rawSignMock = vi.fn(async (_walletId: string, input: { params: { bytes: string } }) => {
      const intentMessage = Uint8Array.from(Buffer.from(input.params.bytes, 'hex'));
      const digest = blake2b(intentMessage, { dkLen: 32 });
      const signature = await keypair.sign(digest);

      return {
        signature: `0x${Buffer.from(signature).toString('hex')}`,
      };
    });

    const privy = {
      wallets: () => ({
        rawSign: rawSignMock,
      }),
    } as unknown as PrivyClient;

    const serializedSignature = await signSuiTransaction(
      privy,
      'wallet-id',
      storedPublicKey,
      new Uint8Array([1, 2, 3, 4]),
      { userJwts: 'privy-access-token' },
    );

    expect(serializedSignature.length).toBeGreaterThan(10);
    expect(rawSignMock).toHaveBeenCalledWith('wallet-id', {
      params: expect.objectContaining({
        encoding: 'hex',
        hash_function: 'blake2b256',
      }),
      authorization_context: {
        user_jwts: ['privy-access-token'],
      },
    });
  });

  it('passes provided authorization signatures through authorization_context', async () => {
    const rawSignMock = vi.fn(async (_walletId: string, input: { params: { bytes: string } }) => {
      const intentMessage = Uint8Array.from(Buffer.from(input.params.bytes, 'hex'));
      const digest = blake2b(intentMessage, { dkLen: 32 });
      const signature = await keypair.sign(digest);

      return {
        signature: `0x${Buffer.from(signature).toString('hex')}`,
      };
    });

    const privy = {
      wallets: () => ({
        rawSign: rawSignMock,
      }),
    } as unknown as PrivyClient;

    const serializedSignature = await signSuiTransaction(
      privy,
      'wallet-id',
      storedPublicKey,
      new Uint8Array([1, 2, 3, 4]),
      { signatures: ['privy-authorization-signature'] } as never,
    );

    expect(serializedSignature.length).toBeGreaterThan(10);
    expect(rawSignMock).toHaveBeenCalledWith('wallet-id', {
      params: expect.objectContaining({
        encoding: 'hex',
        hash_function: 'blake2b256',
      }),
      authorization_context: {
        signatures: ['privy-authorization-signature'],
      },
    });
  });

  it('retries with the next JWT when the first authorization JWT fails', async () => {
    const rawSignMock = vi.fn(async (_walletId: string, input: {
      params: { bytes: string };
      authorization_context?: { user_jwts?: string[] };
    }) => {
      const jwt = input.authorization_context?.user_jwts?.[0];
      if (jwt === 'stale-access-token') {
        throw new Error('JWT exchange failed');
      }

      const intentMessage = Uint8Array.from(Buffer.from(input.params.bytes, 'hex'));
      const digest = blake2b(intentMessage, { dkLen: 32 });
      const signature = await keypair.sign(digest);

      return {
        signature: `0x${Buffer.from(signature).toString('hex')}`,
      };
    });

    const privy = {
      wallets: () => ({
        rawSign: rawSignMock,
      }),
    } as unknown as PrivyClient;

    const serializedSignature = await signSuiTransaction(
      privy,
      'wallet-id',
      storedPublicKey,
      new Uint8Array([1, 2, 3, 4]),
      { userJwts: ['stale-access-token', 'fresh-identity-token'] },
    );

    expect(serializedSignature.length).toBeGreaterThan(10);
    expect(rawSignMock).toHaveBeenNthCalledWith(1, 'wallet-id', {
      params: expect.objectContaining({
        encoding: 'hex',
        hash_function: 'blake2b256',
      }),
      authorization_context: {
        user_jwts: ['stale-access-token'],
      },
    });
    expect(rawSignMock).toHaveBeenNthCalledWith(2, 'wallet-id', {
      params: expect.objectContaining({
        encoding: 'hex',
        hash_function: 'blake2b256',
      }),
      authorization_context: {
        user_jwts: ['fresh-identity-token'],
      },
    });
  });
});

describe('buildPrivyRawSignAuthorizationRequest', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  });

  it('matches the raw_sign REST body shape expected by Privy', () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'privy-app-id';

    const request = buildPrivyRawSignAuthorizationRequest(
      'wallet-id',
      Uint8Array.from([1, 2, 3, 4]),
    );

    expect(request).toEqual({
      version: 1,
      method: 'POST',
      url: 'https://api.privy.io/v1/wallets/wallet-id/raw_sign',
      body: {
        params: {
          bytes: '00000001020304',
          encoding: 'hex',
          hash_function: 'blake2b256',
        },
      },
      headers: {
        'privy-app-id': 'privy-app-id',
      },
    });
  });
});
