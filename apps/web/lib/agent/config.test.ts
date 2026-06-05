import { describe, expect, it } from 'vitest';

import { resolveEarnMandateTarget } from './config';

const OWNER_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000123';

describe('resolveEarnMandateTarget', () => {
  it('uses the wallet Earn account address when no retained account object exists', async () => {
    await expect(
      resolveEarnMandateTarget({
        xUserId: '12345',
        senderAddress: OWNER_ADDRESS,
      }),
    ).resolves.toEqual({
      ok: true,
      targetAddress: OWNER_ADDRESS,
    });
  });

  it('normalizes the wallet Earn account target address', async () => {
    await expect(
      resolveEarnMandateTarget({
        xUserId: '12345',
        senderAddress: '0xABC',
      }),
    ).resolves.toEqual({
      ok: true,
      targetAddress: '0x0000000000000000000000000000000000000000000000000000000000000abc',
    });
  });
});
