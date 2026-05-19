import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AgentMandateConfig } from '@/lib/agent/config';

let searchParams = '';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParams),
}));

vi.mock('@privy-io/react-auth', () => ({
  useAuthorizationSignature: () => ({ generateAuthorizationSignature: vi.fn() }),
  useIdentityToken: () => ({ identityToken: 'identity-token' }),
  useLoginWithOAuth: () => ({ initOAuth: vi.fn() }),
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    getAccessToken: vi.fn(),
  }),
}));

vi.mock('@/components/agent/MandateProposalCard', () => ({
  MandateProposalCard: () => <div>Review permission</div>,
}));

vi.mock('@/components/agent/AgentChatPanel', () => ({
  AgentChatPanel: () => <div>AgentChatPanel</div>,
}));

const CONFIG: AgentMandateConfig = {
  agentAddress: '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b',
  templates: [
    {
      id: 'stablelayer-earn',
      label: 'StableLayer Earn',
      description: 'Earn target',
      targetAddress: '0x000000000000000000000000000000000000000000000000000000000000be11',
    },
  ],
};

import { AgentWorkspace } from './AgentDashboard';
import { AgentComposerWorkbench } from './AgentComposerWorkbench';
import { MandateCard } from './MandateCard';

describe('Agent mandate creation UI', () => {
  it('/agent/new initial SSR markup asks for intent before showing option controls', () => {
    searchParams = '';
    const markup = renderToStaticMarkup(<AgentComposerWorkbench initialConfig={CONFIG} />);

    expect(markup).toContain('What should the agent do?');
    expect(markup).toContain('Mandate preview');
    expect(markup).not.toContain('Action');
    expect(markup).not.toContain('Cadence');
    expect(markup).not.toContain('Expiry');
    expect(markup).not.toContain('Ask about existing mandates');
    expect(markup).not.toContain('Ask me to manage your yield');
  });

  it('/agent/new with intent renders contextual options and preview', () => {
    searchParams = 'intent=auto-harvest%20claimable%20yield%20daily%20with%20conservative%20caps';
    const markup = renderToStaticMarkup(<AgentComposerWorkbench initialConfig={CONFIG} />);

    expect(markup).toContain('Mandate options');
    expect(markup).toContain('Action');
    expect(markup).toContain('Cadence');
    expect(markup).toContain('Expiry');
    expect(markup).toContain('The agent may');
  });

  it('Agent drawer Create tab also waits for user intent first', () => {
    searchParams = '';
    const markup = renderToStaticMarkup(
      <AgentWorkspace initialView="create" headerAction={<span />} />,
    );

    expect(markup).toContain('What should the agent do?');
    expect(markup).toContain('Create');
    expect(markup).not.toContain('Action');
    expect(markup).not.toContain('AgentChatPanel');
  });

  it('mandate list uses a confirmation affordance before manual execution', () => {
    const markup = renderToStaticMarkup(
      <MandateCard
        onChanged={() => {}}
        mandate={{
          id: 'mandate-1',
          mandateObjectId: '0x000000000000000000000000000000000000000000000000000000000000be11',
          name: 'Daily harvest',
          actions: 8,
          coinLimits: [
            {
              coinType: '0x2::sui::SUI',
              perTxCap: '1000000000',
              periodCap: '10000000000',
              periodSpent: '0',
              periodStartMs: '0',
            },
          ],
          periodMs: '86400000',
          allowedTargets: [],
          expiryMs: String(Date.now() + 86_400_000),
          metadata: {},
          status: 'ACTIVE',
          nonce: '1',
          witnessCommit: '0xabc',
          createdTxDigest: 'created',
          initTxDigest: 'init',
          revokedTxDigest: null,
          revokedAt: null,
          destroyedTxDigest: null,
          destroyedAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }}
      />,
    );

    expect(markup).toContain('Review execution');
    expect(markup).not.toContain('Execute now');
  });
});
