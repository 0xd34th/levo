import { Suspense } from 'react';
import { AgentComposerWorkbench } from '@/components/agent/AgentComposerWorkbench';

export default function NewAgentMandatePage() {
  return (
    <Suspense fallback={null}>
      <AgentComposerWorkbench />
    </Suspense>
  );
}
