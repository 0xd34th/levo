import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STRAPI_FEATURE_CARDS } from '@/const/strapiContentKeys';
import { useStrapi } from './useStrapi';
import { useQuery } from '@tanstack/react-query';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

describe('useStrapi', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRAPI_URL =
      'https://jumper.krilly.ai/api/jumper/strapi';
    process.env.NEXT_PUBLIC_ENVIRONMENT = 'production';
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [], meta: {} }), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }),
    ) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.clearAllMocks();
  });

  it('fetches feature-card content through the same-origin Strapi proxy without authorization headers', async () => {
    let capturedQueryFn: undefined | (() => Promise<unknown>);

    vi.mocked(useQuery).mockImplementation(((options: any) => {
      capturedQueryFn = options.queryFn;
      return {
        data: undefined,
        isSuccess: false,
        isLoading: false,
        isRefetching: false,
        isFetching: false,
      };
    }) as any);

    useStrapi({
      contentType: STRAPI_FEATURE_CARDS,
      filterPersonalFeatureCards: {
        enabled: true,
        account: {
          isConnected: true,
        } as any,
      },
      queryKey: ['feature-cards'],
    });

    await capturedQueryFn?.();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      'https://jumper.krilly.ai/api/jumper/strapi/api/feature-cards',
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toBeUndefined();
  });
});
