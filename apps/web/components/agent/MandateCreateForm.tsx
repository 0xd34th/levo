'use client';

import { useEffect, useMemo, useState, type FormEvent, type HTMLAttributes } from 'react';
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Coins,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useIdentityToken, usePrivy } from '@privy-io/react-auth';
import { MAINNET_USDC_TYPE } from '@/lib/coins';
import type { AgentMandateConfig } from '@/lib/agent/config';
import {
  buildCreateMandatePayload,
  createInitialAgentMandateDraftState,
  multiplyDecimalString,
  updateDraftAmount,
  updateDraftCadence,
  type AgentMandateAction,
  type AgentMandateCadence,
  type AgentMandateDraftState,
} from '@/lib/agent/mandate-draft';
import type { CreateMandatePayload } from '@/lib/agent/client';
import { privyAuthenticatedFetch } from '@/lib/privy-fetch';
import { useEmbeddedWallet } from '@/lib/use-embedded-wallet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { MandateProposalCard } from './MandateProposalCard';

interface ProposalPayload {
  spec?: CreateMandatePayload['spec'];
  plan?: CreateMandatePayload['plan'];
  metadataName?: string;
  error?: string;
}

interface MandateCreateFormProps {
  onCancel?: () => void;
  onCreated: () => void | Promise<void>;
  initialIntent?: string | null;
  initialConfig?: AgentMandateConfig;
  onDraftChange?: (proposal: ProposalPayload | null) => void;
  configReloadSignal?: number;
  showIntentPrompt?: boolean;
}

const ACTIONS: Array<{ value: AgentMandateAction; label: string }> = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdraw', label: 'Withdraw' },
  { value: 'harvest', label: 'Harvest' },
];

const CADENCES: Array<{ value: AgentMandateCadence; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'custom', label: 'Custom' },
];

const EXPIRIES: Array<AgentMandateDraftState['expiryDays']> = ['30', '90', '365'];

const FALLBACK_CONFIG: AgentMandateConfig = {
  agentAddress: '',
  userAgentId: null,
  agentLabel: null,
  custodyMode: null,
  executionMode: 'hosted',
  network: 'testnet',
  templates: [],
  error: 'Loading agent configuration...',
};

const SIGN_IN_REQUIRED_CONFIG: AgentMandateConfig = {
  agentAddress: '',
  userAgentId: null,
  agentLabel: null,
  custodyMode: null,
  executionMode: 'hosted',
  network: 'testnet',
  templates: [],
  error: 'Sign in with X to load your Earn account target.',
};

const WALLET_PREPARING_CONFIG: AgentMandateConfig = {
  agentAddress: '',
  userAgentId: null,
  agentLabel: null,
  custodyMode: null,
  executionMode: 'hosted',
  network: 'testnet',
  templates: [],
  error: 'Preparing your wallet for Agent approvals...',
};

export function MandateCreateForm({
  onCancel,
  onCreated,
  initialIntent,
  initialConfig,
  onDraftChange,
  configReloadSignal = 0,
  showIntentPrompt = true,
}: MandateCreateFormProps) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { identityToken } = useIdentityToken();
  const embeddedWallet = useEmbeddedWallet();
  const [activeIntent, setActiveIntent] = useState(initialIntent?.trim() ?? '');
  const [intentInput, setIntentInput] = useState(initialIntent?.trim() ?? '');
  const [config, setConfig] = useState<AgentMandateConfig>(initialConfig ?? FALLBACK_CONFIG);
  const [state, setState] = useState<AgentMandateDraftState>(() =>
    createInitialAgentMandateDraftState(initialIntent, initialConfig?.templates[0]),
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const walletSetupBlocked = ready && authenticated && !embeddedWallet.suiAddress;
  const walletSetupError = walletSetupBlocked ? embeddedWallet.error : null;
  const walletGateConfig = walletSetupError
    ? { ...WALLET_PREPARING_CONFIG, error: walletSetupError }
    : walletSetupBlocked
      ? WALLET_PREPARING_CONFIG
      : null;
  const effectiveConfig = walletGateConfig ?? initialConfig ?? (ready && !authenticated ? SIGN_IN_REQUIRED_CONFIG : config);
  const activeConfigError = authenticated && !walletGateConfig ? configError : null;

  useEffect(() => {
    if (initialConfig) return;
    if (!ready) return;
    if (!authenticated) {
      return;
    }
    if (!embeddedWallet.suiAddress) {
      return;
    }

    let cancelled = false;
    privyAuthenticatedFetch(
      getAccessToken,
      '/api/v1/agent/config',
      { cache: 'no-store' },
      { identityToken },
    )
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message =
            typeof payload === 'object' &&
            payload !== null &&
            typeof (payload as { error?: unknown }).error === 'string'
              ? (payload as { error: string }).error
              : `Agent config failed with HTTP ${res.status}`;
          throw new Error(message);
        }
        return res.json() as Promise<AgentMandateConfig>;
      })
      .then((nextConfig) => {
        if (cancelled) return;
        setConfig(nextConfig);
        setConfigError(null);
        setState((current) => ({
          ...current,
          templateId: nextConfig.templates[0]?.id ?? current.templateId,
        }));
      })
      .catch((err) => {
        if (!cancelled) {
          setConfigError(err instanceof Error ? err.message : 'Failed to load agent config');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated, configReloadSignal, embeddedWallet.suiAddress, getAccessToken, identityToken, initialConfig, ready]);

  const build = useMemo(() => buildCreateMandatePayload(state, effectiveConfig), [effectiveConfig, state]);
  const proposal = useMemo<ProposalPayload | null>(() => {
    if (!activeIntent) return null;
    if (build.payload) return build.payload;
    if (build.errors.length > 0) return { error: build.errors[0] };
    return null;
  }, [activeIntent, build.errors, build.payload]);

  useEffect(() => {
    onDraftChange?.(proposal);
  }, [onDraftChange, proposal]);

  const setField = <K extends keyof AgentMandateDraftState>(
    key: K,
    value: AgentMandateDraftState[K],
  ) => setState((s) => ({ ...s, [key]: value }));

  const disabled = Boolean(effectiveConfig.error || activeConfigError);

  const commitIntent = (intent: string) => {
    const nextIntent = intent.trim();
    if (!nextIntent) return;
    setIntentInput(nextIntent);
    setActiveIntent(nextIntent);
    setState(createInitialAgentMandateDraftState(nextIntent, effectiveConfig.templates[0]));
    setAdvancedOpen(false);
  };

  const submitIntent = (e: FormEvent) => {
    e.preventDefault();
    commitIntent(intentInput);
  };

  if (!activeIntent) {
    if (!showIntentPrompt) {
      return (
        <div className="space-y-3">
          <section data-agent-tour="mandate-intent" className="rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
            <p className="text-[14px] font-medium">No mandate intent selected</p>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
              Choose an Earn mandate command in the Agent workspace. The guided approval controls will appear here.
            </p>
          </section>
          {(effectiveConfig.error || activeConfigError) && (
            <AgentConfigNotice
              message={effectiveConfig.error ?? activeConfigError ?? ''}
              onRetryWalletSetup={walletSetupError ? embeddedWallet.refetch : undefined}
            />
          )}
        </div>
      );
    }

    return (
      <form onSubmit={submitIntent} className="space-y-5">
        <section data-agent-tour="mandate-intent" className="rounded-[14px] bg-background p-4 ring-1 ring-[color:var(--border)]">
          <p className="text-[14px] font-semibold">What should the agent do?</p>
          <p className="mt-1 text-[13px] leading-[1.45]" style={{ color: 'var(--text-soft)' }}>
            Describe the Earn task in your own words.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              value={intentInput}
              onChange={(e) => setIntentInput(e.target.value)}
              placeholder="Auto-harvest claimable yield daily with conservative caps"
              className="flex-1"
            />
            <Button type="submit" disabled={!intentInput.trim()}>
              Continue
              <ArrowRight className="ml-1.5 size-4" />
            </Button>
          </div>
        </section>
        {(effectiveConfig.error || activeConfigError) && (
          <AgentConfigNotice
            message={effectiveConfig.error ?? activeConfigError ?? ''}
            onRetryWalletSetup={walletSetupError ? embeddedWallet.refetch : undefined}
          />
        )}
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <section data-agent-tour="mandate-options" className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              <h2 className="text-[16px] font-semibold">Mandate options</h2>
            </div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
              Based on: {activeIntent}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
              Runs on schedule from your delegated wallet · mainnet
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveIntent('');
              onDraftChange?.(null);
            }}
          >
            Change
          </Button>
        </div>

        <SegmentedGroup
          label="Action"
          value={state.action}
          options={ACTIONS}
          onChange={(value) => setField('action', value)}
          disabled={disabled}
        />

        <SegmentedGroup
          label="Cadence"
          value={state.cadence}
          options={CADENCES}
          onChange={(value) => setState((s) => updateDraftCadence(s, value))}
          disabled={disabled}
        />

        {state.cadence === 'custom' && (
          <TextField
            label="Custom cron"
            value={state.customCron}
            onChange={(value) => setField('customCron', value)}
            disabled={disabled}
            placeholder="0 9 * * *"
          />
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <TextField
              label="Amount"
              value={state.amount}
              onChange={(value) => setState((s) => updateDraftAmount(s, value))}
              disabled={disabled}
              inputMode="decimal"
              placeholder="1"
            />
          </div>
          <TextField
            label="Per-run cap"
            value={state.perTxCap}
            onChange={(value) => setField('perTxCap', value)}
            disabled={disabled}
            inputMode="decimal"
            placeholder={state.amount}
          />
          <TextField
            label="Period cap"
            value={state.periodCap}
            onChange={(value) => setField('periodCap', value)}
            disabled={disabled}
            inputMode="decimal"
            placeholder={multiplyDecimalString(state.amount, 10)}
          />
        </div>

        <SegmentedGroup
          label="Expiry"
          value={state.expiryDays}
          options={EXPIRIES.map((days) => ({ value: days, label: `${days} days` }))}
          onChange={(value) => setField('expiryDays', value)}
          disabled={disabled}
        />
      </section>

      <section className="rounded-[12px] bg-[color:var(--surface)] p-3 ring-1 ring-[color:var(--border)]">
        <button
          type="button"
          onClick={() => setAdvancedOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="flex items-center gap-2 text-[14px] font-semibold">
            <SlidersHorizontal className="size-4" />
            Advanced
          </span>
          <ChevronDown className={cn('size-4 transition', advancedOpen && 'rotate-180')} />
        </button>

        {advancedOpen && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Coin type"
                value={state.coinType}
                options={[{ value: MAINNET_USDC_TYPE, label: 'USDC' }]}
                onChange={(value) => setField('coinType', value)}
                disabled={disabled}
              />
              <SelectField
                label="Target"
                value={state.templateId}
              options={effectiveConfig.templates.map((template) => ({
                  value: template.id,
                  label: template.label,
                }))}
                onChange={(value) => setField('templateId', value as AgentMandateDraftState['templateId'])}
                disabled={disabled || effectiveConfig.templates.length === 0}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                label="Raw amount"
                value={state.rawAmount}
                onChange={(value) => setField('rawAmount', value)}
                disabled={disabled}
                inputMode="numeric"
                placeholder="Derived"
              />
              <TextField
                label="Raw per-run cap"
                value={state.rawPerTxCap}
                onChange={(value) => setField('rawPerTxCap', value)}
                disabled={disabled}
                inputMode="numeric"
                placeholder="Derived"
              />
              <TextField
                label="Raw period cap"
                value={state.rawPeriodCap}
                onChange={(value) => setField('rawPeriodCap', value)}
                disabled={disabled}
                inputMode="numeric"
                placeholder="Derived"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Period (ms)"
                value={state.periodMs}
                onChange={(value) => setField('periodMs', value)}
                disabled={disabled}
                inputMode="numeric"
              />
              <ReadOnlyValue
                label="Earn account target"
                value={effectiveConfig.templates.find((t) => t.id === state.templateId)?.targetAddress ?? 'Not configured'}
              />
            </div>
          </div>
        )}
      </section>

      {(effectiveConfig.error || activeConfigError || build.errors.length > 0) && (
        <AgentConfigNotice
          message={effectiveConfig.error ?? activeConfigError ?? build.errors[0]}
          onRetryWalletSetup={walletSetupError ? embeddedWallet.refetch : undefined}
        />
      )}

      <div className="space-y-2">
        {build.payload ? (
          <MandateProposalCard proposal={build.payload} onCreated={onCreated} />
        ) : (
          <Button type="button" variant="default" disabled className="w-full">
            Review permission
          </Button>
        )}
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} className="w-full">
            Cancel
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 text-[12px]" style={{ color: 'var(--text-soft)' }}>
        <div className="flex items-center gap-1.5">
          <CalendarClock className="size-3.5" />
          {state.cadence === 'manual' ? 'Manual trigger' : `${build.plannedRunCount} planned runs`}
        </div>
        <div className="flex items-center gap-1.5">
          <Coins className="size-3.5" />
          Caps enforced per run and per period
        </div>
      </div>
    </div>
  );
}

function AgentConfigNotice({
  message,
  onRetryWalletSetup,
}: {
  message: string;
  onRetryWalletSetup?: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-[10px] bg-background px-3 py-2 text-[12px] ring-1 ring-[color:var(--border)] sm:flex-row sm:items-center sm:justify-between"
      style={{ color: 'var(--down)' }}
    >
      <p>{message}</p>
      {onRetryWalletSetup && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start whitespace-nowrap sm:self-auto"
          onClick={onRetryWalletSetup}
        >
          Retry wallet setup
        </Button>
      )}
    </div>
  );
}

function SegmentedGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px]" style={{ color: 'var(--text-soft)' }}>{label}</Label>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1 rounded-[10px] bg-background p-1 ring-1 ring-[color:var(--border)]">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            disabled={disabled}
            className={cn(
              'min-h-9 rounded-[8px] px-2 text-[13px] font-medium transition',
              value === option.value
                ? 'bg-foreground text-background'
                : 'text-[color:var(--text-soft)] hover:bg-[color:var(--surface)]',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px]" style={{ color: 'var(--text-soft)' }}>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px]" style={{ color: 'var(--text-soft)' }}>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 w-full rounded-[8px] border border-[color:var(--border)] bg-background px-3 text-[14px] outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)]"
      >
        {options.length === 0 ? <option value="">Not configured</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px]" style={{ color: 'var(--text-soft)' }}>{label}</Label>
      <div className="min-h-10 overflow-hidden rounded-[8px] border border-[color:var(--border)] bg-background px-3 py-2 font-mono text-[12px]">
        {value}
      </div>
    </div>
  );
}
