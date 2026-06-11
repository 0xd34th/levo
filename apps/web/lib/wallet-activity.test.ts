import { beforeEach, describe, expect, it } from 'vitest';
import { MAINNET_USDC_TYPE, SUI_COIN_TYPE } from './coins';
import {
  buildWalletActivityPage,
  decodeWalletActivityCursor,
  type WalletActivityLedgerRow,
  type WalletActivitySourcePage,
  type WalletActivityTransaction,
} from './wallet-activity';

const ADDRESS = `0x${'d'.repeat(64)}`;
const ALICE = `0x${'a'.repeat(64)}`;
const BOB = `0x${'b'.repeat(64)}`;
const CAROL = `0x${'c'.repeat(64)}`;
const LEVO_USD_TYPE = `0x${'1'.repeat(64)}::levo_usd::LEVO_USD`;
const RAW_COIN_TYPE = `0x${'f'.repeat(64)}::mystery::MYSTERY`;

function tx(
  digest: string,
  timestampMs: number,
  sender: string,
  balanceChanges: WalletActivityTransaction['balanceChanges'],
): WalletActivityTransaction {
  return {
    digest,
    timestampMs: String(timestampMs),
    transaction: {
      data: {
        sender,
      },
    },
    effects: {
      status: { status: 'success' },
    },
    balanceChanges,
  };
}

function owner(address: string) {
  return { AddressOwner: address };
}

function sourcePage(
  source: WalletActivitySourcePage['source'],
  data: WalletActivityTransaction[],
  nextCursor: string | null = null,
): WalletActivitySourcePage {
  return {
    source,
    data,
    hasNextPage: nextCursor !== null,
    nextCursor,
  };
}

describe('wallet activity mapper', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
    process.env.NEXT_PUBLIC_LEVO_USD_COIN_TYPE = LEVO_USD_TYPE;
  });

  it('builds a reverse-chronological address activity feed from FromAddress and ToAddress pages', () => {
    const outgoing = tx('outgoing-usdc', 4_000, ADDRESS, [
      { owner: owner(ADDRESS), coinType: MAINNET_USDC_TYPE, amount: '-2500000' },
      { owner: owner(ALICE), coinType: MAINNET_USDC_TYPE, amount: '2500000' },
      { owner: owner(ADDRESS), coinType: SUI_COIN_TYPE, amount: '-1000' },
    ]);
    const levoMixed = tx('levo-usdc-self', 3_000, ADDRESS, [
      { owner: owner(ADDRESS), coinType: LEVO_USD_TYPE, amount: '-1250000' },
      { owner: owner(ADDRESS), coinType: MAINNET_USDC_TYPE, amount: '1250000' },
      { owner: owner(ADDRESS), coinType: SUI_COIN_TYPE, amount: '-1000' },
    ]);
    const selfMixed = tx('self-mixed-usdc', 2_000, ADDRESS, [
      { owner: owner(ADDRESS), coinType: MAINNET_USDC_TYPE, amount: '-1000000' },
      { owner: owner(ADDRESS), coinType: MAINNET_USDC_TYPE, amount: '1000000' },
      { owner: owner(ADDRESS), coinType: SUI_COIN_TYPE, amount: '-1000' },
    ]);
    const incoming = tx('incoming-usdc', 1_000, BOB, [
      { owner: owner(BOB), coinType: MAINNET_USDC_TYPE, amount: '-500000' },
      { owner: owner(ADDRESS), coinType: MAINNET_USDC_TYPE, amount: '500000' },
    ]);
    const ledgerRows: WalletActivityLedgerRow[] = [
      {
        txDigest: 'outgoing-usdc',
        senderAddress: ADDRESS,
        recipientType: 'X_HANDLE',
        vaultAddress: ALICE,
        xUser: {
          username: 'alice',
          profilePicture: 'https://pbs.twimg.com/profile_images/alice.jpg',
        },
      },
    ];

    const page = buildWalletActivityPage({
      address: ADDRESS,
      limit: 10,
      fromPage: sourcePage('from', [outgoing, levoMixed, selfMixed]),
      toPage: sourcePage('to', [levoMixed, incoming]),
      ledgerRows,
    });

    expect(page.items.map((item) => item.txDigest)).toEqual([
      'outgoing-usdc',
      'levo-usdc-self',
      'self-mixed-usdc',
      'incoming-usdc',
    ]);
    expect(page.items.map((item) => item.direction)).toEqual([
      'outgoing',
      'mixed',
      'mixed',
      'incoming',
    ]);
    expect(page.items[0]).toMatchObject({
      amountLabel: '2.50 USDC',
      counterpartyLabel: '@alice',
      counterpartySubLabel: 'X recipient',
      counterpartyAvatarUrl: 'https://pbs.twimg.com/profile_images/alice.jpg',
    });
    expect(page.items[1]).toMatchObject({
      amountLabel: 'Mixed USDC',
      coinType: MAINNET_USDC_TYPE,
      counterpartyLabel: 'Self / contract',
    });
    expect(page.items[3]).toMatchObject({
      amountLabel: '0.50 USDC',
      counterpartyLabel: '0xbbbb...bbbb',
      counterpartySubLabel: 'Sender wallet',
    });
    expect(page.nextCursor).toBeNull();
  });

  it('keeps unsupported coins as raw activity instead of dropping them', () => {
    const rawIncoming = tx('raw-incoming', 1_000, CAROL, [
      { owner: owner(CAROL), coinType: RAW_COIN_TYPE, amount: '-777' },
      { owner: owner(ADDRESS), coinType: RAW_COIN_TYPE, amount: '777' },
    ]);

    const page = buildWalletActivityPage({
      address: ADDRESS,
      limit: 10,
      fromPage: sourcePage('from', []),
      toPage: sourcePage('to', [rawIncoming]),
      ledgerRows: [],
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      txDigest: 'raw-incoming',
      coinType: RAW_COIN_TYPE,
      amount: '777',
      amountLabel: '777 raw',
      unsupportedCoin: true,
      direction: 'incoming',
    });
  });

  it('encodes a combined cursor that advances only consumed source rows', () => {
    const newestFrom = tx('newest-from', 3_000, ADDRESS, [
      { owner: owner(ADDRESS), coinType: MAINNET_USDC_TYPE, amount: '-1000000' },
    ]);
    const newestTo = tx('newest-to', 2_000, BOB, [
      { owner: owner(ADDRESS), coinType: MAINNET_USDC_TYPE, amount: '1000000' },
    ]);
    const olderFrom = tx('older-from', 1_000, ADDRESS, [
      { owner: owner(ADDRESS), coinType: MAINNET_USDC_TYPE, amount: '-2000000' },
    ]);

    const page = buildWalletActivityPage({
      address: ADDRESS,
      limit: 2,
      fromPage: sourcePage('from', [newestFrom, olderFrom], 'from-rpc-cursor'),
      toPage: sourcePage('to', [newestTo], null),
      ledgerRows: [],
    });

    expect(page.items.map((item) => item.txDigest)).toEqual(['newest-from', 'newest-to']);
    expect(page.nextCursor).toBeTruthy();
    expect(decodeWalletActivityCursor(page.nextCursor!)).toEqual({
      from: 'newest-from',
      to: 'newest-to',
      seenDigests: ['newest-from', 'newest-to'],
    });
  });
});
