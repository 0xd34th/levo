/**
 * @vitest-environment happy-dom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAccessTokenMock,
  privyAuthenticatedFetchMock,
  useEmbeddedWalletMock,
} = vi.hoisted(() => ({
  getAccessTokenMock: vi.fn(async () => 'access-token'),
  privyAuthenticatedFetchMock: vi.fn(),
  useEmbeddedWalletMock: vi.fn(),
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    getAccessToken: getAccessTokenMock,
  }),
}));

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
  }: {
    alt: string;
    src: string;
  }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt} src={src} />;
  },
}));

vi.mock('@/components/mobile-top-bar', () => ({
  MobileTopBar: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/lib/privy-fetch', () => ({
  privyAuthenticatedFetch: privyAuthenticatedFetchMock,
}));

vi.mock('@/lib/use-embedded-wallet', () => ({
  useEmbeddedWallet: () => useEmbeddedWalletMock(),
}));

import DepositPage from './page';

async function flushEffects() {
  await act(async () => {
    for (let i = 0; i < 4; i += 1) {
      await Promise.resolve();
    }
  });
}

function activityResponse(items: unknown[]) {
  return new Response(
    JSON.stringify({ items, nextCursor: null }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function activityItem(overrides: Partial<{
  id: string;
  txDigest: string;
  createdAt: string;
  direction: 'incoming' | 'outgoing' | 'mixed';
  amountLabel: string;
  counterpartyLabel: string;
}> = {}) {
  const id = overrides.id ?? 'incoming-digest';
  return {
    id,
    txDigest: overrides.txDigest ?? id,
    createdAt: overrides.createdAt ?? '2026-06-16T10:00:00.000Z',
    direction: overrides.direction ?? 'incoming',
    coinType: '0x2::sui::SUI',
    amount: '1000000000',
    amountLabel: overrides.amountLabel ?? '1.00 SUI',
    counterpartyLabel: overrides.counterpartyLabel ?? '0xbbbb...bbbb',
    counterpartySubLabel: 'Sender wallet',
    counterpartyAvatarUrl: null,
  };
}

describe('DepositPage received transfers', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    vi.clearAllMocks();
    vi.useFakeTimers();
    useEmbeddedWalletMock.mockReturnValue({
      suiAddress: `0x${'0'.repeat(63)}2`,
      loading: false,
      error: null,
    });
    privyAuthenticatedFetchMock.mockResolvedValue(activityResponse([]));
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
  });

  it('loads received transfers from the wallet activity API on first render', async () => {
    privyAuthenticatedFetchMock.mockResolvedValueOnce(activityResponse([
      activityItem({ id: 'incoming-digest', amountLabel: '2.00 SUI' }),
    ]));

    await act(async () => {
      root.render(<DepositPage />);
    });
    await flushEffects();

    expect(privyAuthenticatedFetchMock).toHaveBeenCalledTimes(1);
    expect(privyAuthenticatedFetchMock.mock.calls[0][1]).toBe(
      `/api/v1/activity?address=0x${'0'.repeat(63)}2&limit=20`,
    );
    expect(host.textContent).toContain('Received transfers');
    expect(host.textContent).toContain('2.00 SUI');
  });

  it('renders only incoming transfers from the activity response', async () => {
    privyAuthenticatedFetchMock.mockResolvedValueOnce(activityResponse([
      activityItem({ id: 'outgoing-digest', direction: 'outgoing', amountLabel: '3.00 SUI', counterpartyLabel: 'outgoing-wallet' }),
      activityItem({ id: 'mixed-digest', direction: 'mixed', amountLabel: 'Mixed SUI', counterpartyLabel: 'mixed-contract' }),
      activityItem({ id: 'incoming-digest', direction: 'incoming', amountLabel: '4.00 SUI', counterpartyLabel: 'incoming-wallet' }),
    ]));

    await act(async () => {
      root.render(<DepositPage />);
    });
    await flushEffects();

    expect(host.textContent).toContain('incoming-wallet');
    expect(host.textContent).toContain('4.00 SUI');
    expect(host.textContent).not.toContain('outgoing-wallet');
    expect(host.textContent).not.toContain('Mixed SUI');
  });

  it('refreshes every 15 seconds and keeps the latest incoming list', async () => {
    privyAuthenticatedFetchMock
      .mockResolvedValueOnce(activityResponse([
        activityItem({ id: 'first-digest', amountLabel: '1.00 SUI' }),
      ]))
      .mockResolvedValueOnce(activityResponse([
        activityItem({ id: 'second-digest', amountLabel: '5.00 SUI' }),
      ]));

    await act(async () => {
      root.render(<DepositPage />);
    });
    await flushEffects();
    expect(host.textContent).toContain('1.00 SUI');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await flushEffects();

    expect(privyAuthenticatedFetchMock).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('5.00 SUI');
    expect(host.textContent).not.toContain('1.00 SUI');
  });

  it('stops polling after unmount', async () => {
    await act(async () => {
      root.render(<DepositPage />);
    });
    await flushEffects();

    await act(async () => {
      root.unmount();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(privyAuthenticatedFetchMock).toHaveBeenCalledTimes(1);
  });
});
