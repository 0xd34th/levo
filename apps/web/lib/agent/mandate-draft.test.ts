import { describe, expect, it } from 'vitest';
import { MAINNET_USDC_TYPE, SUI_COIN_TYPE } from '@/lib/coins';
import type { AgentMandateConfig } from './config';
import {
  buildCreateMandatePayload,
  createInitialAgentMandateDraftState,
  parseDisplayAmountToBaseUnits,
  updateDraftCadence,
} from './mandate-draft';

const TARGET = '0x000000000000000000000000000000000000000000000000000000000000be11';
const NOW = Date.UTC(2026, 4, 18, 0, 0, 0);

const CONFIG: AgentMandateConfig = {
  agentAddress: '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b',
  userAgentId: 'user-agent-id',
  agentLabel: 'Levo hosted agent',
  custodyMode: 'HOSTED',
  executionMode: 'hosted',
  network: 'testnet',
  templates: [
    {
      id: 'stablelayer-earn',
      label: 'StableLayer Earn',
      description: 'Earn target',
      targetAddress: TARGET,
    },
  ],
};

describe('mandate draft builder', () => {
  it.each([
    ['Deposit into Earn preset', 'deposit into Earn manually with conservative caps', 'deposit', 'manual'],
    ['Withdraw from Earn preset', 'withdraw from Earn manually with conservative caps', 'withdraw', 'manual'],
    ['Auto-harvest yield preset', 'auto-harvest claimable yield daily with conservative caps', 'harvest', 'daily'],
  ] as const)('infers %s intent as %s + %s', (_name, intent, action, cadence) => {
    const state = createInitialAgentMandateDraftState(intent, CONFIG.templates[0]);

    expect(state.action).toBe(action);
    expect(state.cadence).toBe(cadence);
  });

  it('prefills intent and builds a daily harvest payload with default caps and expiry', () => {
    const state = createInitialAgentMandateDraftState(
      'auto-harvest claimable yield daily with conservative caps',
      CONFIG.templates[0],
    );
    const result = buildCreateMandatePayload(state, CONFIG, NOW);

    expect(result.errors).toEqual([]);
    expect(result.payload).toMatchObject({
      spec: {
        agent: CONFIG.agentAddress,
        actions: 8,
        periodMs: '86400000',
        allowedTargets: [TARGET],
        expiryMs: String(NOW + 30 * 86_400_000),
        metadata: { schedule: '0 9 * * *', plannedRuns: '30' },
      },
      metadataName: 'Earn harvest - StableLayer Earn',
    });
    expect(result.payload?.plan).toHaveLength(30);
    expect(result.payload?.plan[0]).toMatchObject({
      actionType: 8,
      target: TARGET,
    });
    expect(result.payload?.spec.coinLimits[0]).toMatchObject({
      coinType: SUI_COIN_TYPE,
      perTxCap: '1000000000',
      periodCap: '10000000000',
    });
  });

  it('maps action, cadence, and expiry controls into the payload', () => {
    const state = {
      ...createInitialAgentMandateDraftState(null, CONFIG.templates[0]),
      action: 'withdraw' as const,
      expiryDays: '90' as const,
    };
    const weekly = updateDraftCadence(state, 'weekly');
    const result = buildCreateMandatePayload(weekly, CONFIG, NOW);

    expect(result.payload?.spec.actions).toBe(4);
    expect(result.payload?.spec.periodMs).toBe('604800000');
    expect(result.payload?.spec.metadata).toEqual({ schedule: '0 9 * * 1', plannedRuns: '13' });
    expect(result.payload?.spec.expiryMs).toBe(String(NOW + 90 * 86_400_000));
  });

  it('parses SUI and USDC display amounts into raw base units', () => {
    expect(parseDisplayAmountToBaseUnits('1.25', SUI_COIN_TYPE)).toBe(1_250_000_000n);
    expect(parseDisplayAmountToBaseUnits('1.23', MAINNET_USDC_TYPE)).toBe(1_230_000n);
    expect(parseDisplayAmountToBaseUnits('0', SUI_COIN_TYPE)).toBeNull();
    expect(parseDisplayAmountToBaseUnits('1.0000000001', SUI_COIN_TYPE)).toBeNull();
  });

  it('rejects invalid caps and invalid custom cron expressions', () => {
    const state = {
      ...createInitialAgentMandateDraftState(null, CONFIG.templates[0]),
      cadence: 'custom' as const,
      customCron: 'not-a-cron',
      perTxCap: '10',
      periodCap: '1',
    };
    const result = buildCreateMandatePayload(state, CONFIG, NOW);

    expect(result.payload).toBeNull();
    expect(result.errors).toContain('Schedule must be a valid cron expression.');
    expect(result.errors).toContain('Per-run cap must be less than or equal to the period cap.');
  });

  it('disables payload generation when agent configuration has an error', () => {
    const state = createInitialAgentMandateDraftState(null);
    const result = buildCreateMandatePayload(
      state,
      {
        agentAddress: CONFIG.agentAddress,
        userAgentId: CONFIG.userAgentId,
        agentLabel: CONFIG.agentLabel,
        custodyMode: 'HOSTED',
        executionMode: 'hosted',
        network: 'testnet',
        templates: [],
        error: 'Wallet binding has an invalid Sui address.',
      },
      NOW,
    );

    expect(result.payload).toBeNull();
    expect(result.errors[0]).toBe('Wallet binding has an invalid Sui address.');
  });

  it('blocks scheduled plans over the v1 64-run cap', () => {
    const state = {
      ...createInitialAgentMandateDraftState('daily harvest', CONFIG.templates[0]),
      expiryDays: '90' as const,
    };
    const result = buildCreateMandatePayload(state, CONFIG, NOW);

    expect(result.payload).toBeNull();
    expect(result.plannedRunCount).toBe(90);
    expect(result.errors).toContain('V1 supports at most 64 planned runs. Shorten expiry or lower frequency.');
  });
});
