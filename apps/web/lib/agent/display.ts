import {
  formatAmount,
  getCoinLabel,
  getExplorerTransactionUrl,
  isDisplaySupportedCoinType,
} from '@/lib/coins';
import type {
  AgentActionRow,
  CreateMandatePayload,
  MandateSummary,
} from './client';

export interface CoinLimitView {
  coinType: string;
  coinLabel: string;
  perTxCapLabel: string;
  periodCapLabel: string;
  periodSpentLabel: string | null;
  periodSpentRatio: number;
}

interface RawCoinLimit {
  coinType?: unknown;
  perTxCap?: unknown;
  periodCap?: unknown;
  periodSpent?: unknown;
}

const ACTION_TEXT: Record<number, string> = {
  2: 'deposit into Earn',
  4: 'withdraw from Earn',
  8: 'harvest Earn yield',
};

export function shortId(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function describeMandateIntent(actions: number): string {
  const labels = Object.entries(ACTION_TEXT)
    .filter(([bit]) => (actions & Number(bit)) !== 0)
    .map(([, label]) => label);
  return labels.length > 0 ? labels.join(', ') : `action set ${actions}`;
}

export function parseCoinLimits(coinLimits: unknown): CoinLimitView[] {
  if (!Array.isArray(coinLimits)) return [];
  return coinLimits
    .map((limit): CoinLimitView | null => {
      const raw = limit as RawCoinLimit;
      if (typeof raw.coinType !== 'string') return null;
      const perTxCap = decimalString(raw.perTxCap);
      const periodCap = decimalString(raw.periodCap);
      if (!perTxCap || !periodCap) return null;
      const periodSpent = decimalString(raw.periodSpent);
      const spent = periodSpent ? BigInt(periodSpent) : 0n;
      const cap = BigInt(periodCap);
      return {
        coinType: raw.coinType,
        coinLabel: safeCoinLabel(raw.coinType),
        perTxCapLabel: formatCoinAmount(perTxCap, raw.coinType),
        periodCapLabel: formatCoinAmount(periodCap, raw.coinType),
        periodSpentLabel: periodSpent ? formatCoinAmount(periodSpent, raw.coinType) : null,
        periodSpentRatio: cap > 0n ? Math.min(Number((spent * 10_000n) / cap) / 100, 100) : 0,
      };
    })
    .filter((limit): limit is CoinLimitView => limit !== null);
}

export function primaryCoinLimit(mandate: Pick<MandateSummary, 'coinLimits'>): CoinLimitView | null {
  return parseCoinLimits(mandate.coinLimits)[0] ?? null;
}

export function scheduleLabel(metadata: unknown): string {
  if (
    metadata &&
    typeof metadata === 'object' &&
    'schedule' in metadata &&
    typeof (metadata as { schedule?: unknown }).schedule === 'string' &&
    (metadata as { schedule: string }).schedule.trim()
  ) {
    return (metadata as { schedule: string }).schedule.trim();
  }
  return 'Manual';
}

export function nextRunLabel(mandate: Pick<MandateSummary, 'metadata' | 'status' | 'expiryMs'>): string {
  if (mandate.status !== 'ACTIVE') return 'Paused';
  if (BigInt(mandate.expiryMs) <= BigInt(Date.now())) return 'Expired';
  const schedule = scheduleLabel(mandate.metadata);
  return schedule === 'Manual' ? 'Manual trigger' : describeSchedule(schedule);
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Render the cron strings produced by the create-mandate time picker as plain
// English (e.g. "Daily at 09:00 UTC"). Any other cron pattern falls back to the
// raw expression so legacy / hand-authored schedules still display.
export function describeSchedule(cron: string): string {
  const trimmed = cron.trim();
  const daily = trimmed.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (daily) return `Daily at ${formatHourMinute(Number(daily[2]), Number(daily[1]))} UTC`;
  const weekly = trimmed.match(/^(\d{1,2}) (\d{1,2}) \* \* ([0-6])$/);
  if (weekly) {
    return `Weekly on ${WEEKDAY_NAMES[Number(weekly[3])]} at ${formatHourMinute(Number(weekly[2]), Number(weekly[1]))} UTC`;
  }
  return trimmed;
}

function formatHourMinute(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function expiryLabel(expiryMs: string): string {
  const date = new Date(Number(expiryMs));
  if (!Number.isFinite(date.getTime())) return 'Invalid expiry';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function actionTimelineLabel(action: AgentActionRow): string {
  const actionName = ACTION_TEXT[action.actionType] ?? `action ${action.actionType}`;
  const amount = formatCoinAmount(action.amount, action.coinType);
  if (action.status === 'CONFIRMED') return `Confirmed ${actionName} for ${amount}`;
  if (action.status === 'BLOCKED_BY_SEAL') return `Blocked ${actionName} for ${amount}`;
  if (action.status === 'FAILED') return `Failed ${actionName} for ${amount}`;
  return `Pending ${actionName} for ${amount}`;
}

export function explorerObjectUrl(objectId: string): string | null {
  const network = process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet';
  const base = process.env.NEXT_PUBLIC_SUI_EXPLORER_BASE_URL?.replace(/\/$/, '');
  if (base) return `${base}/object/${objectId}`;
  if (network === 'mainnet' || network === 'testnet' || network === 'devnet') {
    return `https://suiscan.xyz/${network}/object/${objectId}`;
  }
  return null;
}

export function explorerTxUrl(txDigest: string | null): string | null {
  if (!txDigest) return null;
  return getExplorerTransactionUrl(process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet', txDigest);
}

export function proposalSummary(payload: CreateMandatePayload): {
  action: string;
  coinLabel: string;
  perTxCap: string;
  periodCap: string;
  amount: string;
  target: string;
  expiry: string;
  schedule: string;
} {
  const firstLimit = payload.spec.coinLimits[0];
  const firstPlan = payload.plan[0];
  const coinType = firstLimit?.coinType ?? firstPlan?.coinType ?? '';
  return {
    action: describeMandateIntent(payload.spec.actions),
    coinLabel: safeCoinLabel(coinType),
    perTxCap: firstLimit ? formatCoinAmount(firstLimit.perTxCap, coinType) : 'Not set',
    periodCap: firstLimit ? formatCoinAmount(firstLimit.periodCap, coinType) : 'Not set',
    amount: firstPlan ? formatCoinAmount(firstPlan.amount, firstPlan.coinType) : 'Not set',
    target: payload.spec.allowedTargets[0] ? shortId(payload.spec.allowedTargets[0]) : 'No target',
    expiry: expiryLabel(payload.spec.expiryMs),
    schedule: scheduleLabel(payload.spec.metadata),
  };
}

export function formatCoinAmount(rawAmount: string, coinType: string): string {
  if (/^\d+$/.test(rawAmount) && coinType && isDisplaySupportedCoinType(coinType)) {
    return `${formatAmount(rawAmount, coinType)} ${safeCoinLabel(coinType)}`;
  }
  return `${rawAmount} units`;
}

function safeCoinLabel(coinType: string): string {
  if (!coinType) return 'coin';
  try {
    return getCoinLabel(coinType);
  } catch {
    const parts = coinType.split('::');
    return parts.at(-1) ?? 'coin';
  }
}

function decimalString(value: unknown): string | null {
  return typeof value === 'string' && /^\d+$/.test(value) ? value : null;
}
