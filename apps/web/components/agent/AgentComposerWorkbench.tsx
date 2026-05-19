'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { AgentMandateConfig } from '@/lib/agent/config';
import type { CreateMandatePayload } from '@/lib/agent/client';
import {
  buildCreateMandatePayload,
  createInitialAgentMandateDraftState,
} from '@/lib/agent/mandate-draft';
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
  initialConfig: AgentMandateConfig;
}) {
  const searchParams = useSearchParams();
  const intent = searchParams.get('intent');
  const [proposal, setProposal] = useState<Proposal | null>(() =>
    initialProposal(initialConfig, intent),
  );

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
          />
        </div>
      </section>
      <MandateDraftPreview proposal={proposal} />
    </div>
  );
}

function initialProposal(config: AgentMandateConfig, intent: string | null): Proposal | null {
  if (!intent?.trim()) return null;
  const state = createInitialAgentMandateDraftState(intent, config.templates[0]);
  const build = buildCreateMandatePayload(state, config);
  if (build.payload) return build.payload;
  if (build.errors.length > 0) return { error: build.errors[0] };
  return null;
}
