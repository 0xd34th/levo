/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authState,
  emitAccountDataRefreshMock,
  fetchMock,
  generateAuthorizationSignatureMock,
  getAccessTokenMock,
  subscribeAccountDataRefreshMock,
} = vi.hoisted(() => ({
  authState: {
    ready: true,
    authenticated: false,
  },
  emitAccountDataRefreshMock: vi.fn<() => void>(),
  fetchMock: vi.fn(),
  generateAuthorizationSignatureMock: vi.fn(),
  getAccessTokenMock: vi.fn(),
  subscribeAccountDataRefreshMock: vi.fn<(listener: () => void) => () => void>(() => () => {}),
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
  emitAccountDataRefresh: emitAccountDataRefreshMock,
  subscribeAccountDataRefresh: subscribeAccountDataRefreshMock,
}));

import EarnPage from './page';

async function flushEffects() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
  });
}

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function summaryPayload(overrides: Partial<{
  walletReady: boolean;
  availableUsdc: string;
  depositedUsdc: string;
  claimableYieldUsdc: string;
  claimableYieldReliable: boolean;
  yieldSettlementMode: 'server_payout' | 'disabled';
  claimAllowed: boolean;
  claimMinimumYieldUsdc: string;
  claimBlockedReason: 'below_minimum_net_yield' | null;
}> = {}) {
  return {
    walletReady: true,
    availableUsdc: '5000000',
    depositedUsdc: '0',
    claimableYieldUsdc: '0',
    claimableYieldReliable: true,
    yieldSettlementMode: 'server_payout' as const,
    claimAllowed: false,
    claimMinimumYieldUsdc: '10000',
    claimBlockedReason: 'below_minimum_net_yield' as const,
    ...overrides,
  };
}

function previewPayload() {
  return {
    ...summaryPayload(),
    previewToken: 'preview-token',
    action: 'stake' as const,
    amount: '1000000',
    principalReceivesUsdc: '0',
    yieldReceivesUsdc: '0',
    userReceivesUsdc: '0',
  };
}

function amountInput(host: HTMLElement) {
  const input = host.querySelector<HTMLInputElement>('input[placeholder="0.00"]');
  if (!input) throw new Error('Amount input not found');
  return input;
}

function buttonByText(host: HTMLElement, text: string) {
  const button = Array.from(host.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  return button as HTMLButtonElement;
}

async function typeAmount(host: HTMLElement, value: string) {
  const input = amountInput(host);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flushEffects();
}

async function clickButton(host: HTMLElement, text: string) {
  await act(async () => {
    buttonByText(host, text).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flushEffects();
}

function summaryRequestCount() {
  return fetchMock.mock.calls.filter(([input]) => input === '/api/v1/earn/summary').length;
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
    emitAccountDataRefreshMock.mockReset();
    fetchMock.mockReset();
    generateAuthorizationSignatureMock.mockReset();
    getAccessTokenMock.mockReset();
    subscribeAccountDataRefreshMock.mockReset();
    subscribeAccountDataRefreshMock.mockReturnValue(() => {});
    authState.ready = true;
    authState.authenticated = false;
    getAccessTokenMock.mockResolvedValue(null);
    globalThis.fetch = fetchMock;
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
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

  it('refreshes Earn balances immediately and after settlement delays when Add funds confirms', async () => {
    authState.authenticated = true;
    getAccessTokenMock.mockResolvedValue('access-token');
    fetchMock
      .mockResolvedValueOnce(jsonResponse(summaryPayload()))
      .mockResolvedValueOnce(jsonResponse(previewPayload()))
      .mockResolvedValueOnce(jsonResponse({
        status: 'confirmed',
        action: 'stake',
        txDigest: 'confirmed-digest',
      }))
      .mockResolvedValueOnce(jsonResponse(summaryPayload()))
      .mockResolvedValueOnce(jsonResponse(summaryPayload({
        availableUsdc: '4000000',
        depositedUsdc: '1000000',
      })))
      .mockResolvedValueOnce(jsonResponse(summaryPayload({
        availableUsdc: '4000000',
        depositedUsdc: '1000000',
      })));

    await act(async () => {
      root.render(<EarnPage />);
    });
    await flushEffects();

    expect(host.textContent).toContain('$5.00');
    await typeAmount(host, '1');
    await clickButton(host, 'Add funds');

    expect(host.textContent).toContain('Review action');
    await clickButton(host, 'Continue');

    expect(host.textContent).not.toContain('Review action');
    expect(amountInput(host).value).toBe('');
    expect(host.textContent).toContain('Latest transaction');
    expect(host.textContent).toContain('confirmed-digest');
    expect(summaryRequestCount()).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await flushEffects();

    expect(summaryRequestCount()).toBe(3);
    expect(host.textContent).toContain('$4.00');
    expect(host.textContent).toContain('$1.00');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await flushEffects();

    expect(summaryRequestCount()).toBe(4);
    expect(host.textContent).toContain('$4.00');
    expect(host.textContent).toContain('$1.00');
  });

  it('schedules delayed Earn summary refreshes after an account data refresh event', async () => {
    authState.authenticated = true;
    getAccessTokenMock.mockResolvedValue('access-token');
    let accountRefreshListener: (() => void) | null = null;
    subscribeAccountDataRefreshMock.mockImplementation((listener) => {
      accountRefreshListener = listener;
      return () => {
        accountRefreshListener = null;
      };
    });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(summaryPayload()))
      .mockResolvedValueOnce(jsonResponse(summaryPayload({
        availableUsdc: '3000000',
        depositedUsdc: '2000000',
      })))
      .mockResolvedValueOnce(jsonResponse(summaryPayload({
        availableUsdc: '3000000',
        depositedUsdc: '2000000',
      })));

    await act(async () => {
      root.render(<EarnPage />);
    });
    await flushEffects();

    expect(summaryRequestCount()).toBe(1);

    act(() => {
      accountRefreshListener?.();
    });

    expect(summaryRequestCount()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    await flushEffects();

    expect(summaryRequestCount()).toBe(2);
    expect(host.textContent).toContain('$3.00');
    expect(host.textContent).toContain('$2.00');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await flushEffects();

    expect(summaryRequestCount()).toBe(3);
  });
});
