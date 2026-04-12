type EarnAction = 'stake' | 'claim' | 'withdraw';

export interface EarnPreviewNoticeInput {
  action: EarnAction;
  claimableYieldUsdc: string;
  claimableYieldReliable?: boolean;
  yieldSettlementSkipped?: boolean;
}

export interface EarnPreviewNotice {
  tone: 'info' | 'warning';
  message: string;
}

const NO_YIELD_NOTICE = 'No yield is available to settle for this withdrawal.';
const YIELD_SETTLEMENT_WARNING =
  'Yield settlement is temporarily unavailable. This withdrawal will return your principal only. Accrued yield can be claimed separately once settlement resumes.';

export function getEarnPreviewNotice(
  preview: EarnPreviewNoticeInput,
): EarnPreviewNotice | null {
  if (preview.action !== 'withdraw' || !preview.yieldSettlementSkipped) {
    return null;
  }

  if (preview.claimableYieldReliable === true && BigInt(preview.claimableYieldUsdc) === 0n) {
    return {
      tone: 'info',
      message: NO_YIELD_NOTICE,
    };
  }

  return {
    tone: 'warning',
    message: YIELD_SETTLEMENT_WARNING,
  };
}
