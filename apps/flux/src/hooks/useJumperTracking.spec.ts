import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedConfig = vi.hoisted(() => ({
  NEXT_PUBLIC_BACKEND_URL: 'https://jumper.krilly.ai/api/jumper/v1',
  NEXT_PUBLIC_JUMPER_TRACKING_ENABLED: '',
}));

vi.mock('@/config/env-config', () => ({
  default: mockedConfig,
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import { useJumperTracking } from './useJumperTracking';

describe('useJumperTracking', () => {
  beforeEach(() => {
    mockedConfig.NEXT_PUBLIC_BACKEND_URL =
      'https://jumper.krilly.ai/api/jumper/v1';
    mockedConfig.NEXT_PUBLIC_JUMPER_TRACKING_ENABLED = '';
    vi.restoreAllMocks();
  });

  it('does not send analytics requests when Jumper tracking is not enabled', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const { trackEvent, trackTransaction } = useJumperTracking();

    await trackEvent({
      action: 'page_view',
      browserFingerprint: 'fingerprint',
      category: 'navigation',
      isConnected: false,
      isMobile: false,
      label: 'home',
      sessionId: 'session',
      url: 'https://jumper.krilly.ai/en',
      value: 0,
    });
    await trackTransaction({
      action: 'swap_started',
      browserFingerprint: 'fingerprint',
      fromAmount: 1,
      fromChainId: 1,
      fromToken: 'ETH',
      isFinal: false,
      routeId: 'route-id',
      sessionId: 'session',
      toAmount: 1,
      toChainId: 1,
      toToken: 'USDC',
      transactionStatus: 'pending',
      type: 'swap',
      url: 'https://jumper.krilly.ai/en',
      walletAddress: '0xabc',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends analytics requests when Jumper tracking is explicitly enabled', async () => {
    mockedConfig.NEXT_PUBLIC_JUMPER_TRACKING_ENABLED = 'true';
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
    });
    vi.stubGlobal('fetch', fetchSpy);

    const { trackEvent } = useJumperTracking();

    await trackEvent({
      action: 'page_view',
      browserFingerprint: 'fingerprint',
      category: 'navigation',
      isConnected: false,
      isMobile: false,
      label: 'home',
      sessionId: 'session',
      url: 'https://jumper.krilly.ai/en',
      value: 0,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://jumper.krilly.ai/api/jumper/v1/users/events',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
