/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMandateConfig } from '@/lib/agent/config';
import type { MandateDetailResponse, MandateSummary } from '@/lib/agent/client';

const {
  fetchAgentConfigMock,
  fetchMandateMock,
  fetchMandatesMock,
  getAccessTokenMock,
  privyState,
} = vi.hoisted(() => ({
  fetchAgentConfigMock: vi.fn(),
  fetchMandateMock: vi.fn(),
  fetchMandatesMock: vi.fn<() => Promise<MandateSummary[]>>(async () => []),
  getAccessTokenMock: vi.fn(async () => 'access-token'),
  privyState: {
    ready: true,
    authenticated: false,
    user: null as { id?: string; twitter?: { subject?: string } } | null,
  },
}));

vi.mock('@privy-io/react-auth', () => ({
  useAuthorizationSignature: () => ({ generateAuthorizationSignature: vi.fn() }),
  useIdentityToken: () => ({ identityToken: 'identity-token' }),
  usePrivy: () => ({
    ready: privyState.ready,
    authenticated: privyState.authenticated,
    user: privyState.user,
    getAccessToken: getAccessTokenMock,
  }),
}));

vi.mock('@/lib/agent/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/agent/client')>('@/lib/agent/client');
  return {
    ...actual,
    destroyMandate: vi.fn(),
    executeMandate: vi.fn(),
    fetchAgentConfig: fetchAgentConfigMock,
    fetchMandate: fetchMandateMock,
    fetchMandates: fetchMandatesMock,
    pauseMandate: vi.fn(),
    resumeMandate: vi.fn(),
    revokeMandate: vi.fn(),
    statusLabel: (status: string) => status,
  };
});

vi.mock('./AgentChatPanel', () => ({
  AgentChatPanel: ({
    onMandateDraftChange,
  }: {
    onMandateDraftChange?: (proposal: unknown) => void;
  }) => (
    <div data-agent-tour="chat-start">
      <p>Explore Sui or manage mandates.</p>
      {onMandateDraftChange ? <p>create-wired</p> : null}
    </div>
  ),
}));

vi.mock('@/lib/use-x-sign-in', () => ({
  useXSignIn: () => ({ signIn: vi.fn(), loading: false }),
}));

import { MandateWorkbench } from './MandateWorkbench';

const AGENT_CONFIG: AgentMandateConfig = {
  agentAddress: '0x7bca6f160f30cfc99389e0db8d4a453701da16365fb128588bc7df9348031f9b',
  userAgentId: 'user-agent-id',
  agentLabel: 'Levo hosted agent',
  custodyMode: 'HOSTED',
  executionMode: 'hosted',
  network: 'testnet',
  templates: [
    {
      id: 'stablelayer-earn',
      label: 'StableLayer Earn',
      description: 'Earn target',
      targetAddress: '0x000000000000000000000000000000000000000000000000000000000000be11',
    },
  ],
};

const ACTIVE_MANDATE: MandateSummary = {
  id: 'mandate-1',
  userAgentId: 'user-agent-id',
  agentAddress: AGENT_CONFIG.agentAddress,
  mandateObjectId: '0xmandate',
  name: 'Earn mandate',
  actions: 8,
  coinLimits: [],
  periodMs: '86400000',
  allowedTargets: [],
  expiryMs: String(Date.now() + 86400000),
  metadata: { schedule: '0 9 * * *' },
  status: 'ACTIVE',
  nonce: '0',
  witnessCommit: '0xwitness',
  createdTxDigest: '0xcreated',
  initTxDigest: null,
  revokedTxDigest: null,
  revokedAt: null,
  destroyedTxDigest: null,
  destroyedAt: null,
  createdAt: '2026-06-05T00:00:00.000Z',
  updatedAt: '2026-06-05T00:00:00.000Z',
};

const DETAIL: MandateDetailResponse = {
  mandate: ACTIVE_MANDATE,
  actions: [
    {
      id: 'action-1',
      mandateId: 'mandate-1',
      actionType: 8,
      coinType: '0x2::sui::SUI',
      amount: '1000000000',
      target: '0x000000000000000000000000000000000000000000000000000000000000be11',
      status: 'CONFIRMED',
      txDigest: '9rL2txDigest',
      trigger: 'CHAT',
      sealApproved: true,
      errorReason: null,
      nonceAfter: '1',
      commitBefore: '0xbefore',
      commitAfter: '0xafter',
      createdAt: '2026-06-05T00:00:00.000Z',
      confirmedAt: '2026-06-05T00:01:00.000Z',
    },
  ],
};

describe('/agent hosted chat workspace', () => {
  let host: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    privyState.ready = true;
    privyState.authenticated = false;
    privyState.user = null;
    fetchAgentConfigMock.mockResolvedValue(AGENT_CONFIG);
    fetchMandatesMock.mockResolvedValue([]);
    fetchMandateMock.mockResolvedValue(DETAIL);
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
  });

  async function renderWorkbench() {
    root = createRoot(host);
    await act(async () => {
      root?.render(<MandateWorkbench />);
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  it('renders a sign-in gate instead of the workspace when signed out', () => {
    const markup = renderToStaticMarkup(<MandateWorkbench />);

    expect(markup).toContain('Sign in to use Agent.');
    expect(markup).toContain('Sign in with X');
    expect(markup).not.toContain('Agent chat');
    expect(markup).not.toContain('Explore Sui or manage mandates.');
    expect(markup).not.toContain('Existing Mandates');
    expect(markup).not.toContain('Bind external agent');
    expect(markup).not.toContain('runner token');
  });

  it('renders hosted testnet status, existing mandates, and recent runs for signed-in users', async () => {
    privyState.authenticated = true;
    privyState.user = {
      id: 'privy-user-a',
      twitter: { subject: 'twitter-user-a' },
    };
    fetchMandatesMock.mockResolvedValueOnce([ACTIVE_MANDATE]);
    fetchMandateMock.mockResolvedValueOnce(DETAIL);

    await renderWorkbench();

    expect(host.textContent).toContain('Agent chat');
    expect(host.textContent).toContain('create-wired');
    expect(host.textContent).toContain('Hosted agent');
    expect(host.textContent).toContain('Testnet');
    expect(host.textContent).toContain('Existing Mandates');
    expect(host.textContent).toContain('Earn mandate');
    expect(host.textContent).toContain('Recent runs');
    expect(host.textContent).toContain('CONFIRMED');
    expect(host.textContent).not.toContain('Bind external agent');
    expect(host.textContent).not.toContain('Copy setup prompt');
    expect(host.textContent).not.toContain('runner token');
  });

  it('refetches mandates and runs on window focus so background runs surface without a reload', async () => {
    privyState.authenticated = true;
    privyState.user = {
      id: 'privy-user-a',
      twitter: { subject: 'twitter-user-a' },
    };
    fetchMandatesMock.mockResolvedValue([ACTIVE_MANDATE]);
    fetchMandateMock.mockResolvedValue(DETAIL);

    await renderWorkbench();

    const mandatesAfterMount = fetchMandatesMock.mock.calls.length;
    const detailAfterMount = fetchMandateMock.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(fetchMandatesMock.mock.calls.length).toBeGreaterThan(mandatesAfterMount);
    expect(fetchMandateMock.mock.calls.length).toBeGreaterThan(detailAfterMount);
  });
});
