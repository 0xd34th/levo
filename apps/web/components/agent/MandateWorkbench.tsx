'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIdentityToken, usePrivy } from '@privy-io/react-auth';
import { Bot, CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import type { AgentMandateConfig } from '@/lib/agent/config';
import {
  actionTimelineLabel,
  describeMandateIntent,
  nextRunLabel,
  shortId,
} from '@/lib/agent/display';
import {
  fetchAgentConfig,
  fetchMandate,
  fetchMandates,
  statusLabel,
  type AgentActionRow,
  type MandateDetailResponse,
  type MandateSummary,
} from '@/lib/agent/client';
import { Button } from '@/components/ui/button';
import { useXSignIn } from '@/lib/use-x-sign-in';
import { cn } from '@/lib/utils';
import { AgentChatPanel } from './AgentChatPanel';
import {
  AGENT_DASHBOARD_ONBOARDING_STEPS,
  AGENT_DASHBOARD_ONBOARDING_STORAGE_KEY,
  AgentOnboardingTour,
  getAgentOnboardingStorageKey,
} from './AgentOnboardingTour';
import { MandateDraftPreview } from './MandateDraftPreview';

type Proposal = {
  spec?: {
    agent: string;
    actions: number;
    coinLimits: Array<{ coinType: string; perTxCap: string; periodCap: string }>;
    periodMs: string;
    allowedTargets: string[];
    expiryMs: string;
    metadata?: Record<string, string>;
  };
  plan?: Array<{
    actionType: number;
    coinType: string;
    target: string;
    amount: string;
  }>;
  metadataName?: string;
  error?: string;
};

export function MandateWorkbench() {
  const { getAccessToken, ready, authenticated, user } = usePrivy();
  const { signIn: signInWithX } = useXSignIn();
  const { identityToken } = useIdentityToken();
  const [config, setConfig] = useState<AgentMandateConfig | null>(null);
  const [mandates, setMandates] = useState<MandateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MandateDetailResponse | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!ready || !authenticated) {
      setConfig(null);
      setMandates([]);
      setSelectedId(null);
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextConfig, rows] = await Promise.all([
        fetchAgentConfig(getAccessToken, identityToken),
        fetchMandates(getAccessToken, identityToken),
      ]);
      setConfig(nextConfig);
      setMandates(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load hosted agent workspace');
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken, identityToken, ready]);

  const reloadDetail = useCallback(async () => {
    if (!ready || !authenticated || !selectedId) {
      setDetail(null);
      return;
    }
    try {
      setDetail(await fetchMandate(getAccessToken, identityToken ?? null, selectedId));
    } catch (err) {
      setDetail(null);
      setError(err instanceof Error ? err.message : 'Failed to load mandate runs');
    }
  }, [authenticated, getAccessToken, identityToken, ready, selectedId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void reloadDetail();
  }, [reloadDetail]);

  const selectedMandate = useMemo(
    () => detail?.mandate ?? mandates.find((mandate) => mandate.id === selectedId) ?? null,
    [detail?.mandate, mandates, selectedId],
  );
  const recentRuns = detail?.actions ?? [];
  const tourStorageKey = getAgentOnboardingStorageKey({
    authenticated,
    baseKey: AGENT_DASHBOARD_ONBOARDING_STORAGE_KEY,
    user,
  });

  if (!ready) {
    return <ShellMessage>Loading Agent workspace...</ShellMessage>;
  }

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center pt-12 text-center">
        <p className="text-[14px]" style={{ color: 'var(--text-mute)' }}>
          Sign in to use Agent.
        </p>
        <Button className="mt-4 h-11 rounded-full px-5" onClick={signInWithX}>
          Sign in with X
        </Button>
      </div>
    );
  }

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex min-h-[620px] min-w-0 flex-col rounded-[12px] bg-[color:var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="size-5" />
              <h1 className="text-[24px] font-semibold">Agent chat</h1>
            </div>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
              Hosted testnet agent workspace for Sui and bounded Earn mandates.
            </p>
          </div>
          {tourStorageKey ? (
            <AgentOnboardingTour steps={AGENT_DASHBOARD_ONBOARDING_STEPS} storageKey={tourStorageKey} />
          ) : null}
        </div>
        <div className="min-h-0 flex-1 pt-4">
          <AgentChatPanel
            onMandateCreated={reload}
            onMandateDraftChange={setProposal}
          />
        </div>
      </section>

      <aside className="space-y-3 xl:max-h-[calc(100vh-4rem)] xl:overflow-y-auto">
        <HostedAgentStatus config={config} loading={loading} error={error} />
        {proposal ? <MandateDraftPreview proposal={proposal} /> : null}
        <ExistingMandatesPanel
          loading={loading}
          mandates={mandates}
          selectedId={selectedMandate?.id ?? selectedId}
          onSelect={setSelectedId}
        />
        <RecentRunsPanel mandate={selectedMandate} runs={recentRuns} />
      </aside>
    </div>
  );
}

function HostedAgentStatus({
  config,
  loading,
  error,
}: {
  config: AgentMandateConfig | null;
  loading: boolean;
  error: string | null;
}) {
  const hasHostedAgent = config?.agentAddress && !config.error;
  return (
    <section className="rounded-[12px] bg-[color:var(--surface)] p-4 ring-1 ring-[color:var(--border)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">Hosted agent</p>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-soft)' }}>
            Testnet mandate execution
          </p>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase ring-1 ring-[color:var(--border)]">
          Testnet
        </span>
      </div>
      {loading && !config ? (
        <p className="mt-4 inline-flex items-center gap-2 text-[13px]" style={{ color: 'var(--text-soft)' }}>
          <Loader2 className="size-3.5 animate-spin" />
          Loading hosted agent
        </p>
      ) : hasHostedAgent ? (
        <div className="mt-4 space-y-2 text-[13px]">
          <StatusLine ok label={config.agentLabel ?? 'Levo hosted agent'} />
          <p className="font-mono text-[12px]" style={{ color: 'var(--text-soft)' }}>
            {shortId(config.agentAddress)}
          </p>
        </div>
      ) : (
        <StatusLine ok={false} label={config?.error ?? error ?? 'Hosted agent unavailable'} />
      )}
    </section>
  );
}

function ExistingMandatesPanel({
  loading,
  mandates,
  selectedId,
  onSelect,
}: {
  loading: boolean;
  mandates: MandateSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section
      data-agent-tour="agent-mandates"
      className="rounded-[12px] bg-[color:var(--surface)] p-4 ring-1 ring-[color:var(--border)]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold">Existing Mandates</p>
        {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      </div>
      {mandates.length === 0 ? (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--text-soft)' }}>
          No mandates yet. Use the Mandates commands in chat to create one.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {mandates.map((mandate) => (
            <li key={mandate.id}>
              <button
                type="button"
                onClick={() => onSelect(mandate.id)}
                className={cn(
                  'w-full rounded-[10px] p-3 text-left ring-1 transition',
                  selectedId === mandate.id
                    ? 'bg-background ring-[color:var(--border-strong)]'
                    : 'bg-background/50 ring-transparent hover:bg-background',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{mandate.name}</p>
                    <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-soft)' }}>
                      {describeMandateIntent(mandate.actions)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1 ring-[color:var(--border)]">
                    {statusLabel(mandate.status)}
                  </span>
                </div>
                <p className="mt-2 text-[12px]" style={{ color: 'var(--text-mute)' }}>
                  {nextRunLabel(mandate)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentRunsPanel({
  mandate,
  runs,
}: {
  mandate: MandateSummary | null;
  runs: AgentActionRow[];
}) {
  return (
    <section className="rounded-[12px] bg-[color:var(--surface)] p-4 ring-1 ring-[color:var(--border)]">
      <p className="text-[15px] font-semibold">Recent runs</p>
      {!mandate ? (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--text-soft)' }}>
          Select or create an Earn mandate to see runs.
        </p>
      ) : runs.length === 0 ? (
        <p className="mt-3 text-[13px]" style={{ color: 'var(--text-soft)' }}>
          No runs recorded yet for {mandate.name}.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {runs.slice(0, 5).map((run) => (
            <div key={run.id} className="rounded-[10px] bg-background px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{actionTimelineLabel(run)}</p>
                  <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-soft)' }}>
                    {new Date(run.confirmedAt ?? run.createdAt).toLocaleString()} | {run.trigger.toLowerCase()}
                  </p>
                </div>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ring-1 ring-[color:var(--border)]">
                  {run.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className="mt-4 inline-flex items-center gap-2 text-[13px]">
      {ok ? (
        <CheckCircle2 className="size-4" style={{ color: 'var(--up)' }} />
      ) : (
        <CircleAlert className="size-4" style={{ color: 'var(--down)' }} />
      )}
      {label}
    </p>
  );
}

function ShellMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center text-[13px]" style={{ color: 'var(--text-soft)' }}>
      {children}
    </div>
  );
}
