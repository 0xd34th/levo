import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getApiUrl', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_LIFI_BACKEND_URL =
      'https://jumper.krilly.ai/api/jumper/pipeline';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
    process.env = { ...envBackup };
  });

  it('uses the same-origin pipeline endpoint in the browser', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        _env_: {
          NEXT_PUBLIC_LIFI_BACKEND_URL:
            'https://jumper.krilly.ai/api/jumper/pipeline',
        },
        localStorage: {
          getItem: vi.fn().mockReturnValue(null),
        },
      },
      configurable: true,
      writable: true,
    });

    const { default: getApiUrl } = await import('./getApiUrl');

    expect(getApiUrl()).toBe('https://jumper.krilly.ai/api/jumper/pipeline/v1');
  });

  it('adds the beta suffix when the browser opt-in is enabled', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        _env_: {
          NEXT_PUBLIC_LIFI_BACKEND_URL:
            'https://jumper.krilly.ai/api/jumper/pipeline',
        },
        localStorage: {
          getItem: vi.fn().mockReturnValue('true'),
        },
      },
      configurable: true,
      writable: true,
    });

    const { default: getApiUrl } = await import('./getApiUrl');

    expect(getApiUrl()).toBe(
      'https://jumper.krilly.ai/api/jumper/pipeline/beta/v1',
    );
  });
});
