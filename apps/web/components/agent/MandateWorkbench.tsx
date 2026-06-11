'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  useAuthorizationSignature,
  useIdentityToken,
  usePrivy,
} from '@privy-io/react-auth';
import {
  Bot,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCw,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  destroyMandate,
  executeMandate,
  fetchMandate,
  fetchMandates,
  pauseMandate,
  resumeMandate,
  revokeMandate,
  statusLabel,
  type AgentActionRow,
  type MandateDetailResponse,
  type MandateSummary,
} from '@/lib/agent/client';
import {
  actionTimelineLabel,
  describeMandateIntent,
  explorerObjectUrl,
  explorerTxUrl,
  expiryLabel,
  nextRunLabel,
  parseCoinLimits,
  primaryCoinLimit,
  scheduleLabel,
  shortId,
} from '@/lib/agent/display';
import { cn } from '@/lib/utils';
import {
  AGENT_DASHBOARD_EMPTY_ONBOARDING_STEPS,
  AGENT_DASHBOARD_ONBOARDING_STEPS,
  AGENT_DASHBOARD_ONBOARDING_STORAGE_KEY,
  AGENT_DASHBOARD_SIGNED_OUT_ONBOARDING_STEPS,
  AgentOnboardingTour,
  getAgentOnboardingStorageKey,
} from './AgentOnboardingTour';
import { AgentSettings } from './AgentSettings';

type AgentPageTab = 'mandates' | 'settings';

const AGENT_PAGE_TABS: Array<{ value: AgentPageTab; label: string }> = [
  { value: 'mandates', label: 'Mandates' },
  { value: 'settings', label: 'Settings' },
];

export function MandateWorkbench() {
  const { getAccessToken, ready, authenticated, user } = usePrivy();
  const { identityToken } = useIdentityToken();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const [activeTab, setActiveTab] = useState<AgentPageTab>('mandates');
  const [mandates, setMandates] = useState<MandateSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MandateDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [mandatesLoaded, setMandatesLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openSettings = useCallback(() => setActiveTab('settings'), []);

  const reloadList = useCallback(async () => {
    if (!ready || !authenticated) {
      setMandatesLoaded(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchMandates(getAccessToken, identityToken);
      setMandates(rows);
      setSelectedId((current) => current ?? rows[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mandates');
    } finally {
      setLoading(false);
      setMandatesLoaded(true);
    }
  }, [authenticated, getAccessToken, identityToken, ready]);

  const reloadDetail = useCallback(async () => {
    if (!selectedId || !ready || !authenticated) return;
    try {
      const next = await fetchMandate(getAccessToken, identityToken ?? null, selectedId);
      setDetail(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mandate detail');
      setDetail(null);
    }
  }, [authenticated, getAccessToken, identityToken, ready, selectedId]);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  useEffect(() => {
    void reloadDetail();
  }, [reloadDetail]);

  const selected = detail?.mandate ?? mandates.find((mandate) => mandate.id === selectedId) ?? null;

  const runAction = async (action: string, fn: () => Promise<unknown>) => {
    setBusy(action);
    setError(null);
    try {
      await fn();
      await reloadList();
      await reloadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : `${action} failed`);
    } finally {
      setBusy(null);
    }
  };

  if (!ready) {
    return <ShellMessage>Loading mandates...</ShellMessage>;
  }

  const useEmptyDashboardTour = authenticated && mandatesLoaded && mandates.length === 0 && !loading;
  const tourSteps = authenticated
    ? !mandatesLoaded
      ? []
      : useEmptyDashboardTour
      ? AGENT_DASHBOARD_EMPTY_ONBOARDING_STEPS
      : AGENT_DASHBOARD_ONBOARDING_STEPS
    : AGENT_DASHBOARD_SIGNED_OUT_ONBOARDING_STEPS;
  const tourStorageKey = getAgentOnboardingStorageKey({
    authenticated,
    baseKey: AGENT_DASHBOARD_ONBOARDING_STORAGE_KEY,
    user,
  });

  return (
    <div data-agent-tour="agent-dashboard" className="grid min-h-[calc(100vh-4rem)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="rounded-[16px] bg-[color:var(--surface)] p-3 lg:h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between px-1 pb-3">
          <div>
            <h1 className="text-[19px] font-semibold">Agent</h1>
            <p className="text-[12px]" style={{ color: 'var(--text-soft)' }}>
              {activeTab === 'mandates' || !authenticated ? 'Mandates and recent runs' : 'Authorized external agents'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {tourStorageKey ? (
              <AgentOnboardingTour
                steps={tourSteps}
                storageKey={tourStorageKey}
                onOpenSettings={openSettings}
              />
            ) : null}
            <Button
              size="icon-sm"
              aria-label="New mandate"
              data-agent-tour="agent-new-mandate"
              nativeButton={false}
              render={<Link href="/agent/new" />}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
        {authenticated ? <AgentPageTabList activeTab={activeTab} onTabChange={setActiveTab} /> : null}
        {!authenticated ? (
          <ShellMessage compact>Sign in to view existing mandates.</ShellMessage>
        ) : activeTab === 'mandates' ? (
          <div data-agent-tour="agent-mandates">
            {loading ? (
              <ShellMessage compact>Loading...</ShellMessage>
            ) : mandates.length === 0 ? (
              <EmptyMandates />
            ) : (
              <ul className="space-y-2 overflow-y-auto lg:max-h-[calc(100vh-12rem)]">
                {mandates.map((mandate) => (
                  <li key={mandate.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(mandate.id)}
                      className={cn(
                        'w-full rounded-[12px] p-3 text-left ring-1 transition',
                        selectedId === mandate.id
                          ? 'bg-background ring-[color:var(--border-strong)]'
                          : 'bg-transparent ring-transparent hover:bg-background/70',
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium">{mandate.name}</p>
                          <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-soft)' }}>
                            {describeMandateIntent(mandate.actions)}
                          </p>
                        </div>
                        <StatusPill status={mandate.status} />
                      </div>
                      <p className="mt-2 text-[12px]" style={{ color: 'var(--text-mute)' }}>
                        {nextRunLabel(mandate)}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="rounded-[12px] bg-background p-4 text-[13px] ring-1 ring-[color:var(--border)]">
            <p className="font-medium">Agent settings</p>
            <p className="mt-1" style={{ color: 'var(--text-soft)' }}>
              Review bound agents, rotate runner tokens, or revoke access.
            </p>
          </div>
        )}
      </section>

      <section className="min-w-0 rounded-[16px] bg-[color:var(--surface)] p-4 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto">
        {!authenticated ? (
          <ShellMessage>Sign in to manage Agent mandates.</ShellMessage>
        ) : activeTab === 'settings' ? (
          <AgentSettings
            onAgentsChanged={() => {
              void reloadList();
            }}
          />
        ) : (
          <>
            {error ? (
              <p className="mb-3 rounded-[10px] bg-background px-3 py-2 text-[13px]" style={{ color: 'var(--down)' }}>
                {error}
              </p>
            ) : null}
            {selected ? (
              <MandateDetail
                mandate={selected}
                actions={detail?.actions ?? []}
                busy={busy}
                onExecute={() =>
                  runAction('execute', () =>
                    executeMandate({ getAccessToken, identityToken }, selected.id),
                  )
                }
                onPause={() =>
                  runAction('pause', () =>
                    pauseMandate({ getAccessToken, identityToken }, selected.id),
                  )
                }
                onResume={() =>
                  runAction('resume', () =>
                    resumeMandate({ getAccessToken, identityToken }, selected.id),
                  )
                }
                onRevoke={() =>
                  runAction('revoke', () =>
                    revokeMandate(
                      { getAccessToken, identityToken, generateAuthorizationSignature },
                      selected.id,
                    ),
                  )
                }
                onDestroy={() =>
                  runAction('destroy', () =>
                    destroyMandate(
                      { getAccessToken, identityToken, generateAuthorizationSignature },
                      selected.id,
                    ),
                  )
                }
              />
            ) : (
              <EmptyMandates newMandateTourAnchor="agent-empty-new-mandate" />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function AgentPageTabList({
  activeTab,
  onTabChange,
}: {
  activeTab: AgentPageTab;
  onTabChange: (tab: AgentPageTab) => void;
}) {
  return (
    <nav className="mb-3 grid grid-cols-2 gap-1 rounded-[10px] bg-background p-1 ring-1 ring-[color:var(--border)]" aria-label="Agent sections">
      {AGENT_PAGE_TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          data-agent-tour={tab.value === 'settings' ? 'agent-settings-tab' : undefined}
          aria-pressed={activeTab === tab.value}
          onClick={() => onTabChange(tab.value)}
          className={cn(
            'h-9 rounded-[8px] px-3 text-[13px] font-medium transition',
            activeTab === tab.value
              ? 'bg-foreground text-background'
              : 'text-[color:var(--text-soft)] hover:bg-[color:var(--surface)] hover:text-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function MandateDetail({
  mandate,
  actions,
  busy,
  onExecute,
  onPause,
  onResume,
  onRevoke,
  onDestroy,
}: {
  mandate: MandateSummary;
  actions: AgentActionRow[];
  busy: string | null;
  onExecute: () => void;
  onPause: () => void;
  onResume: () => void;
  onRevoke: () => void;
  onDestroy: () => void;
}) {
  const limit = primaryCoinLimit(mandate);
  const limits = parseCoinLimits(mandate.coinLimits);
  const objectUrl = explorerObjectUrl(mandate.mandateObjectId);
  const [reviewingExecute, setReviewingExecute] = useState(false);
  const expired = BigInt(mandate.expiryMs) <= BigInt(Date.now());
  const canExecute = mandate.status === 'ACTIVE' && Boolean(mandate.witnessCommit) && !expired;
  const canPause = mandate.status === 'ACTIVE' && !expired;
  const canResume = mandate.status === 'PAUSED_BY_USER';
  const canRevoke = mandate.status !== 'DESTROYED' && mandate.status !== 'REVOKED' && !expired;
  const canDestroy = mandate.status === 'REVOKED' || mandate.status === 'EXPIRED' || expired;

  return (
    <div>
      <div className="flex flex-col gap-4 border-b border-[color:var(--border)] pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="size-5" />
            <h2 className="text-[24px] font-semibold tracking-[-0.01em]">{mandate.name}</h2>
          </div>
          <p className="mt-1 text-[14px]" style={{ color: 'var(--text-soft)' }}>
            {describeMandateIntent(mandate.actions)} | {scheduleLabel(mandate.metadata)}
          </p>
          {objectUrl ? (
            <a
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium"
              href={objectUrl}
              target="_blank"
              rel="noreferrer"
            >
              {shortId(mandate.mandateObjectId)}
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setReviewingExecute(true)} disabled={!canExecute || busy !== null}>
            {busy === 'execute' ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Play className="mr-1.5 size-3.5" />}
            Review execution
          </Button>
          {canPause ? (
            <Button size="sm" variant="outline" onClick={onPause} disabled={busy !== null}>
              {busy === 'pause' ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Pause className="mr-1.5 size-3.5" />}
              Pause
            </Button>
          ) : null}
          {canResume ? (
            <Button size="sm" variant="outline" onClick={onResume} disabled={busy !== null}>
              {busy === 'resume' ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RotateCw className="mr-1.5 size-3.5" />}
              Resume
            </Button>
          ) : null}
          {canRevoke ? (
            <Button size="sm" variant="outline" onClick={onRevoke} disabled={busy !== null}>
              {busy === 'revoke' ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <ShieldOff className="mr-1.5 size-3.5" />}
              Revoke
            </Button>
          ) : null}
          {canDestroy ? (
            <Button size="sm" variant="outline" onClick={onDestroy} disabled={mandate.status === 'DESTROYED' || busy !== null}>
              {busy === 'destroy' ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Trash2 className="mr-1.5 size-3.5" />}
              Destroy
            </Button>
          ) : null}
        </div>
      </div>

      {reviewingExecute && canExecute ? (
        <section className="mt-4 rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
          <h3 className="text-[15px] font-semibold">Confirm execution</h3>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
            This consumes the next witness and submits one bounded action under the mandate policy.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                setReviewingExecute(false);
                onExecute();
              }}
              disabled={busy !== null}
            >
              {busy === 'execute' ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Play className="mr-1.5 size-3.5" />}
              Confirm execution
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReviewingExecute(false)} disabled={busy !== null}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Metric label="Status" value={statusLabel(mandate.status)} />
        <Metric label="Next run" value={nextRunLabel(mandate)} />
        <Metric label="Expires" value={expiryLabel(mandate.expiryMs)} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
          <h3 className="text-[15px] font-semibold">Usage</h3>
          <div className="mt-3 space-y-3">
            {limits.length === 0 ? (
              <p className="text-[13px]" style={{ color: 'var(--text-soft)' }}>
                No cap data available.
              </p>
            ) : (
              limits.map((item) => (
                <div key={item.coinType}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span>{item.coinLabel}</span>
                    <span style={{ color: 'var(--text-soft)' }}>
                      {item.periodSpentLabel ?? '0'} / {item.periodCapLabel}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--surface)]">
                    <div
                      className="h-full rounded-full bg-[color:var(--up)]"
                      style={{ width: `${item.periodSpentRatio}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
          <h3 className="text-[15px] font-semibold">Policy</h3>
          <dl className="mt-3 space-y-2 text-[13px]">
            <KV label="Per run" value={limit?.perTxCapLabel ?? 'Not set'} />
            <KV label="Period cap" value={limit?.periodCapLabel ?? 'Not set'} />
            <KV label="Initialized" value={mandate.witnessCommit ? 'Yes' : 'No'} />
            <KV label="Nonce" value={mandate.nonce} />
          </dl>
        </section>
      </div>

      <section className="mt-4 rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
        <h3 className="text-[15px] font-semibold">Recent runs</h3>
        <div className="mt-3 space-y-2">
          {actions.length === 0 ? (
            <p className="text-[13px]" style={{ color: 'var(--text-soft)' }}>
              No actions recorded yet.
            </p>
          ) : (
            actions.map((action) => <TimelineRow key={action.id} action={action} />)
          )}
        </div>
      </section>
    </div>
  );
}

function TimelineRow({ action }: { action: AgentActionRow }) {
  const url = explorerTxUrl(action.txDigest);
  return (
    <div className="flex items-start justify-between gap-3 rounded-[10px] bg-[color:var(--surface)] px-3 py-2">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{actionTimelineLabel(action)}</p>
        <p className="mt-0.5 text-[12px]" style={{ color: 'var(--text-soft)' }}>
          {new Date(action.confirmedAt ?? action.createdAt).toLocaleString()} | {action.trigger.toLowerCase()}
        </p>
      </div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" aria-label="View transaction">
          <ExternalLink className="size-4" />
        </a>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: MandateSummary['status'] }) {
  return (
    <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium uppercase ring-1 ring-[color:var(--border)]">
      {statusLabel(status)}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-background p-4 ring-1 ring-[color:var(--border)]">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-[18px] font-semibold">{value}</p>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt style={{ color: 'var(--text-soft)' }}>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function EmptyMandates({
  newMandateTourAnchor,
}: {
  newMandateTourAnchor?: string;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[12px] bg-background p-6 text-center ring-1 ring-[color:var(--border)]">
      <Bot className="size-8" />
      <p className="mt-3 text-[15px] font-semibold">No mandates yet</p>
      <p className="mt-1 max-w-xs text-[13px]" style={{ color: 'var(--text-soft)' }}>
        Create a mandate to let the Levo Agent run bounded Earn actions.
      </p>
      <Button
        className="mt-4"
        data-agent-tour={newMandateTourAnchor}
        nativeButton={false}
        render={<Link href="/agent/new" />}
      >
        New mandate
      </Button>
    </div>
  );
}

function ShellMessage({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex items-center justify-center text-[13px]', compact ? 'py-8' : 'min-h-[360px]')} style={{ color: 'var(--text-soft)' }}>
      {children}
    </div>
  );
}
