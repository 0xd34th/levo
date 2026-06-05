/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  privyState,
  fetchMandatesMock,
  getAccessTokenMock,
  generateAuthorizationSignatureMock,
} = vi.hoisted(() => ({
  privyState: {
    ready: true,
    authenticated: false,
  },
  fetchMandatesMock: vi.fn(async () => []),
  getAccessTokenMock: vi.fn(async () => 'access-token'),
  generateAuthorizationSignatureMock: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  useAuthorizationSignature: () => ({
    generateAuthorizationSignature: generateAuthorizationSignatureMock,
  }),
  useIdentityToken: () => ({ identityToken: 'identity-token' }),
  usePrivy: () => ({
    ready: privyState.ready,
    authenticated: privyState.authenticated,
    getAccessToken: getAccessTokenMock,
  }),
}));

vi.mock('@/lib/agent/client', () => ({
  destroyMandate: vi.fn(),
  executeMandate: vi.fn(),
  fetchMandate: vi.fn(),
  fetchMandates: fetchMandatesMock,
  pauseMandate: vi.fn(),
  resumeMandate: vi.fn(),
  revokeMandate: vi.fn(),
  statusLabel: (status: string) => status,
}));

vi.mock('./AgentSettings', () => ({
  AgentSettings: () => (
    <div>
      <section data-agent-tour="runner-bind">Bind external agent</section>
      <section data-agent-tour="runner-token">Copy setup prompt</section>
    </div>
  ),
}));

import { MandateWorkbench } from './MandateWorkbench';

const DASHBOARD_TOUR_STORAGE_KEY = 'levo.agentOnboarding.dashboard.v2';

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
  await flushTourEffects();
}

async function flushTourEffects() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

describe('/agent mandate workbench onboarding', () => {
  let host: HTMLDivElement;
  let root: Root | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    privyState.ready = true;
    privyState.authenticated = false;
    fetchMandatesMock.mockClear();
    getAccessTokenMock.mockClear();
    generateAuthorizationSignatureMock.mockClear();
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

  async function renderWorkbench() {
    root = createRoot(host);
    await act(async () => {
      root?.render(<MandateWorkbench />);
    });
    await flushTourEffects();
  }

  it('signed-out render still contains the Agent shell and Guide', () => {
    const markup = renderToStaticMarkup(<MandateWorkbench />);

    expect(markup).toContain('Agent');
    expect(markup).toContain('Guide');
    expect(markup).toContain('Sign in to manage Agent mandates.');
  });

  it('signed-out tour auto-starts with dashboard copy', async () => {
    await renderWorkbench();

    expect(host.textContent).toContain('Sign in to review and manage your Agent mandates.');
    expect(host.textContent).toContain('Use New mandate to open the guided composer.');
  });

  it('Close writes the signed-out dashboard dismissed state', async () => {
    await renderWorkbench();

    await clickButton(host, 'Close');

    expect(JSON.parse(window.localStorage.getItem(DASHBOARD_TOUR_STORAGE_KEY) ?? '{}')).toMatchObject({
      status: 'dismissed',
    });
    expect(host.textContent).not.toContain('Sign in to review and manage your Agent mandates.');
  });

  it('Done writes the signed-out dashboard completed state', async () => {
    await renderWorkbench();

    await clickButton(host, 'Next');
    await clickButton(host, 'Done');

    expect(JSON.parse(window.localStorage.getItem(DASHBOARD_TOUR_STORAGE_KEY) ?? '{}')).toMatchObject({
      status: 'completed',
    });
  });

  it.each(['dismissed', 'completed'] as const)('Guide reopens after %s state', async (status) => {
    window.localStorage.setItem(
      DASHBOARD_TOUR_STORAGE_KEY,
      JSON.stringify({ version: 2, status, updatedAt: '2026-06-05T00:00:00.000Z' }),
    );

    await renderWorkbench();

    expect(host.textContent).toContain('Guide');
    expect(host.textContent).not.toContain('Sign in to review and manage your Agent mandates.');

    await clickButton(host, 'Guide');

    expect(host.textContent).toContain('Sign in to review and manage your Agent mandates.');
  });

  it('signed-in tour switches to Settings and reveals the runner bind anchor', async () => {
    privyState.authenticated = true;
    await renderWorkbench();

    expect(host.textContent).toContain('Review mandates and recent runs from this dashboard.');

    await clickButton(host, 'Next');
    expect(host.textContent).toContain('Use New mandate to open the guided composer.');

    await clickButton(host, 'Next');
    expect(host.textContent).toContain('Switch to Settings to manage external runners.');
    expect(host.querySelector('[data-agent-tour="runner-bind"]')).toBeTruthy();
    expect(host.textContent).toContain('Bind external agent');
  });
});
