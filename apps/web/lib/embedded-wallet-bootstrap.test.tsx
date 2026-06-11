/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getAccessTokenMock, privyAuthenticatedFetchMock, privyState } = vi.hoisted(() => ({
  getAccessTokenMock: vi.fn(async () => 'access-token'),
  privyAuthenticatedFetchMock: vi.fn(),
  privyState: {
    ready: true,
    authenticated: true,
    user: {
      id: 'did:privy:user',
      twitter: { subject: '1832743034540507136' },
    },
    getAccessToken: vi.fn(async () => 'access-token'),
  },
}));

vi.mock('@privy-io/react-auth', () => ({
  useIdentityToken: () => ({ identityToken: 'identity-token' }),
  usePrivy: () => ({
    ...privyState,
    getAccessToken: getAccessTokenMock,
  }),
}));

vi.mock('@/lib/privy-fetch', () => ({
  privyAuthenticatedFetch: privyAuthenticatedFetchMock,
}));

import {
  EmbeddedWalletBootstrapProvider,
  useEmbeddedWalletBootstrap,
} from './embedded-wallet-bootstrap';

function WalletProbe() {
  const wallet = useEmbeddedWalletBootstrap();
  return <div data-testid="wallet">{wallet.suiAddress ?? (wallet.loading ? 'loading' : 'none')}</div>;
}

function walletSetupResponse(suiAddress: string) {
  return new Response(JSON.stringify({ suiAddress, walletReady: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function renderWallet(root: Root) {
  await act(async () => {
    root.render(
      <EmbeddedWalletBootstrapProvider>
        <WalletProbe />
      </EmbeddedWalletBootstrapProvider>,
    );
  });
}

async function waitForWalletAddress(host: HTMLElement, expected: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (host.textContent?.includes(expected)) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  throw new Error(`Expected wallet address ${expected}, received ${host.textContent ?? ''}`);
}

describe('EmbeddedWalletBootstrapProvider', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    window.sessionStorage.clear();
    vi.clearAllMocks();
    getAccessTokenMock.mockResolvedValue('access-token');
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    window.sessionStorage.clear();
    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  });

  it('does not reuse a cached wallet address when the Privy app id changes', async () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'privy-app-a';
    privyAuthenticatedFetchMock.mockResolvedValueOnce(walletSetupResponse('0xold'));

    await renderWallet(root);
    await waitForWalletAddress(host, '0xold');

    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'privy-app-b';
    privyAuthenticatedFetchMock.mockResolvedValueOnce(walletSetupResponse('0xnew'));

    await renderWallet(root);
    await waitForWalletAddress(host, '0xnew');

    expect(privyAuthenticatedFetchMock).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem('levo:wallet:privy-app-a:1832743034540507136')).toBe('0xold');
    expect(window.sessionStorage.getItem('levo:wallet:privy-app-b:1832743034540507136')).toBe('0xnew');
  });
});
