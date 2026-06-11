/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authState,
  fetchMock,
  generateAuthorizationSignatureMock,
  getAccessTokenMock,
} = vi.hoisted(() => ({
  authState: {
    ready: true,
    authenticated: false,
  },
  fetchMock: vi.fn(),
  generateAuthorizationSignatureMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@privy-io/react-auth', () => ({
  useAuthorizationSignature: () => ({
    generateAuthorizationSignature: generateAuthorizationSignatureMock,
  }),
  useIdentityToken: () => ({ identityToken: null }),
  usePrivy: () => ({
    ready: authState.ready,
    authenticated: authState.authenticated,
    getAccessToken: getAccessTokenMock,
  }),
}));

vi.mock('@/components/mobile-top-bar', () => ({
  MobileTopBar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/lib/account-refresh', () => ({
  emitAccountDataRefresh: vi.fn(),
  subscribeAccountDataRefresh: vi.fn(() => () => {}),
}));

import EarnPage from './page';

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('EarnPage auth summary state', () => {
  let host: HTMLDivElement;
  let root: Root;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
    authState.ready = true;
    authState.authenticated = false;
    getAccessTokenMock.mockResolvedValue(null);
    globalThis.fetch = fetchMock;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    globalThis.fetch = originalFetch;
  });

  it('does not request or show an auth error while signed out', async () => {
    await act(async () => {
      root.render(<EarnPage />);
    });
    await flushEffects();

    expect(getAccessTokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('Not authenticated');
    expect(host.textContent).not.toContain('Authentication temporarily unavailable');
  });

  it('does not render summary auth failures as bottom Earn errors', async () => {
    authState.authenticated = true;
    getAccessTokenMock.mockResolvedValue('access-token');
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: 'Authentication temporarily unavailable' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    ));

    await act(async () => {
      root.render(<EarnPage />);
    });
    await flushEffects();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/earn/summary',
      expect.objectContaining({
        cache: 'no-store',
        headers: expect.any(Headers),
      }),
    );
    expect(host.textContent).not.toContain('Authentication temporarily unavailable');
  });
});
