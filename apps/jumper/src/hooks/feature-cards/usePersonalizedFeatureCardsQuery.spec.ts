import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersonalizedFeatureCardsQuery } from './usePersonalizedFeatureCardsQuery';
import { useQuery } from '@tanstack/react-query';

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
}));

vi.mock('@lifi/wallet-management', () => ({
  useAccount: () => ({
    account: {
      address: '0xabc',
    },
  }),
}));

describe('usePersonalizedFeatureCardsQuery', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL =
      'https://jumper.krilly.ai/api/jumper/v1';
    process.env.NEXT_PUBLIC_STRAPI_URL =
      'https://jumper.krilly.ai/api/jumper/strapi';
    process.env.NEXT_PUBLIC_ENVIRONMENT = 'production';
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
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

  it('loads personalized Strapi cards from the same-origin proxy without exposing auth headers', async () => {
    let capturedQueryFn: undefined | (() => Promise<unknown>);

    vi.mocked(useQuery)
      .mockImplementationOnce(() => ({
        data: [7, 8],
        isSuccess: true,
      }) as any)
      .mockImplementationOnce(((options: any) => {
        capturedQueryFn = options.queryFn;
        return {
          data: undefined,
          isSuccess: false,
        };
      }) as any);

    usePersonalizedFeatureCardsQuery();
    await capturedQueryFn?.();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      'https://jumper.krilly.ai/api/jumper/strapi/api/feature-cards',
    );
    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toBeUndefined();
  });
});
