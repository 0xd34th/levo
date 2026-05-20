import { describe, expect, it } from 'vitest';
import { getEarnPreviewNotice } from './earn-preview-notice';

describe('getEarnPreviewNotice', () => {
  it('returns a neutral info notice when a withdraw has no yield to settle', () => {
    expect(getEarnPreviewNotice({
      action: 'withdraw',
      claimableYieldUsdc: '0',
      claimableYieldReliable: true,
      yieldSettlementSkipped: true,
    })).toEqual({
      tone: 'info',
      message: 'No yield is available to settle for this withdrawal.',
    });
  });

  it('returns a warning when yield settlement is skipped despite claimable yield', () => {
    expect(getEarnPreviewNotice({
      action: 'withdraw',
      claimableYieldUsdc: '100',
      claimableYieldReliable: true,
      yieldSettlementSkipped: true,
    })).toEqual({
      tone: 'warning',
      message:
        'Yield settlement is temporarily unavailable. This withdrawal will return your principal only. Accrued yield can be claimed separately once settlement resumes.',
    });
  });

  it('returns a warning when yield settlement is skipped and the claimable yield estimate is unavailable', () => {
    expect(getEarnPreviewNotice({
      action: 'withdraw',
      claimableYieldUsdc: '0',
      claimableYieldReliable: false,
      yieldSettlementSkipped: true,
    })).toEqual({
      tone: 'warning',
      message:
        'Yield settlement is temporarily unavailable. This withdrawal will return your principal only. Accrued yield can be claimed separately once settlement resumes.',
    });
  });

  it('returns no notice for non-withdraw actions or normal withdraw previews', () => {
    expect(getEarnPreviewNotice({
      action: 'claim',
      claimableYieldUsdc: '0',
      claimableYieldReliable: true,
      yieldSettlementSkipped: true,
    })).toBeNull();

    expect(getEarnPreviewNotice({
      action: 'withdraw',
      claimableYieldUsdc: '0',
      claimableYieldReliable: true,
      yieldSettlementSkipped: false,
    })).toBeNull();
  });
});
