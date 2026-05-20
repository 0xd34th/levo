import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrivyClient } from '@privy-io/node';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { ensureRecipientWallet } from './recipient-wallet';

function toAsyncIterable<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) {
        yield item;
      }
    },
  };
}

describe('ensureRecipientWallet', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates a canonical Privy user with a pregenerated Sui wallet when the X subject is unknown', async () => {
    vi.mocked(prisma.xUser.findUnique).mockResolvedValueOnce(null as never);

    const getByTwitterSubjectMock = vi.fn().mockRejectedValueOnce(
      Object.assign(new Error('not found'), { status: 404 }),
    );
    const createUserMock = vi.fn().mockResolvedValue({ id: 'privy-user-1' });
    const listWalletsMock = vi.fn().mockReturnValue(
      toAsyncIterable([
        {
          id: 'wallet-1',
          address: `0x${'1'.repeat(64)}`,
          public_key: '0x' + '11'.repeat(32),
        },
      ]),
    );

    const privy = {
      users: () => ({
        getByTwitterSubject: getByTwitterSubjectMock,
        create: createUserMock,
      }),
      wallets: () => ({
        list: listWalletsMock,
      }),
    } as unknown as PrivyClient;

    const result = await ensureRecipientWallet(privy, {
      xUserId: '12345',
      username: 'alice',
      profilePicture: 'https://pbs.twimg.com/profile_images/alice.jpg',
      isBlueVerified: true,
    });

    expect(getByTwitterSubjectMock).toHaveBeenCalledWith({ subject: '12345' });
    expect(createUserMock).toHaveBeenCalledWith({
      linked_accounts: [
        {
          type: 'twitter_oauth',
          subject: '12345',
          username: 'alice',
          name: 'alice',
          profile_picture_url: 'https://pbs.twimg.com/profile_images/alice.jpg',
        },
      ],
      wallets: [{ chain_type: 'sui' }],
    });
    expect(result).toEqual({
      xUserId: '12345',
      username: 'alice',
      profilePicture: 'https://pbs.twimg.com/profile_images/alice.jpg',
      isBlueVerified: true,
      privyUserId: 'privy-user-1',
      privyWalletId: 'wallet-1',
      suiAddress: `0x${'1'.repeat(64)}`,
      suiPublicKey: '0x' + '11'.repeat(32),
    });
    expect(prisma.xUser.upsert).toHaveBeenCalledWith({
      where: { xUserId: '12345' },
      update: {
        username: 'alice',
        profilePicture: 'https://pbs.twimg.com/profile_images/alice.jpg',
        isBlueVerified: true,
        privyUserId: 'privy-user-1',
        privyWalletId: 'wallet-1',
        suiAddress: `0x${'1'.repeat(64)}`,
        suiPublicKey: '0x' + '11'.repeat(32),
      },
      create: {
        xUserId: '12345',
        username: 'alice',
        profilePicture: 'https://pbs.twimg.com/profile_images/alice.jpg',
        isBlueVerified: true,
        privyUserId: 'privy-user-1',
        privyWalletId: 'wallet-1',
        suiAddress: `0x${'1'.repeat(64)}`,
        suiPublicKey: '0x' + '11'.repeat(32),
      },
    });
  });

  it('pregenerates a Sui wallet for an existing Privy user found by Twitter subject when no wallet is stored yet', async () => {
    vi.mocked(prisma.xUser.findUnique).mockResolvedValueOnce({
      username: 'alice',
      profilePicture: null,
      isBlueVerified: false,
      privyUserId: null,
      privyWalletId: null,
      suiAddress: null,
      suiPublicKey: null,
    } as never);

    const getByTwitterSubjectMock = vi.fn().mockResolvedValue({ id: 'privy-user-1' });
    const createUserMock = vi.fn();
    const pregenerateWalletsMock = vi.fn().mockResolvedValue({ id: 'privy-user-1' });
    const listWalletsMock = vi
      .fn()
      .mockReturnValueOnce(toAsyncIterable([]))
      .mockReturnValueOnce(
        toAsyncIterable([
          {
            id: 'wallet-1',
            address: `0x${'2'.repeat(64)}`,
            public_key: '0x' + '22'.repeat(32),
          },
        ]),
      );

    const privy = {
      users: () => ({
        getByTwitterSubject: getByTwitterSubjectMock,
        create: createUserMock,
        pregenerateWallets: pregenerateWalletsMock,
      }),
      wallets: () => ({
        list: listWalletsMock,
      }),
    } as unknown as PrivyClient;

    const result = await ensureRecipientWallet(privy, {
      xUserId: '12345',
      username: 'alice',
      profilePicture: null,
      isBlueVerified: false,
    });

    expect(getByTwitterSubjectMock).toHaveBeenCalledWith({ subject: '12345' });
    expect(createUserMock).not.toHaveBeenCalled();
    expect(pregenerateWalletsMock).toHaveBeenCalledWith('privy-user-1', {
      wallets: [{ chain_type: 'sui' }],
    });
    expect(result.suiAddress).toBe(`0x${'2'.repeat(64)}`);
    expect(result.privyWalletId).toBe('wallet-1');
  });
});
