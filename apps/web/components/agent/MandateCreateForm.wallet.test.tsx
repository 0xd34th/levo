/**
 * @vitest-environment happy-dom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AgentMandateConfig } from '@/lib/agent/config';

const getAccessTokenMock = vi.fn(async () => 'privy-access-token');
const walletRefetchMock = vi.fn();
const privyAuthenticatedFetchMock = vi.fn();

type MockWalletState = {
  suiAddress: string | null;
  loading: boolean;
  error: string | null;
  refetch: typeof walletRefetchMock;
};

let walletState: MockWalletState = {
  suiAddress: '0xowner',
  loading: false,
  error: null as string | null,
  refetch: walletRefetchMock,
};

vi.mock('@privy-io/react-auth', () => ({
  useAuthorizationSignature: () => ({ generateAuthorizationSignature: vi.fn() }),
  useIdentityToken: () => ({ identityToken: 'identity-token' }),
  usePrivy: () => ({
    ready: true,
    authenticated: true,
    getAccessToken: getAccessTokenMock,
  }),
}));

vi.mock('@/lib/privy-fetch', () => ({
  privyAuthenticatedFetch: (...args: unknown[]) => privyAuthenticatedFetchMock(...args),
}));

vi.mock('@/lib/use-embedded-wallet', () => ({
  useEmbeddedWallet: () => walletState,
}));

const CONFIG: AgentMandateConfig = {
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

import { MandateCreateForm } from './MandateCreateForm';

describe('MandateCreateForm wallet bootstrap gate', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    walletRefetchMock.mockReset();
    privyAuthenticatedFetchMock.mockReset();
    privyAuthenticatedFetchMock.mockResolvedValue(
      new Response(JSON.stringify(CONFIG), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    walletState = {
      suiAddress: '0xowner',
      loading: false,
      error: null,
      refetch: walletRefetchMock,
    };
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('waits for wallet setup before fetching Agent config on direct authenticated create entry', async () => {
    walletState = {
      suiAddress: null,
      loading: true,
      error: null,
      refetch: walletRefetchMock,
    };

    await act(async () => {
      root.render(
        <MandateCreateForm
          initialIntent="auto-harvest claimable yield daily"
          onCreated={() => {}}
          showIntentPrompt={false}
        />,
      );
    });

    expect(host.textContent).toContain('Preparing your wallet');
    expect(privyAuthenticatedFetchMock).not.toHaveBeenCalled();
  });

  it('shows retry and blocks mandate approval when wallet setup fails', async () => {
    walletState = {
      suiAddress: null,
      loading: false,
      error: 'Wallet setup unavailable',
      refetch: walletRefetchMock,
    };

    await act(async () => {
      root.render(
        <MandateCreateForm
          initialIntent="auto-harvest claimable yield daily"
          initialConfig={CONFIG}
          onCreated={() => {}}
          showIntentPrompt={false}
        />,
      );
    });

    expect(host.textContent).toContain('Wallet setup unavailable');
    expect(host.textContent).toContain('Retry wallet setup');
    expect(host.textContent).not.toContain('Proposed mandate');
    expect(privyAuthenticatedFetchMock).not.toHaveBeenCalledWith(
      getAccessTokenMock,
      '/api/v1/agent/mandate/create',
      expect.anything(),
      expect.anything(),
    );
  });
});
