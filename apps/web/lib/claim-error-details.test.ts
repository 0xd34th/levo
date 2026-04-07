import { describe, expect, it } from 'vitest';
import { parseClaimErrorPayload } from './claim-error-details';

describe('parseClaimErrorPayload', () => {
  it('parses structured StableLayer claim errors', () => {
    const parsed = parseClaimErrorPayload({
      error: 'Current vault balance is below StableLayer\'s redeemable minimum. Wait for more funds before claiming.',
      code: 'stable_layer_balance_split',
      debugId: 'debug-123',
      details: {
        stage: 'preflight',
        reason: 'StableLayer redeem hit a balance split failure during dry-run.',
        rawChainError: 'MoveAbort(...balance::split...)',
        totalStableLayerBalanceRaw: '20001',
        storedStableLayerBalanceRaw: '1',
        incomingStableLayerBalanceRaw: '20000',
        stableLayerWithdrawAmountRaw: '20000',
        incomingStableLayerCoinCount: 2,
      },
    });

    expect(parsed).toEqual({
      error: 'Current vault balance is below StableLayer\'s redeemable minimum. Wait for more funds before claiming.',
      code: 'stable_layer_balance_split',
      debugId: 'debug-123',
      details: {
        stage: 'preflight',
        reason: 'StableLayer redeem hit a balance split failure during dry-run.',
        rawChainError: 'MoveAbort(...balance::split...)',
        totalStableLayerBalanceRaw: '20001',
        storedStableLayerBalanceRaw: '1',
        incomingStableLayerBalanceRaw: '20000',
        stableLayerWithdrawAmountRaw: '20000',
        incomingStableLayerCoinCount: 2,
      },
    });
  });

  it('parses compatible payloads without structured details and rejects unknown shapes', () => {
    expect(parseClaimErrorPayload({ error: 'Claim failed' })).toEqual({
      error: 'Claim failed',
    });
    expect(parseClaimErrorPayload({ foo: 'bar' })).toBeNull();
  });
});
