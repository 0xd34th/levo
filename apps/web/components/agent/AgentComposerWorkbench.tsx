'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
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
  const configReloadSignal = 0;
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
              />
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 pt-4">
          <AgentChatPanel
            onMandateCreated={() => {}}
            initialSurface={initialSurface}
            initialMandateIntent={intent}
            onMandateDraftChange={setProposal}
            configReloadSignal={configReloadSignal}
          />
        </div>
      </section>
      <MandateDraftPreview proposal={proposal} />
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
