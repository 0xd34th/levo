'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AgentMandateConfig } from '@/lib/agent/config';
import type { CreateMandatePayload } from '@/lib/agent/client';
import {
  buildCreateMandatePayload,
  createInitialAgentMandateDraftState,
} from '@/lib/agent/mandate-draft';
import { AgentChatPanel } from './AgentChatPanel';
import {
  AGENT_NEW_ONBOARDING_STEPS,
  AGENT_NEW_ONBOARDING_STORAGE_KEY,
  AgentOnboardingTour,
  getAgentOnboardingStorageKey,
} from './AgentOnboardingTour';
import { AgentSettings } from './AgentSettings';
import { MandateDraftPreview } from './MandateDraftPreview';

interface Proposal {
  spec?: CreateMandatePayload['spec'];
  plan?: CreateMandatePayload['plan'];
  metadataName?: string;
  error?: string;
}

export function AgentComposerWorkbench({
  initialConfig,
}: {
  initialConfig?: AgentMandateConfig;
}) {
  const searchParams = useSearchParams();
  const { ready, authenticated, user } = usePrivy();
  const intent = searchParams.get('intent');
  const initialSurface = parseTradeSurface(searchParams.get('surface'));
  const [proposal, setProposal] = useState<Proposal | null>(() =>
    initialProposal(initialConfig, intent),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configReloadSignal, setConfigReloadSignal] = useState(0);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const tourStorageKey = ready
    ? getAgentOnboardingStorageKey({
        authenticated,
        baseKey: AGENT_NEW_ONBOARDING_STORAGE_KEY,
        user,
      })
    : null;

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
      <section className="flex min-h-[620px] flex-col rounded-[16px] bg-[color:var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] pb-3">
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.01em]">Agent workspace</h1>
            <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
              Chat can inspect Sui and prepare handoffs. Approval stays in guided cards.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {tourStorageKey ? (
              <AgentOnboardingTour
                steps={AGENT_NEW_ONBOARDING_STEPS}
                storageKey={tourStorageKey}
                onOpenSettings={openSettings}
              />
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={settingsOpen ? 'default' : 'outline'}
              onClick={openSettings}
              data-agent-tour="agent-settings-toggle"
              aria-pressed={settingsOpen}
            >
              <SlidersHorizontal className="size-3.5" />
              Agent settings
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 pt-4">
          <AgentChatPanel
            onMandateCreated={() => {}}
            initialSurface={initialSurface}
            initialMandateIntent={intent}
            onMandateDraftChange={setProposal}
            onOpenAgentSettings={openSettings}
            configReloadSignal={configReloadSignal}
          />
        </div>
      </section>
      {settingsOpen ? (
        <aside className="min-h-[620px] rounded-[16px] bg-[color:var(--surface)] p-4">
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-[color:var(--border)] pb-3">
            <div>
              <h2 className="text-[18px] font-semibold">Agent settings</h2>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
                Bind an external runner before creating mandates.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-full border border-[color:var(--border)] px-3 py-1 text-[12px] font-medium transition hover:border-[color:var(--border-strong)]"
            >
              Preview
            </button>
          </div>
          <AgentSettings
            onAgentsChanged={() => {
              setConfigReloadSignal((value) => value + 1);
            }}
          />
        </aside>
      ) : (
        <MandateDraftPreview proposal={proposal} />
      )}
    </div>
  );
}

function parseTradeSurface(value: string | null): 'swap' | 'send' | 'bridge' | null {
  return value === 'swap' || value === 'send' || value === 'bridge' ? value : null;
}

function initialProposal(config: AgentMandateConfig | undefined, intent: string | null): Proposal | null {
  if (!intent?.trim()) return null;
  if (!config) return null;
  const state = createInitialAgentMandateDraftState(intent, config.templates[0]);
  const build = buildCreateMandatePayload(state, config);
  if (build.payload) return build.payload;
  if (build.errors.length > 0) return { error: build.errors[0] };
  return null;
}
