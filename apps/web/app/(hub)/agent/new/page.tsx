import { Suspense } from 'react';
import { AgentComposerWorkbench } from '@/components/agent/AgentComposerWorkbench';
import { getAgentMandateConfig } from '@/lib/agent/config';

export default function NewAgentMandatePage() {
  const config = getAgentMandateConfig();

  return (
    <Suspense fallback={null}>
      <AgentComposerWorkbench initialConfig={config} />
    </Suspense>
  );
}
