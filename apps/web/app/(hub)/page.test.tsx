/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAccessTokenMock,
  initOAuthMock,
  privyAuthenticatedFetchMock,
  subscribeAccountDataRefreshMock,
} = vi.hoisted(() => ({
  getAccessTokenMock: vi.fn(async () => 'access-token'),
  initOAuthMock: vi.fn(),
  privyAuthenticatedFetchMock: vi.fn(),
  subscribeAccountDataRefreshMock: vi.fn(() => () => {}),
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
    getAccessToken: getAccessTokenMock,
  }),
}));

vi.mock('@/lib/privy-fetch', () => ({
  privyAuthenticatedFetch: privyAuthenticatedFetchMock,
}));

vi.mock('@/lib/use-embedded-wallet', () => ({
  useEmbeddedWallet: () => ({
    suiAddress: `0x${'0'.repeat(63)}2`,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/lib/account-refresh', () => ({
  subscribeAccountDataRefresh: subscribeAccountDataRefreshMock,
}));

vi.mock('@/components/balance-display', () => ({
  BalanceDisplay: () => <div>BalanceDisplay</div>,
}));

vi.mock('@/components/action-button-row', () => ({
  ActionButtonRow: () => <div>ActionButtonRow</div>,
}));

vi.mock('@/components/agent/HomeAgentRail', () => ({
  HomeAgentRail: () => <div>HomeAgentRail</div>,
}));

vi.mock('@/components/feature-grid', () => ({
  FeatureGrid: () => <div>FeatureGrid</div>,
}));

vi.mock('@/components/promo-card', () => ({
  PromoCard: () => <div>PromoCard</div>,
}));

vi.mock('@/components/wordmark', () => ({
  Wordmark: () => <div>Wordmark</div>,
}));

vi.mock('@/components/payment-table', () => ({
  PaymentTable: ({
    rows,
  }: {
    rows: Array<{ counterpartyLabel: string; amount: string }>;
  }) => (
    <div>
      {rows.map((row) => (
        <div key={`${row.counterpartyLabel}-${row.amount}`}>
          {row.counterpartyLabel} {row.amount}
        </div>
      ))}
    </div>
  ),
}));

import AccountPage from './page';

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('AccountPage recent activity', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
    subscribeAccountDataRefreshMock.mockReturnValue(() => {});
    privyAuthenticatedFetchMock.mockResolvedValue(new Response(
      JSON.stringify({
        items: [
          {
            id: 'recent-digest',
            txDigest: 'recent-digest',
            createdAt: '2026-06-11T12:00:00.000Z',
            direction: 'incoming',
            coinType: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
            amount: '1000000',
            amountLabel: '1.00 USDC',
            counterpartyLabel: '0xbbbb...bbbb',
            counterpartySubLabel: 'Sender wallet',
            counterpartyAvatarUrl: null,
          },
        ],
        nextCursor: 'ignored-for-home',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it('uses the unified activity API with a five-row limit', async () => {
    await act(async () => {
      root.render(<AccountPage />);
    });
    await flushEffects();

    expect(privyAuthenticatedFetchMock).toHaveBeenCalledTimes(1);
    expect(privyAuthenticatedFetchMock.mock.calls[0][1]).toBe(
      `/api/v1/activity?address=0x${'0'.repeat(63)}2&limit=5`,
    );
    expect(host.textContent).toContain('0xbbbb...bbbb 1.00 USDC');
  });
});
