'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { AgentMandateConfig } from '@/lib/agent/config';
import type { CreateMandatePayload } from '@/lib/agent/client';
import {
  buildCreateMandatePayload,
  createInitialAgentMandateDraftState,
} from '@/lib/agent/mandate-draft';
import { AgentSettings } from './AgentSettings';
import { MandateCreateForm } from './MandateCreateForm';
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
  const intent = searchParams.get('intent');
  const [proposal, setProposal] = useState<Proposal | null>(() =>
    initialProposal(initialConfig, intent),
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configReloadSignal, setConfigReloadSignal] = useState(0);

  const helperText = useMemo(() => {
    if (!intent) return 'Describe the Earn task first. Options appear only after there is a request to shape.';
    return `Draft intent: ${intent}`;
  }, [intent]);

  return (
    <div className="grid min-h-[calc(100vh-4rem)] gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="flex min-h-[620px] flex-col rounded-[16px] bg-[color:var(--surface)] p-4">
        <div className="border-b border-[color:var(--border)] pb-3">
          <h1 className="text-[24px] font-semibold tracking-[-0.01em]">New mandate</h1>
          <p className="mt-1 text-[13px]" style={{ color: 'var(--text-soft)' }}>
            {helperText}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          <MandateCreateForm
            initialIntent={intent}
            initialConfig={initialConfig}
            onDraftChange={setProposal}
            onCreated={() => {}}
            onOpenAgentSettings={() => setSettingsOpen(true)}
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

function initialProposal(config: AgentMandateConfig | undefined, intent: string | null): Proposal | null {
  if (!intent?.trim()) return null;
  if (!config) return null;
  const state = createInitialAgentMandateDraftState(intent, config.templates[0]);
  const build = buildCreateMandatePayload(state, config);
  if (build.payload) return build.payload;
  if (build.errors.length > 0) return { error: build.errors[0] };
  return null;
}
