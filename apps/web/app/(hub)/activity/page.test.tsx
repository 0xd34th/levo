/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  initOAuthMock,
  privyAuthenticatedFetchMock,
  useEmbeddedWalletMock,
} = vi.hoisted(() => ({
  initOAuthMock: vi.fn(),
  privyAuthenticatedFetchMock: vi.fn(),
  useEmbeddedWalletMock: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  useLoginWithOAuth: () => ({ initOAuth: initOAuthMock }),
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    user: {
      twitter: {
        subject: '12345',
        username: 'alice',
      },
    },
    getAccessToken: vi.fn(async () => 'access-token'),
  }),
}));

vi.mock('@/lib/privy-fetch', () => ({
  privyAuthenticatedFetch: privyAuthenticatedFetchMock,
}));

vi.mock('@/lib/use-embedded-wallet', () => ({
  useEmbeddedWallet: () => useEmbeddedWalletMock(),
}));

import ActivityPage from './page';

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ActivityPage', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
    useEmbeddedWalletMock.mockReturnValue({
      suiAddress: null,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('shows authentication errors instead of a generic received-payments failure', async () => {
    privyAuthenticatedFetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: 'Authentication temporarily unavailable' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    ));

    await act(async () => {
      root.render(<ActivityPage />);
    });
    await flushEffects();

    expect(host.textContent).toContain('Authentication temporarily unavailable');
    expect(host.textContent).not.toContain('Failed to load received payments.');
  });
});
