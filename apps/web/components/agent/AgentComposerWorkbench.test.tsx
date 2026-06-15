/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMandateConfig } from '@/lib/agent/config';

let searchParams = '';

const { privyState } = vi.hoisted(() => ({
  privyState: {
    ready: true,
    authenticated: true,
    user: {
      id: 'privy-user-a',
      twitter: { subject: 'twitter-user-a' },
    } as { id?: string; twitter?: { subject?: string } } | null,
  },
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(searchParams),
}));

vi.mock('@privy-io/react-auth', () => ({
  useAuthorizationSignature: () => ({ generateAuthorizationSignature: vi.fn() }),
  useIdentityToken: () => ({ identityToken: 'identity-token' }),
  useLoginWithOAuth: () => ({ initOAuth: vi.fn() }),
  usePrivy: () => ({
    ready: privyState.ready,
    authenticated: privyState.authenticated,
    user: privyState.user,
    getAccessToken: vi.fn(),
  }),
}));

vi.mock('@/lib/use-embedded-wallet', () => ({
  useEmbeddedWallet: () => ({
    suiAddress: '0xowner',
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/components/agent/MandateProposalCard', () => ({
  MandateProposalCard: () => <div>Review permission</div>,
}));

vi.mock('@/components/agent/AgentChatPanel', () => ({
  AgentChatPanel: ({
    initialSurface,
    onCreateMandate,
  }: {
    initialSurface?: string | null;
    onCreateMandate?: (intent: string) => void;
  }) => (
    <div data-agent-tour="chat-start">
      <p>Explore Sui or manage mandates.</p>
      {initialSurface ? <p>Initial surface: {initialSurface}</p> : null}
      {onCreateMandate ? <p>create-wired</p> : null}
      <button
        type="button"
        onClick={() => onCreateMandate?.('Auto-harvest claimable Earn yield daily with conservative caps')}
      >
        Auto-harvest yield
      </button>
      <button
        type="button"
        onClick={() => onCreateMandate?.('Deposit into Earn manually with conservative caps')}
      >
        Deposit into Earn
      </button>
      <button
        type="button"
        onClick={() => onCreateMandate?.('Withdraw from Earn manually with conservative caps')}
      >
        Withdraw from Earn
      </button>
    </div>
  ),
}));

const CONFIG: AgentMandateConfig = {
  agentAddress: '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b',
  userAgentId: 'user-agent-id',
  agentLabel: 'External agent',
  executionMode: 'external_runner',
  templates: [
    {
      id: 'stablelayer-earn',
      label: 'StableLayer Earn',
      description: 'Earn target',
      targetAddress: '0x000000000000000000000000000000000000000000000000000000000000be11',
    },
  ],
};

const NO_AGENT_CONFIG: AgentMandateConfig = {
  agentAddress: '',
  userAgentId: null,
  agentLabel: null,
  executionMode: 'external_runner',
  templates: [],
  error: 'No active external agent is configured. Bind an agent before creating mandates.',
};

const LOADING_CONFIG: AgentMandateConfig = {
  agentAddress: '',
  userAgentId: null,
  agentLabel: null,
  executionMode: 'external_runner',
  templates: [],
  error: 'Loading agent configuration...',
};

import { AgentWorkspace } from './AgentDashboard';
import { AgentComposerWorkbench } from './AgentComposerWorkbench';
import { MandateCreateForm } from './MandateCreateForm';
import { buildRunnerSetupPrompt, RunnerTokenPanel, AgentSettings } from './AgentSettings';
import { MandateCard } from './MandateCard';
import { MandateWorkbench } from './MandateWorkbench';

const TOUR_STORAGE_BASE_KEY = 'levo.agentOnboarding.new.v3';
const ACCOUNT_A_TOUR_STORAGE_KEY = `${TOUR_STORAGE_BASE_KEY}.account.twitter-user-a`;
const ACCOUNT_B_TOUR_STORAGE_KEY = `${TOUR_STORAGE_BASE_KEY}.account.twitter-user-b`;
const AI_CHAT_TOUR_COPY =
  'Use the AI chat under Explore Sui or manage mandates to inspect Sui, check wallets or transactions, open trade handoffs, or start mandate requests.';

function findButton(host: HTMLElement, text: string) {
  const button = Array.from(host.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

async function clickButton(host: HTMLElement, text: string) {
  await act(async () => {
    findButton(host, text).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Agent mandate creation UI', () => {
  it('/agent/new keeps the form in a dialog and shows only chat + preview before opening it', () => {
    searchParams = '';
    const markup = renderToStaticMarkup(<AgentComposerWorkbench initialConfig={CONFIG} />);

    expect(markup).toContain('Explore Sui or manage mandates.');
    expect(markup).toContain('Auto-harvest yield');
    expect(markup).toContain('Deposit into Earn');
    expect(markup).toContain('Withdraw from Earn');
    // The chat panel receives the create-mandate handler that opens the dialog.
    expect(markup).toContain('create-wired');
    // The preview shell stays in the sidebar.
    expect(markup).toContain('Mandate preview');
    // The form now lives inside the (closed) dialog, so its controls are not rendered yet.
    expect(markup).not.toContain('What should the agent do?');
    expect(markup).not.toContain('Mandate options');
    expect(markup).not.toContain('Cadence');
    expect(markup).not.toContain('Bind agent');
  });

  it('the create dialog form shows a bind agent action when no external runner is configured', () => {
    const markup = renderToStaticMarkup(
      <MandateCreateForm
        initialIntent="Auto-harvest claimable Earn yield daily with conservative caps"
        initialConfig={NO_AGENT_CONFIG}
        onCreated={() => {}}
        onOpenAgentSettings={() => {}}
      />,
    );

    expect(markup).toContain('No active external agent is configured. Bind an agent before creating mandates.');
    expect(markup).toContain('Bind agent');
  });

  it('the create dialog form keeps the bind agent action visible while agent configuration loads', () => {
    const markup = renderToStaticMarkup(
      <MandateCreateForm
        initialIntent="Auto-harvest claimable Earn yield daily with conservative caps"
        initialConfig={LOADING_CONFIG}
        onCreated={() => {}}
        onOpenAgentSettings={() => {}}
      />,
    );

    expect(markup).toContain('Loading agent configuration...');
    expect(markup).toContain('Bind agent');
  });

  it('agent settings binds through wallet confirmation instead of manual challenges', () => {
    const markup = renderToStaticMarkup(<AgentSettings />);

    expect(markup).toContain('Bind external agent');
    expect(markup).not.toContain('Generate challenge');
    expect(markup).not.toContain('Signature');
    expect(markup).not.toContain('Sign this personal message');
  });

  it('runner token panel offers a setup prompt that includes the runner API contract', () => {
    const prompt = buildRunnerSetupPrompt({
      baseUrl: 'https://levo.krilly.ai',
      runnerToken: 'lvo_runner_test',
      agentAddress: CONFIG.agentAddress,
      agentLabel: 'Home runner',
    });
    const markup = renderToStaticMarkup(
      <RunnerTokenPanel
        runnerToken="lvo_runner_test"
        agentAddress={CONFIG.agentAddress}
        agentLabel="Home runner"
        baseUrl="https://levo.krilly.ai"
      />,
    );

    expect(prompt).toContain('LEVO_RUNNER_TOKEN=lvo_runner_test');
    expect(prompt).toContain(`LEVO_AGENT_ADDRESS=${CONFIG.agentAddress}`);
    expect(prompt).toContain('LEVO_BASE_URL=https://levo.krilly.ai');
    expect(prompt).toContain('Authorization: Bearer ${LEVO_RUNNER_TOKEN}');
    expect(prompt).toContain('POST ${LEVO_BASE_URL}/api/v1/agent/runner/heartbeat');
    expect(prompt).toContain('POST ${LEVO_BASE_URL}/api/v1/agent/runner/jobs/claim');
    expect(prompt).toContain('{"limit":5}');
    expect(prompt).toContain('GET ${LEVO_BASE_URL}/api/v1/agent/runner/jobs/{jobId}');
    expect(prompt).toContain('POST ${LEVO_BASE_URL}/api/v1/agent/runner/jobs/{jobId}/result');
    expect(prompt).toContain('{"txDigest":"<submitted transaction digest>"}');
    expect(markup).toContain('Copy setup prompt');
    expect(markup).toContain('Copy token');
  });

  it('/agent/new with intent seeds the sidebar preview (form lives in the dialog)', () => {
    searchParams = 'intent=auto-harvest%20claimable%20yield%20daily%20with%20conservative%20caps';
    const markup = renderToStaticMarkup(<AgentComposerWorkbench initialConfig={CONFIG} />);

    expect(markup).toContain('Mandate preview');
    expect(markup).toContain('The agent may');
    // The guided controls render inside the dialog (client portal), not in the SSR markup.
    expect(markup).not.toContain('Mandate options');
  });

  it('the create dialog form renders contextual options from an intent', () => {
    const markup = renderToStaticMarkup(
      <MandateCreateForm
        initialIntent="auto-harvest claimable yield daily with conservative caps"
        initialConfig={CONFIG}
        onCreated={() => {}}
        onOpenAgentSettings={() => {}}
      />,
    );

    expect(markup).toContain('Mandate options');
    expect(markup).toContain('Action');
    expect(markup).toContain('Cadence');
    expect(markup).toContain('Expiry');
  });

  it('/agent/new forwards the surface query to the chat panel', () => {
    searchParams = 'surface=swap';
    const markup = renderToStaticMarkup(<AgentComposerWorkbench initialConfig={CONFIG} />);

    expect(markup).toContain('Initial surface: swap');
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
          userAgentId: 'user-agent-id',
          agentAddress: CONFIG.agentAddress,
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

  it('/agent exposes settings as a page-level tab next to mandates', () => {
    const markup = renderToStaticMarkup(<MandateWorkbench />);

    expect(markup).toContain('Mandates');
    expect(markup).toContain('Settings');
    expect(markup).toContain('Mandates and recent runs');
  });
});

describe('Agent onboarding tour', () => {
  let host: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // Keep intent empty so the create dialog stays closed and the tour auto-starts.
    searchParams = '';
    privyState.ready = true;
    privyState.authenticated = true;
    privyState.user = {
      id: 'privy-user-a',
      twitter: { subject: 'twitter-user-a' },
    };
    window.localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = null;
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    host.remove();
    window.localStorage.clear();
  });

  async function renderWorkbench(config: AgentMandateConfig = CONFIG) {
    root = createRoot(host);
    await act(async () => {
      root?.render(<AgentComposerWorkbench initialConfig={config} />);
    });
    await act(async () => {});
  }

  it('/agent/new renders Guide', () => {
    searchParams = '';
    const markup = renderToStaticMarkup(<AgentComposerWorkbench initialConfig={CONFIG} />);

    expect(markup).toContain('Guide');
  });

  it('auto-starts after hydrating SSR markup when no stored state exists', async () => {
    host.innerHTML = renderToStaticMarkup(<AgentComposerWorkbench initialConfig={CONFIG} />);

    await act(async () => {
      root = hydrateRoot(host, <AgentComposerWorkbench initialConfig={CONFIG} />);
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(host.textContent).toContain('Ask the AI chat');
    expect(host.textContent).toContain(AI_CHAT_TOUR_COPY);
  });

  it('first-run tour copy covers chat start, mandate creation, approval, runner binding, and runner setup storage', async () => {
    await renderWorkbench();

    expect(host.textContent).toContain('Ask the AI chat');
    expect(host.textContent).toContain(AI_CHAT_TOUR_COPY);

    await clickButton(host, 'Next');
    expect(host.textContent).toContain('Shape an Earn mandate from an intent.');

    await clickButton(host, 'Next');
    expect(host.textContent).toContain('Review caps, cadence, expiry, and preview before signing.');

    await clickButton(host, 'Next');
    expect(host.textContent).toContain('Open settings and bind an external runner.');
    expect(host.textContent).toContain('Bind external agent');

    await clickButton(host, 'Next');
    expect(host.textContent).toContain('Copy and store the one-time runner setup prompt after binding.');
  });

  it('closing the tour writes dismissed state', async () => {
    await renderWorkbench();

    await clickButton(host, 'Close');

    expect(JSON.parse(window.localStorage.getItem(ACCOUNT_A_TOUR_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 3,
      status: 'dismissed',
    });
    expect(host.textContent).not.toContain(AI_CHAT_TOUR_COPY);
  });

  it('finishing the tour writes completed state', async () => {
    await renderWorkbench();

    await clickButton(host, 'Next');
    await clickButton(host, 'Next');
    await clickButton(host, 'Next');
    await clickButton(host, 'Next');
    await clickButton(host, 'Done');

    expect(JSON.parse(window.localStorage.getItem(ACCOUNT_A_TOUR_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 3,
      status: 'completed',
    });
  });

  it.each(['dismissed', 'completed'] as const)('Guide reopens after %s state', async (status) => {
    window.localStorage.setItem(
      ACCOUNT_A_TOUR_STORAGE_KEY,
      JSON.stringify({ version: 3, status, updatedAt: '2026-06-05T00:00:00.000Z' }),
    );

    await renderWorkbench();

    expect(host.textContent).toContain('Guide');
    expect(host.textContent).not.toContain(AI_CHAT_TOUR_COPY);

    await clickButton(host, 'Guide');

    expect(host.textContent).toContain(AI_CHAT_TOUR_COPY);
  });

  it('completed state is scoped to the signed-in account', async () => {
    window.localStorage.setItem(
      ACCOUNT_A_TOUR_STORAGE_KEY,
      JSON.stringify({ version: 3, status: 'completed', updatedAt: '2026-06-05T00:00:00.000Z' }),
    );

    await renderWorkbench();

    expect(host.textContent).not.toContain(AI_CHAT_TOUR_COPY);

    privyState.user = {
      id: 'privy-user-b',
      twitter: { subject: 'twitter-user-b' },
    };
    await act(async () => {
      root?.render(<AgentComposerWorkbench initialConfig={CONFIG} />);
    });
    await act(async () => {});

    expect(window.localStorage.getItem(ACCOUNT_B_TOUR_STORAGE_KEY)).toBeNull();
    expect(host.textContent).toContain(AI_CHAT_TOUR_COPY);
  });
});
