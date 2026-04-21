import { describe, expect, it } from 'vitest';
import { normalizePublicEnvVars } from './env-config';

describe('normalizePublicEnvVars', () => {
  it('normalizes browser-visible API origins and removes the public Strapi token', () => {
    const env = normalizePublicEnvVars({
      NEXT_PUBLIC_SITE_URL: 'https://jumper.krilly.ai/en',
      NEXT_PUBLIC_BACKEND_URL: 'https://api.jumper.exchange/v1',
      NEXT_PUBLIC_LIFI_BACKEND_URL: 'https://api.jumper.exchange/pipeline',
      NEXT_PUBLIC_STRAPI_URL: 'https://strapi-staging.jumper.exchange',
      NEXT_PUBLIC_STRAPI_API_TOKEN: 'secret',
      NEXT_PUBLIC_ENVIRONMENT: 'production',
      INTERNAL_ONLY_SECRET: 'hidden',
    });

    expect(env).toMatchObject({
      NEXT_PUBLIC_SITE_URL: 'https://jumper.krilly.ai/en',
      NEXT_PUBLIC_BACKEND_URL: 'https://jumper.krilly.ai/api/jumper/v1',
      NEXT_PUBLIC_LIFI_BACKEND_URL:
        'https://jumper.krilly.ai/api/jumper/pipeline',
      NEXT_PUBLIC_STRAPI_URL: 'https://jumper.krilly.ai/api/jumper/strapi',
      NEXT_PUBLIC_ENVIRONMENT: 'production',
    });
    expect(env).not.toHaveProperty('NEXT_PUBLIC_STRAPI_API_TOKEN');
  });

  it('falls back to relative same-origin proxy paths when site url is missing', () => {
    const env = normalizePublicEnvVars({
      NEXT_PUBLIC_ENVIRONMENT: 'development',
    });

    expect(env.NEXT_PUBLIC_BACKEND_URL).toBe('/api/jumper/v1');
    expect(env.NEXT_PUBLIC_LIFI_BACKEND_URL).toBe('/api/jumper/pipeline');
    expect(env.NEXT_PUBLIC_STRAPI_URL).toBe('/api/jumper/strapi');
  });
});
