import { beforeEach, describe, expect, it, vi } from 'vitest';

const MAINNET_USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';

const {
  deriveVaultAddress,
  findSuiWalletForPrivyUserByAddress,
  getAllBalances,
  getObject,
  getPrivyClient,
  paymentLedgerFindMany,
  paymentLedgerGroupBy,
  xUserFindMany,
  xUserFindUnique,
  xUserUpsert,
} = vi.hoisted(() => ({
  deriveVaultAddress: vi.fn(() => '0xvault'),
  findSuiWalletForPrivyUserByAddress: vi.fn(),
  getObject: vi.fn(),
  getAllBalances: vi.fn(),
  getPrivyClient: vi.fn(),
  xUserUpsert: vi.fn(),
  xUserFindUnique: vi.fn(),
  xUserFindMany: vi.fn(() => []),
  paymentLedgerFindMany: vi.fn(),
  paymentLedgerGroupBy: vi.fn(() => []),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    xUser: {
      findMany: xUserFindMany,
      findUnique: xUserFindUnique,
      upsert: xUserUpsert,
    },
    paymentLedger: {
      findMany: paymentLedgerFindMany,
      groupBy: paymentLedgerGroupBy,
    },
  },
}));

vi.mock('@/lib/sui', () => ({
  deriveVaultAddress,
  getSuiClient: () => ({
    getObject,
    getAllBalances,
  }),
}));

vi.mock('@/lib/privy-auth', () => ({
  getPrivyClient,
}));

vi.mock('@/lib/privy-wallet', () => ({
  findSuiWalletForPrivyUserByAddress,
}));

import { decodeTransactionHistoryCursor } from './transaction-history-cursor';
import { RECEIVED_CLAIM_STATUS_MODEL } from './received-dashboard-types';
import {
  buildIncomingPaymentsResponse,
  getIncomingPaymentsPage,
  getReceivedVaultSummary,
  persistReceivedDashboardXUser,
} from './received-dashboard';

describe('getReceivedVaultSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('derives claimed status from the vault object and maps on-chain balances', async () => {
    xUserFindUnique.mockResolvedValueOnce({
      suiAddress: '0xvault-owner',
      privyUserId: 'privy-user',
    });
    getObject.mockResolvedValueOnce({
      data: {
        objectId: '0xvault',
        content: {
          dataType: 'moveObject',
          fields: {
            owner: '0xvault-owner',
            recovery_counter: '0',
          },
        },
      },
    });
    getAllBalances.mockResolvedValueOnce([
      { coinType: '0x2::sui::SUI', totalBalance: '4200000000' },
      { coinType: '0xabc::test_usdc::TEST_USDC', totalBalance: '0' },
    ]);

    const result = await getReceivedVaultSummary('123', '0xregistry', 7);

    expect(deriveVaultAddress).toHaveBeenCalledWith('0xregistry', 123n);
    expect(getObject).toHaveBeenCalledWith({
      id: '0xvault',
      options: { showType: true, showContent: true },
    });
    expect(getAllBalances).toHaveBeenCalledWith({ owner: '0xvault' });
    expect(result).toEqual({
      derivationVersion: 7,
      vaultAddress: '0xvault',
      vaultExists: true,
      claimStatus: 'CLAIMED',
      claimAction: 'WITHDRAW',
      claimStatusModel: RECEIVED_CLAIM_STATUS_MODEL,
      pendingBalances: [
        {
          coinType: '0x2::sui::SUI',
          symbol: 'SUI',
          decimals: 9,
          amount: '4200000000',
        },
      ],
      recordedTotals: [],
    });
  });

  it('treats a missing vault object as unclaimed', async () => {
    xUserFindUnique.mockResolvedValueOnce({
      suiAddress: '0xwallet',
      privyUserId: 'privy-user',
    });
    getObject.mockResolvedValueOnce({
      error: { code: 'notExists' },
    });
    getAllBalances.mockResolvedValueOnce([]);

    const result = await getReceivedVaultSummary('456', '0xregistry');

    expect(result.vaultExists).toBe(false);
    expect(result.claimStatus).toBe('UNCLAIMED');
    expect(result.claimAction).toBe('NONE');
    expect(result.pendingBalances).toEqual([]);
  });

  it('treats a deleted vault object as previously claimed', async () => {
    xUserFindUnique.mockResolvedValueOnce({
      suiAddress: '0xwallet',
      privyUserId: 'privy-user',
    });
    getObject.mockResolvedValueOnce({
      error: { code: 'deleted' },
    });
    getAllBalances.mockResolvedValueOnce([]);

    const result = await getReceivedVaultSummary('456', '0xregistry');

    expect(result.vaultExists).toBe(false);
    expect(result.claimStatus).toBe('PREVIOUSLY_CLAIMED');
    expect(result.claimAction).toBe('NONE');
  });

  it('rejects malformed x user ids before deriving the vault address', async () => {
    await expect(getReceivedVaultSummary('not-a-number', '0xregistry')).rejects.toThrow(
      'Invalid X user id',
    );
    expect(deriveVaultAddress).not.toHaveBeenCalled();
  });

  it('normalizes mainnet LevoUSD balances to a user-facing USDC display payload', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUI_NETWORK', 'mainnet');
    vi.stubEnv('LEVO_USD_COIN_TYPE', '0xlevo::levo_usd::LEVO_USD');

    xUserFindUnique.mockResolvedValueOnce({
      suiAddress: '0xvault-owner',
      privyUserId: 'privy-user',
    });
    getObject.mockResolvedValueOnce({
      data: {
        objectId: '0xvault',
        content: {
          dataType: 'moveObject',
          fields: {
            owner: '0xvault-owner',
            recovery_counter: '0',
          },
        },
      },
    });
    getAllBalances.mockResolvedValueOnce([
      { coinType: '0xlevo::levo_usd::LEVO_USD', totalBalance: '1250000' },
    ]);

    const result = await getReceivedVaultSummary('123', '0xregistry', 7);

    expect(result.pendingBalances).toEqual([
      {
        coinType: MAINNET_USDC_TYPE,
        symbol: 'USDC',
        decimals: 6,
        amount: '1250000',
      },
    ]);
  });

  it('marks owner mismatches as repair-and-withdraw when the legacy owner wallet is still owned by the same Privy user', async () => {
    xUserFindUnique.mockResolvedValueOnce({
      suiAddress: '0xcanonical',
      privyUserId: 'privy-user',
    });
    getPrivyClient.mockReturnValue({});
    findSuiWalletForPrivyUserByAddress.mockResolvedValueOnce({
      privyWalletId: 'wallet-old',
      suiAddress: '0xlegacy',
      suiPublicKey: 'old-public-key',
    });
    getObject.mockResolvedValueOnce({
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
    getAllBalances.mockResolvedValueOnce([
      { coinType: '0x2::sui::SUI', totalBalance: '42' },
    ]);

    const result = await getReceivedVaultSummary('456', '0xregistry');

    expect(result.claimStatus).toBe('REPAIR_REQUIRED');
    expect(result.claimAction).toBe('REPAIR_AND_WITHDRAW');
  });

  it('treats a claimed vault with missing canonical wallet binding as repair-required', async () => {
    xUserFindUnique.mockResolvedValueOnce({
      suiAddress: null,
      privyUserId: 'privy-user',
    });
    getObject.mockResolvedValueOnce({
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
    getAllBalances.mockResolvedValueOnce([
      { coinType: '0x2::sui::SUI', totalBalance: '42' },
    ]);

    const result = await getReceivedVaultSummary('456', '0xregistry');

    expect(result.claimStatus).toBe('REPAIR_REQUIRED');
    expect(result.claimAction).toBe('NONE');
  });
});

describe('persistReceivedDashboardXUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips the upsert when a fresh matching x user row already exists', async () => {
    xUserFindUnique.mockResolvedValueOnce({
      derivationVersion: 7,
      updatedAt: new Date(),
      username: 'death_xyz',
      profilePicture: 'https://pbs.twimg.com/profile_images/pfp.png',
      isBlueVerified: true,
    });

    const derivationVersion = await persistReceivedDashboardXUser({
      xUserId: '123',
      username: 'death_xyz',
      profilePicture: 'https://pbs.twimg.com/profile_images/pfp.png',
      isBlueVerified: true,
    });

    expect(derivationVersion).toBe(7);
    expect(xUserUpsert).not.toHaveBeenCalled();
  });

  it('propagates read failures instead of silently falling back to the default derivation version', async () => {
    xUserFindUnique.mockRejectedValueOnce(new Error('db unavailable'));

    await expect(
      persistReceivedDashboardXUser({
        xUserId: '123',
        username: 'death_xyz',
        profilePicture: 'https://pbs.twimg.com/profile_images/pfp.png',
        isBlueVerified: true,
      }),
    ).rejects.toThrow('db unavailable');
    expect(xUserUpsert).not.toHaveBeenCalled();
  });

  it('falls back to the existing derivation version when the metadata write fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    xUserFindUnique.mockResolvedValueOnce({
      derivationVersion: 9,
      updatedAt: new Date('2026-03-10T00:00:00.000Z'),
      username: 'death_xyz',
      profilePicture: 'https://pbs.twimg.com/profile_images/old.png',
      isBlueVerified: false,
    });
    xUserUpsert.mockRejectedValueOnce(new Error('write unavailable'));

    const derivationVersion = await persistReceivedDashboardXUser({
      xUserId: '123',
      username: 'death_xyz',
      profilePicture: 'https://pbs.twimg.com/profile_images/new.png',
      isBlueVerified: true,
    });

    expect(derivationVersion).toBe(9);
    errorSpy.mockRestore();
  });

  it('sanitizes untrusted profile pictures before freshness checks and persistence', async () => {
    xUserFindUnique.mockResolvedValueOnce({
      derivationVersion: 11,
      updatedAt: new Date(),
      username: 'death_xyz',
      profilePicture: null,
      isBlueVerified: true,
    });

    const derivationVersion = await persistReceivedDashboardXUser({
      xUserId: '123',
      username: 'death_xyz',
      profilePicture: 'https://evil.twimg.com/pfp.png',
      isBlueVerified: true,
    });

    expect(derivationVersion).toBe(11);
    expect(xUserUpsert).not.toHaveBeenCalled();
  });
});

describe('getIncomingPaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('paginates recipient payments with the shared createdAt/id cursor shape', async () => {
    paymentLedgerFindMany.mockResolvedValueOnce([
      {
        id: 'ledger-3',
        txDigest: 'digest-3',
        senderAddress: '0xsender3',
        coinType: '0x2::sui::SUI',
        amount: 3000n,
        createdAt: new Date('2026-03-15T03:00:00.000Z'),
      },
      {
        id: 'ledger-2',
        txDigest: 'digest-2',
        senderAddress: '0xsender2',
        coinType: '0x2::sui::SUI',
        amount: 2000n,
        createdAt: new Date('2026-03-15T02:00:00.000Z'),
      },
      {
        id: 'ledger-1',
        txDigest: 'digest-1',
        senderAddress: '0xsender1',
        coinType: '0x2::sui::SUI',
        amount: 1000n,
        createdAt: new Date('2026-03-15T01:00:00.000Z'),
      },
    ]);
    xUserFindMany.mockResolvedValueOnce([
      {
        suiAddress: '0xsender3',
        username: 'sender3',
        profilePicture: 'https://pbs.twimg.com/profile_images/sender3.jpg',
      },
      {
        suiAddress: '0xsender2',
        username: 'sender2',
        profilePicture: null,
      },
    ] as never);

    const result = await getIncomingPaymentsPage(
      '123',
      2,
      {
        createdAt: '2026-03-15T04:00:00.000Z',
        id: 'cursor-ledger',
      },
    );

    expect(paymentLedgerFindMany).toHaveBeenCalledWith({
      where: {
        xUserId: '123',
        OR: [
          { createdAt: { lt: new Date('2026-03-15T04:00:00.000Z') } },
          {
            createdAt: new Date('2026-03-15T04:00:00.000Z'),
            id: { lt: 'cursor-ledger' },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
      select: {
        id: true,
        txDigest: true,
        senderAddress: true,
        coinType: true,
        amount: true,
        createdAt: true,
      },
    });

    expect(result.items).toEqual([
      {
        id: 'ledger-3',
        txDigest: 'digest-3',
        senderAddress: '0xsender3',
        sender: {
          username: 'sender3',
          profilePicture: 'https://pbs.twimg.com/profile_images/sender3.jpg',
        },
        coinType: '0x2::sui::SUI',
        symbol: 'SUI',
        decimals: 9,
        amount: '3000',
        createdAt: '2026-03-15T03:00:00.000Z',
      },
      {
        id: 'ledger-2',
        txDigest: 'digest-2',
        senderAddress: '0xsender2',
        sender: {
          username: 'sender2',
          profilePicture: null,
        },
        coinType: '0x2::sui::SUI',
        symbol: 'SUI',
        decimals: 9,
        amount: '2000',
        createdAt: '2026-03-15T02:00:00.000Z',
      },
    ]);
    expect(decodeTransactionHistoryCursor(result.nextCursor!)).toEqual({
      createdAt: '2026-03-15T02:00:00.000Z',
      id: 'ledger-2',
    });
  });

  it('skips unsupported payment rows and keeps scanning until the page is filled with displayable assets', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    paymentLedgerFindMany
      .mockResolvedValueOnce([
        {
          id: 'ledger-5',
          txDigest: 'digest-5',
          senderAddress: '0xsender5',
          coinType: '0x2::sui::SUI',
          amount: 5000n,
          createdAt: new Date('2026-03-15T05:00:00.000Z'),
        },
        {
          id: 'ledger-4',
          txDigest: 'digest-4',
          senderAddress: '0xsender4',
          coinType: '0xabc::other::OTHER',
          amount: 4000n,
          createdAt: new Date('2026-03-15T04:00:00.000Z'),
        },
        {
          id: 'ledger-3',
          txDigest: 'digest-3',
          senderAddress: '0xsender3',
          coinType: '0xabc::other::OTHER',
          amount: 3000n,
          createdAt: new Date('2026-03-15T03:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'ledger-2',
          txDigest: 'digest-2',
          senderAddress: '0xsender2',
          coinType: '0x2::sui::SUI',
          amount: 2000n,
          createdAt: new Date('2026-03-15T02:00:00.000Z'),
        },
        {
          id: 'ledger-1',
          txDigest: 'digest-1',
          senderAddress: '0xsender1',
          coinType: '0x2::sui::SUI',
          amount: 1000n,
          createdAt: new Date('2026-03-15T01:00:00.000Z'),
        },
      ]);
    xUserFindMany.mockResolvedValueOnce([]);

    const result = await getIncomingPaymentsPage('123', 2);

    expect(paymentLedgerFindMany).toHaveBeenNthCalledWith(1, {
      where: { xUserId: '123' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
      select: {
        id: true,
        txDigest: true,
        senderAddress: true,
        coinType: true,
        amount: true,
        createdAt: true,
      },
    });
    expect(paymentLedgerFindMany).toHaveBeenNthCalledWith(2, {
      where: {
        xUserId: '123',
        OR: [
          { createdAt: { lt: new Date('2026-03-15T03:00:00.000Z') } },
          {
            createdAt: new Date('2026-03-15T03:00:00.000Z'),
            id: { lt: 'ledger-3' },
          },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 2,
      select: {
        id: true,
        txDigest: true,
        senderAddress: true,
        coinType: true,
        amount: true,
        createdAt: true,
      },
    });
    expect(result.items.map((item) => item.id)).toEqual(['ledger-5', 'ledger-2']);
    expect(decodeTransactionHistoryCursor(result.nextCursor!)).toEqual({
      createdAt: '2026-03-15T02:00:00.000Z',
      id: 'ledger-2',
    });
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('stops scanning after the configured query cap and exposes a continuation cursor', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 10; i += 1) {
      const batchStart = 30 - i * 3;
      paymentLedgerFindMany.mockResolvedValueOnce([
        {
          id: `ledger-${batchStart}`,
          txDigest: `digest-${batchStart}`,
          senderAddress: `0xsender${batchStart}`,
          coinType: '0xabc::other::OTHER',
          amount: BigInt(batchStart),
          createdAt: new Date(`2026-03-15T${String(batchStart % 24).padStart(2, '0')}:00:00.000Z`),
        },
        {
          id: `ledger-${batchStart - 1}`,
          txDigest: `digest-${batchStart - 1}`,
          senderAddress: `0xsender${batchStart - 1}`,
          coinType: '0xabc::other::OTHER',
          amount: BigInt(batchStart - 1),
          createdAt: new Date(`2026-03-15T${String((batchStart - 1) % 24).padStart(2, '0')}:00:00.000Z`),
        },
        {
          id: `ledger-${batchStart - 2}`,
          txDigest: `digest-${batchStart - 2}`,
          senderAddress: `0xsender${batchStart - 2}`,
          coinType: '0xabc::other::OTHER',
          amount: BigInt(batchStart - 2),
          createdAt: new Date(`2026-03-15T${String((batchStart - 2) % 24).padStart(2, '0')}:00:00.000Z`),
        },
      ]);
    }

    const result = await getIncomingPaymentsPage('123', 2);

    expect(paymentLedgerFindMany).toHaveBeenCalledTimes(10);
    expect(result.items).toEqual([]);
    expect(decodeTransactionHistoryCursor(result.nextCursor!)).toEqual({
      createdAt: '2026-03-15T01:00:00.000Z',
      id: 'ledger-1',
    });
    expect(warnSpy).toHaveBeenCalledTimes(30);
    warnSpy.mockRestore();
  });
});

describe('buildIncomingPaymentsResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses a fresh vault summary across paginated requests for the same x user', async () => {
    getObject.mockResolvedValue({
      error: { code: 'notExists' },
    });
    getAllBalances.mockResolvedValue([]);
    paymentLedgerFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const userInfo = {
      xUserId: '999',
      username: 'cache_test',
      profilePicture: null,
      isBlueVerified: false,
    };

    await buildIncomingPaymentsResponse(userInfo, '0xcache', 20, null, 4);
    await buildIncomingPaymentsResponse(
      userInfo,
      '0xcache',
      20,
      {
        createdAt: '2026-03-15T04:00:00.000Z',
        id: 'cursor-ledger',
      },
      4,
    );

    expect(getObject).toHaveBeenCalledTimes(1);
    expect(getAllBalances).toHaveBeenCalledTimes(1);
    expect(paymentLedgerFindMany).toHaveBeenCalledTimes(2);
  });
});
