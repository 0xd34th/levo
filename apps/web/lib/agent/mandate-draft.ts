import { getCoinDecimals, SUI_COIN_TYPE } from '@/lib/coins';
import { nextCronRun } from './cron-util';
import type { AgentMandateConfig, AgentMandateTemplate } from './config';
import type { CreateMandatePayload } from './client';

export type AgentMandateAction = 'deposit' | 'withdraw' | 'harvest';
export type AgentMandateCadence = 'manual' | 'daily' | 'weekly' | 'custom';

export interface AgentMandateDraftState {
  action: AgentMandateAction;
  cadence: AgentMandateCadence;
  amount: string;
  perTxCap: string;
  periodCap: string;
  expiryDays: '30' | '90' | '365';
  coinType: string;
  templateId: AgentMandateTemplate['id'];
  customCron: string;
  periodMs: string;
  rawAmount: string;
  rawPerTxCap: string;
  rawPeriodCap: string;
}

export interface AgentMandateDraftBuildResult {
  payload: CreateMandatePayload | null;
  errors: string[];
  plannedRunCount: number;
}

const ACTION_BITS: Record<AgentMandateAction, number> = {
  deposit: 2,
  withdraw: 4,
  harvest: 8,
};

const ACTION_NAMES: Record<AgentMandateAction, string> = {
  deposit: 'Earn deposit',
  withdraw: 'Earn withdraw',
  harvest: 'Earn harvest',
};

const DAILY_CRON = '0 9 * * *';
export const MAX_PLANNED_RUNS = 64;

const CADENCE_SCHEDULES: Record<Exclude<AgentMandateCadence, 'custom'>, string | null> = {
  manual: null,
  daily: DAILY_CRON,
  weekly: '0 9 * * 1',
};

const CADENCE_PERIOD_MS: Record<AgentMandateCadence, string> = {
  manual: '86400000',
  daily: '86400000',
  weekly: '604800000',
  custom: '86400000',
};

export function inferMandateActionFromIntent(intent?: string | null): AgentMandateAction {
  const normalized = intent?.toLowerCase() ?? '';
  if (/\b(deposit|stake|supply|add)\b/.test(normalized)) return 'deposit';
  if (/\b(withdraw|redeem|unstake|remove)\b/.test(normalized)) return 'withdraw';
  return 'harvest';
}

export function inferMandateCadenceFromIntent(intent?: string | null): AgentMandateCadence {
  const normalized = intent?.toLowerCase() ?? '';
  if (/\bweekly|week\b/.test(normalized)) return 'weekly';
  if (/\bdaily|day|every morning|9am|9 am\b/.test(normalized)) return 'daily';
  if (/\bmanual|on demand|one[- ]?time\b/.test(normalized)) return 'manual';
  return 'daily';
}

export function createInitialAgentMandateDraftState(
  intent?: string | null,
  template?: AgentMandateTemplate,
): AgentMandateDraftState {
  const amount = '1';
  const cadence = inferMandateCadenceFromIntent(intent);
  return {
    action: inferMandateActionFromIntent(intent),
    cadence,
    amount,
    perTxCap: amount,
    periodCap: multiplyDecimalString(amount, 10),
    expiryDays: '30',
    // Agent flows run on Sui testnet (see lib/agent/sui-client.ts), where the
    // mainnet USDC package does not exist. SUI resolves on every network, so the
    // create-mandate transaction can be checked/built on testnet.
    coinType: SUI_COIN_TYPE,
    templateId: template?.id ?? 'stablelayer-earn',
    customCron: DAILY_CRON,
    periodMs: CADENCE_PERIOD_MS[cadence],
    rawAmount: '',
    rawPerTxCap: '',
    rawPeriodCap: '',
  };
}

export function updateDraftCadence(
  state: AgentMandateDraftState,
  cadence: AgentMandateCadence,
): AgentMandateDraftState {
  return {
    ...state,
    cadence,
    periodMs: CADENCE_PERIOD_MS[cadence],
    customCron: cadence === 'custom' ? state.customCron || DAILY_CRON : state.customCron,
  };
}

export function updateDraftAmount(
  state: AgentMandateDraftState,
  amount: string,
): AgentMandateDraftState {
  return {
    ...state,
    amount,
    perTxCap: amount,
    periodCap: multiplyDecimalString(amount, 10),
    rawAmount: '',
    rawPerTxCap: '',
    rawPeriodCap: '',
  };
}

export function buildCreateMandatePayload(
  state: AgentMandateDraftState,
  config: AgentMandateConfig,
  nowMs = Date.now(),
): AgentMandateDraftBuildResult {
  const errors: string[] = [];
  const template = config.templates.find((t) => t.id === state.templateId);
  if (config.error) errors.push(config.error);
  if (!config.agentAddress) errors.push('No active external agent is configured.');
  if (!template) errors.push('StableLayer Earn target is not configured.');

  const amount = parseDisplayAmountToBaseUnitsWithOverride(
    state.amount,
    state.rawAmount,
    state.coinType,
    'Amount',
    errors,
  );
  const perTxCap = parseDisplayAmountToBaseUnitsWithOverride(
    state.perTxCap,
    state.rawPerTxCap,
    state.coinType,
    'Per-run cap',
    errors,
  );
  const periodCap = parseDisplayAmountToBaseUnitsWithOverride(
    state.periodCap,
    state.rawPeriodCap,
    state.coinType,
    'Period cap',
    errors,
  );
  const periodMs = parsePositiveInteger(state.periodMs, 'Period', errors);
  const expiryDays = Number.parseInt(state.expiryDays, 10);
  const schedule = scheduleForState(state, errors);
  const expiryMsBigint = BigInt(nowMs + expiryDays * 86_400_000);
  const plannedRunCount = plannedRunsForState(state, nowMs, Number(expiryMsBigint), schedule, errors);

  if (perTxCap !== null && periodCap !== null && perTxCap > periodCap) {
    errors.push('Per-run cap must be less than or equal to the period cap.');
  }
  if (amount !== null && perTxCap !== null && amount > perTxCap) {
    errors.push('Amount must be less than or equal to the per-run cap.');
  }

  if (errors.length > 0 || !template || amount === null || perTxCap === null || periodCap === null || periodMs === null) {
    return { payload: null, errors, plannedRunCount };
  }

  const action = ACTION_BITS[state.action];
  const expiryMs = expiryMsBigint.toString();
  const plan = Array.from({ length: plannedRunCount }, () => ({
    actionType: action,
    coinType: state.coinType,
    target: template.targetAddress,
    amount: amount.toString(),
  }));

  return {
    payload: {
      spec: {
        agent: config.agentAddress,
        actions: action,
        coinLimits: [
          {
            coinType: state.coinType,
            perTxCap: perTxCap.toString(),
            periodCap: periodCap.toString(),
          },
        ],
        periodMs: periodMs.toString(),
        allowedTargets: [template.targetAddress],
        expiryMs,
        metadata: schedule
          ? { schedule, plannedRuns: String(plannedRunCount) }
          : { plannedRuns: String(plannedRunCount) },
      },
      plan,
      metadataName: `${ACTION_NAMES[state.action]} - ${template.label}`,
    },
    errors,
    plannedRunCount,
  };
}

export function parseDisplayAmountToBaseUnits(amountInput: string, coinType: string): bigint | null {
  const value = amountInput.trim();
  if (!value || value === '.') return null;
  const decimals = getCoinDecimals(coinType);
  const match = value.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = match[2] ?? '';
  if (fraction.length > decimals) return null;
  const raw = BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt((fraction || '').padEnd(decimals, '0') || '0');
  return raw > 0n ? raw : null;
}

export function multiplyDecimalString(value: string, factor: number): string {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) return value;
  const [whole, fraction = ''] = trimmed.split('.');
  const scale = 10n ** BigInt(fraction.length);
  const raw = (BigInt(whole) * scale + BigInt(fraction || '0')) * BigInt(factor);
  const nextWhole = raw / scale;
  const nextFraction = (raw % scale).toString().padStart(fraction.length, '0').replace(/0+$/, '');
  return nextFraction ? `${nextWhole}.${nextFraction}` : nextWhole.toString();
}

function parseDisplayAmountToBaseUnitsWithOverride(
  amountInput: string,
  rawOverride: string,
  coinType: string,
  label: string,
  errors: string[],
): bigint | null {
  const raw = rawOverride.trim();
  if (raw) {
    const parsed = parsePositiveInteger(raw, label, errors);
    return parsed;
  }

  const parsed = parseDisplayAmountToBaseUnits(amountInput, coinType);
  if (parsed === null) {
    errors.push(`${label} must be a positive amount with valid decimals.`);
  }
  return parsed;
}

function parsePositiveInteger(value: string, label: string, errors: string[]): bigint | null {
  const raw = value.trim();
  if (!/^\d+$/.test(raw)) {
    errors.push(`${label} must be a positive integer.`);
    return null;
  }
  const parsed = BigInt(raw);
  if (parsed <= 0n) {
    errors.push(`${label} must be greater than zero.`);
    return null;
  }
  return parsed;
}

function scheduleForState(state: AgentMandateDraftState, errors: string[]): string | null {
  const schedule =
    state.cadence === 'custom'
      ? state.customCron.trim()
      : CADENCE_SCHEDULES[state.cadence];
  if (!schedule) return null;
  if (!nextCronRun(schedule, new Date())) {
    errors.push('Schedule must be a valid cron expression.');
    return null;
  }
  return schedule;
}

function plannedRunsForState(
  state: AgentMandateDraftState,
  nowMs: number,
  expiryMs: number,
  schedule: string | null,
  errors: string[],
): number {
  if (!schedule) return 1;
  if (state.cadence === 'daily') return assertMaxRuns(Math.ceil((expiryMs - nowMs) / 86_400_000), errors);
  if (state.cadence === 'weekly') return assertMaxRuns(Math.ceil((expiryMs - nowMs) / (7 * 86_400_000)), errors);

  let count = 0;
  let cursor: Date | null = new Date(nowMs);
  while (count <= MAX_PLANNED_RUNS) {
    const next = nextCronRun(schedule, cursor);
    if (!next || next.getTime() >= expiryMs) break;
    count += 1;
    cursor = next;
  }
  return assertMaxRuns(Math.max(count, 1), errors);
}

function assertMaxRuns(count: number, errors: string[]): number {
  if (count > MAX_PLANNED_RUNS) {
    errors.push(`V1 supports at most ${MAX_PLANNED_RUNS} planned runs. Shorten expiry or lower frequency.`);
  }
  return count;
}
