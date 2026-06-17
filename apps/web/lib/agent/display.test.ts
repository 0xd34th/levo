import { describe, expect, it } from 'vitest';
import {
  actionTimelineLabel,
  describeSchedule,
  expiryLabel,
  parseCoinLimits,
  proposalSummary,
  scheduleLabel,
} from './display';
import { SUI_COIN_TYPE } from '@/lib/coins';

describe('agent display helpers', () => {
  it('formats caps and proposal amounts without raw bigint primary labels', () => {
    const summary = proposalSummary({
      spec: {
        agent: '0xagent',
        actions: 8,
        coinLimits: [
          {
            coinType: SUI_COIN_TYPE,
            perTxCap: '1000000000',
            periodCap: '5000000000',
          },
        ],
        periodMs: '86400000',
        allowedTargets: ['0x1234567890abcdef'],
        expiryMs: String(Date.UTC(2026, 4, 20)),
        metadata: { schedule: '0 9 * * *' },
      },
      plan: [
        {
          actionType: 8,
          coinType: SUI_COIN_TYPE,
          target: '0x1234567890abcdef',
          amount: '1000000000',
        },
      ],
    });

    expect(summary.perTxCap).toBe('1 SUI');
    expect(summary.periodCap).toBe('5 SUI');
    expect(summary.amount).toBe('1 SUI');
    expect(summary.schedule).toBe('0 9 * * *');
  });

  it('humanizes time-picker cron schedules and falls back to raw expressions', () => {
    expect(describeSchedule('0 9 * * *')).toBe('Daily at 09:00 UTC');
    expect(describeSchedule('30 14 * * 2')).toBe('Weekly on Tuesday at 14:30 UTC');
    expect(describeSchedule('*/15 * * * *')).toBe('*/15 * * * *');
  });

  it('derives schedule, expiry, cap usage, and timeline labels', () => {
    expect(scheduleLabel({ schedule: ' 0 9 * * * ' })).toBe('0 9 * * *');
    expect(expiryLabel(String(Date.UTC(2026, 4, 20)))).toContain('2026');
    expect(
      parseCoinLimits([
        {
          coinType: SUI_COIN_TYPE,
          perTxCap: '1000000000',
          periodCap: '10000000000',
          periodSpent: '2500000000',
        },
      ])[0].periodSpentRatio,
    ).toBe(25);
    expect(
      actionTimelineLabel({
        id: 'a',
        mandateId: 'm',
        actionType: 8,
        coinType: SUI_COIN_TYPE,
        amount: '1000000000',
        target: '0x1',
        status: 'CONFIRMED',
        txDigest: null,
        trigger: 'CHAT',
        sealApproved: true,
        errorReason: null,
        nonceAfter: null,
        commitBefore: null,
        commitAfter: null,
        createdAt: new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      }),
    ).toContain('1 SUI');
  });
});
