import { beforeEach, describe, expect, it, vi } from 'vitest';

const { discoverEarnRetainedAccountIdMock } = vi.hoisted(() => ({
  discoverEarnRetainedAccountIdMock: vi.fn(),
}));

vi.mock('@/lib/stable-layer-earn', () => ({
  discoverEarnRetainedAccountId: discoverEarnRetainedAccountIdMock,
}));

import { resolveEarnRetainedAccountTarget } from './config';

const OWNER_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000123';

describe('resolveEarnRetainedAccountTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('explains that a visible U/USDC balance is not the Agent Earn target account', async () => {
    discoverEarnRetainedAccountIdMock.mockResolvedValue(null);

    await expect(
      resolveEarnRetainedAccountTarget({
        xUserId: '12345',
        senderAddress: OWNER_ADDRESS,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      error:
        'No Agent Earn target account was found for this wallet. A visible U/USDC balance is not enough for mandates; Agent needs the retained Earn account object before it can create one.',
    });
  });
});
