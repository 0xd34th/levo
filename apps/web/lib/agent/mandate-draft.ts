import { getCoinDecimals, MAINNET_USDC_TYPE } from '@/lib/coins';
import { nextCronRun } from './cron-util';
import type { AgentMandateConfig, AgentMandateTemplate } from './config';
import type { CreateMandatePayload } from './client';

export type AgentMandateAction = 'deposit' | 'withdraw' | 'harvest';
export type AgentMandateCadence = 'manual' | 'daily' | 'weekly';

export interface AgentMandateDraftState {
  action: AgentMandateAction;
  cadence: AgentMandateCadence;
  amount: string;
  perTxCap: string;
  periodCap: string;
  expiryDays: '30' | '90' | '365';
  coinType: string;
  templateId: AgentMandateTemplate['id'];
  // Time of day (HH:MM, UTC) the schedule fires; weekday (cron day-of-week,
  // 0=Sunday) applies only to the weekly cadence.
  timeOfDay: string;
  weekday: string;
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

export const MAX_PLANNED_RUNS = 64;
const DEFAULT_TIME_OF_DAY = '09:00';
const DEFAULT_WEEKDAY = '1';

const CADENCE_PERIOD_MS: Record<AgentMandateCadence, string> = {
  manual: '86400000',
  daily: '86400000',
  weekly: '604800000',
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
    // Earn mandates deposit/withdraw USDC on mainnet; caps and the per-run amount
    // are denominated in USDC.
    coinType: MAINNET_USDC_TYPE,
    templateId: template?.id ?? 'stablelayer-earn',
    timeOfDay: DEFAULT_TIME_OF_DAY,
    weekday: DEFAULT_WEEKDAY,
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
  if (!config.agentAddress) errors.push('Hosted agent is not available.');
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
  const plannedRunCount = plannedRunsForState(state, nowMs, Number(expiryMsBigint), schedule);

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

function parseTimeOfDay(value: string): { hour: number; minute: number } | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function scheduleForState(state: AgentMandateDraftState, errors: string[]): string | null {
  if (state.cadence === 'manual') return null;
  const time = parseTimeOfDay(state.timeOfDay);
  if (!time) {
    errors.push('Pick a valid time.');
    return null;
  }
  const schedule =
    state.cadence === 'weekly'
      ? `${time.minute} ${time.hour} * * ${state.weekday}`
      : `${time.minute} ${time.hour} * * *`;
  // The schedule is machine-generated and always valid; keep the croner
  // round-trip as a defensive safety net against future cadence changes.
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
): number {
  if (!schedule) return 1;
  const intervalMs = state.cadence === 'weekly' ? 7 * 86_400_000 : 86_400_000;
  return clampPlannedRuns(Math.ceil((expiryMs - nowMs) / intervalMs));
}

// DB-scheduled mandates run on their cron until expiry — the worker reruns the
// single action each tick and does not consume a fixed plan. `plannedRunCount`
// is only a display estimate now, so cap it instead of letting long expiries
// inflate the number.
function clampPlannedRuns(count: number): number {
  return Math.min(count, MAX_PLANNED_RUNS);
}
