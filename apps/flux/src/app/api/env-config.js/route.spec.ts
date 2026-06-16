import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GET } from './route';

describe('/api/env-config.js', () => {
  const envKeys = [
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_WIDGET_INTEGRATOR',
  ] as const;
  const envBackup: Record<(typeof envKeys)[number], string | undefined> = {
    NEXT_PUBLIC_SITE_URL: undefined,
    NEXT_PUBLIC_WIDGET_INTEGRATOR: undefined,
  };

  beforeEach(() => {
    for (const key of envKeys) {
      envBackup[key] = process.env[key];
    }

    process.env.NEXT_PUBLIC_SITE_URL = 'https://xterm.fi';
    process.env.NEXT_PUBLIC_WIDGET_INTEGRATOR = 'xterm.fi';
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    }
  });

  it('returns runtime public env without CDN/browser caching', async () => {
    const response = await GET(
      new Request('https://xterm.fi/api/env-config.js'),
    );

    expect(response.headers.get('content-type')).toBe(
      'application/javascript; charset=utf-8',
    );
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');

    const body = await response.text();
    expect(body).toContain('"NEXT_PUBLIC_SITE_URL":"https://xterm.fi"');
    expect(body).toContain(
      '"NEXT_PUBLIC_BACKEND_URL":"https://xterm.fi/api/jumper/v1"',
    );
    expect(body).not.toContain('NEXT_PUBLIC_STRAPI_API_TOKEN');
  });
});
