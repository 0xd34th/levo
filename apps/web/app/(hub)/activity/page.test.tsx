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
      suiAddress: `0x${'0'.repeat(63)}2`,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('loads activity from the unified wallet activity API', async () => {
    privyAuthenticatedFetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({
        items: [
          {
            id: 'mixed-digest',
            txDigest: 'mixed-digest',
            createdAt: '2026-06-11T10:00:00.000Z',
            direction: 'mixed',
            coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
            amount: '0',
            amountLabel: 'Mixed USDC',
            counterpartyLabel: 'Self / contract',
            counterpartySubLabel: 'Wallet activity',
            counterpartyAvatarUrl: null,
          },
        ],
        nextCursor: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    await act(async () => {
      root.render(<ActivityPage />);
    });
    await flushEffects();

    expect(privyAuthenticatedFetchMock).toHaveBeenCalledTimes(1);
    expect(privyAuthenticatedFetchMock.mock.calls[0][1]).toBe(
      `/api/v1/activity?address=0x${'0'.repeat(63)}2`,
    );
    expect(host.textContent).toContain('Mixed USDC');
    expect(host.textContent).toContain('Self / contract');
  });

  it('shows activity API errors instead of a generic failure', async () => {
    privyAuthenticatedFetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({ error: 'Authentication temporarily unavailable' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    ));

    await act(async () => {
      root.render(<ActivityPage />);
    });
    await flushEffects();

    expect(host.textContent).toContain('Authentication temporarily unavailable');
    expect(host.textContent).not.toContain('Failed to load activity.');
  });

  it('filters All, Sent, and Received against the same fetched activity rows', async () => {
    privyAuthenticatedFetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify({
        items: [
          {
            id: 'sent-digest',
            txDigest: 'sent-digest',
            createdAt: '2026-06-11T12:00:00.000Z',
            direction: 'outgoing',
            coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
            amount: '1000000',
            amountLabel: '1.00 USDC',
            counterpartyLabel: '@alice',
            counterpartySubLabel: 'X recipient',
            counterpartyAvatarUrl: null,
          },
          {
            id: 'mixed-digest',
            txDigest: 'mixed-digest',
            createdAt: '2026-06-11T11:00:00.000Z',
            direction: 'mixed',
            coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
            amount: '0',
            amountLabel: 'Mixed USDC',
            counterpartyLabel: 'Self / contract',
            counterpartySubLabel: 'Wallet activity',
            counterpartyAvatarUrl: null,
          },
          {
            id: 'received-digest',
            txDigest: 'received-digest',
            createdAt: '2026-06-11T10:00:00.000Z',
            direction: 'incoming',
            coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
            amount: '2000000',
            amountLabel: '2.00 USDC',
            counterpartyLabel: '0xbbbb...bbbb',
            counterpartySubLabel: 'Sender wallet',
            counterpartyAvatarUrl: null,
          },
        ],
        nextCursor: null,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));

    await act(async () => {
      root.render(<ActivityPage />);
    });
    await flushEffects();

    expect(host.textContent).toContain('@alice');
    expect(host.textContent).toContain('Self / contract');
    expect(host.textContent).toContain('0xbbbb...bbbb');

    const sentButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'sent',
    );
    expect(sentButton).toBeTruthy();
    await act(async () => {
      sentButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).toContain('@alice');
    expect(host.textContent).not.toContain('Self / contract');
    expect(host.textContent).not.toContain('0xbbbb...bbbb');

    const receivedButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'received',
    );
    expect(receivedButton).toBeTruthy();
    await act(async () => {
      receivedButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(host.textContent).not.toContain('@alice');
    expect(host.textContent).not.toContain('Self / contract');
    expect(host.textContent).toContain('0xbbbb...bbbb');
  });

  it('loads more activity through one combined cursor and appends rows', async () => {
    privyAuthenticatedFetchMock
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          items: [
            {
              id: 'first-digest',
              txDigest: 'first-digest',
              createdAt: '2026-06-11T12:00:00.000Z',
              direction: 'outgoing',
              coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
              amount: '1000000',
              amountLabel: '1.00 USDC',
              counterpartyLabel: '@alice',
              counterpartySubLabel: 'X recipient',
              counterpartyAvatarUrl: null,
            },
          ],
          nextCursor: 'combined-cursor',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({
          items: [
            {
              id: 'second-digest',
              txDigest: 'second-digest',
              createdAt: '2026-06-10T12:00:00.000Z',
              direction: 'incoming',
              coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
              amount: '2000000',
              amountLabel: '2.00 USDC',
              counterpartyLabel: '0xbbbb...bbbb',
              counterpartySubLabel: 'Sender wallet',
              counterpartyAvatarUrl: null,
            },
          ],
          nextCursor: null,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ));

    await act(async () => {
      root.render(<ActivityPage />);
    });
    await flushEffects();

    const loadMore = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Load more activity'),
    );
    expect(loadMore).toBeTruthy();
    await act(async () => {
      loadMore!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await flushEffects();

    expect(privyAuthenticatedFetchMock.mock.calls[1][1]).toBe(
      `/api/v1/activity?address=0x${'0'.repeat(63)}2&cursor=combined-cursor`,
    );
    expect(host.textContent).toContain('@alice');
    expect(host.textContent).toContain('0xbbbb...bbbb');
  });
});
