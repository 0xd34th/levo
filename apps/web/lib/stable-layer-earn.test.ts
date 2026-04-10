import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));
import {
  EARN_RETAINED_ACCOUNT_ALIAS,
  extractCreatedEarnRetainedAccountId,
  findEarnRetainedAccountId,
  splitRetainedYieldUsdb,
} from './stable-layer-earn';

const RETAINED_ACCOUNT_ID = '0x00000000000000000000000000000000000000000000000000000000000000aa';
const OTHER_ACCOUNT_ID = '0x00000000000000000000000000000000000000000000000000000000000000bb';

describe('stable-layer earn helpers', () => {
  it('splits yield into user and retained portions with a strict 90/10 floor', () => {
    expect(splitRetainedYieldUsdb(0n)).toEqual({
      retainedUsdb: 0n,
      userClaimUsdb: 0n,
    });
    expect(splitRetainedYieldUsdb(19n)).toEqual({
      retainedUsdb: 2n,
      userClaimUsdb: 17n,
    });
    expect(splitRetainedYieldUsdb(100n)).toEqual({
      retainedUsdb: 10n,
      userClaimUsdb: 90n,
    });
  });

  it('finds the retained earn account by its reserved alias', () => {
    expect(findEarnRetainedAccountId([
      {
        alias: null,
        id: { id: '0xaaa' },
      },
      {
        alias: EARN_RETAINED_ACCOUNT_ALIAS,
        id: { id: RETAINED_ACCOUNT_ID },
      },
    ])).toBe(RETAINED_ACCOUNT_ID);
    expect(findEarnRetainedAccountId([])).toBeNull();
  });

  it('extracts the created retained account id from transaction object changes', () => {
    expect(extractCreatedEarnRetainedAccountId([
      {
        objectId: RETAINED_ACCOUNT_ID,
        objectType: '0xfeed::account::Account',
        type: 'created',
      },
      {
        objectId: OTHER_ACCOUNT_ID,
        objectType: '0xfeed::something::Else',
        type: 'created',
      },
    ], '0xfeed')).toBe(RETAINED_ACCOUNT_ID);
    expect(extractCreatedEarnRetainedAccountId([], '0xfeed')).toBeNull();
  });
});
